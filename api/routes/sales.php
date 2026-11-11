<?php
/** /api/sales — complete a sale (immutable), list, view. Workers see only their own. */

function sale_load($id) {
    $s = one('SELECT s.*, u.full_name AS worker_name, l.name AS location_name
              FROM sales s JOIN users u ON u.id = s.worker_id JOIN locations l ON l.id = s.location_id
              WHERE s.id = ?', [$id]);
    if (!$s) return null;
    $s['items']    = all('SELECT i.*, p.name, p.sku, p.bag_weight_kg FROM sale_items i JOIN products p ON p.id = i.product_id WHERE i.sale_id = ?', [$id]);
    $s['payments'] = all('SELECT * FROM payments WHERE sale_id = ?', [$id]);
    $s['returns']  = all('SELECT r.return_number, r.refund_total, r.created_at FROM returns r WHERE r.sale_id = ?', [$id]);
    return $s;
}

function route_sales($method, $rest, $body) {
    global $USER;
    authenticate();

    // POST /sales
    if ($method === 'POST' && count($rest) === 0) {
        $b = validate($body, [
            'payment_method'    => ['type' => 'enum', 'values' => ['cash', 'mobile_money', 'bank', 'credit'], 'required' => true],
            'payment_reference' => ['type' => 'string', 'trim' => true, 'nullable' => true],
            'customer_name'     => ['type' => 'string', 'trim' => true, 'nullable' => true],
            'customer_phone'    => ['type' => 'string', 'trim' => true, 'nullable' => true],
        ]);
        $rawItems = $body['items'] ?? null;
        if (!is_array($rawItems) || count($rawItems) === 0) {
            throw new ValidationError([['field' => 'items', 'message' => 'Add at least one item to the sale']]);
        }
        $items = [];
        foreach ($rawItems as $i => $it) {
            $pid = isset($it['product_id']) && is_numeric($it['product_id']) ? (int) $it['product_id'] : 0;
            $qty = isset($it['qty']) && is_numeric($it['qty']) ? (int) $it['qty'] : 0;
            if ($pid <= 0 || $qty <= 0) throw new ValidationError([['field' => "items.$i", 'message' => 'Quantity must be at least 1']]);
            $items[] = ['product_id' => $pid, 'qty' => $qty];
        }

        $pdo = db();
        $pdo->beginTransaction();
        try {
            $locationId = inv_default_sales_location_id();
            $number = inv_next_doc_number('JRS', 'sales', 'sale_number');
            q('INSERT INTO sales (sale_number, worker_id, location_id, customer_name, customer_phone, subtotal, total, total_cost, payment_method)
               VALUES (?, ?, ?, ?, ?, 0, 0, 0, ?)',
                [$number, $USER['id'], $locationId, $b['customer_name'] ?? null, $b['customer_phone'] ?? null, $b['payment_method']]);
            $saleId = last_id();

            // Merge duplicate lines of the same product
            $merged = [];
            foreach ($items as $it) $merged[$it['product_id']] = ($merged[$it['product_id']] ?? 0) + $it['qty'];

            $subtotal = 0; $totalCost = 0;
            foreach ($merged as $productId => $qty) {
                $p = one('SELECT * FROM products WHERE id = ?', [$productId]);
                if (!$p) throw http_error(400, "Product #$productId not found");
                if (!$p['is_active']) throw http_error(400, "{$p['name']} is deactivated and cannot be sold");
                $out = inv_remove_stock([
                    'productId' => $productId, 'locationId' => $locationId, 'qty' => $qty, 'movementType' => 'sale',
                    'referenceType' => 'sale', 'referenceId' => $saleId, 'userId' => $USER['id'],
                ]);
                $lineTotal = $qty * (float) $p['selling_price'];
                q('INSERT INTO sale_items (sale_id, product_id, qty, unit_price, unit_cost, line_total, line_cost)
                   VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [$saleId, $productId, $qty, $p['selling_price'], $out['unitCost'], $lineTotal, $qty * $out['unitCost']]);
                $subtotal += $lineTotal;
                $totalCost += $qty * $out['unitCost'];
            }

            q('UPDATE sales SET subtotal = ?, total = ?, total_cost = ? WHERE id = ?', [$subtotal, $subtotal, $totalCost, $saleId]);
            q('INSERT INTO payments (sale_id, method, amount, reference, received_by) VALUES (?, ?, ?, ?, ?)',
                [$saleId, $b['payment_method'], $subtotal, $b['payment_reference'] ?? null, $USER['id']]);
            $pdo->commit();
        } catch (Throwable $e) { $pdo->rollBack(); throw $e; }

        $created = sale_load($saleId);
        audit('create', 'sale', $saleId, null, ['sale_number' => $created['sale_number'], 'total' => $created['total'], 'items' => count($created['items'])]);
        json_out($created, 201);
    }

    // GET /sales/{id}
    if ($method === 'GET' && isset($rest[0]) && ctype_digit((string) $rest[0])) {
        $s = sale_load((int) $rest[0]);
        if (!$s) error_out('Sale not found', 404);
        if ($USER['role_name'] !== 'admin' && (int) $s['worker_id'] !== $USER['id']) {
            error_out('You can only view your own sales', 403);
        }
        json_out($s);
    }

    // GET /sales
    if ($method === 'GET' && count($rest) === 0) {
        $isAdmin = $USER['role_name'] === 'admin';
        $from   = (string) ($_GET['from'] ?? '');
        $to     = (string) ($_GET['to'] ?? '');
        $method_f = (string) ($_GET['method'] ?? '');
        $search = (string) ($_GET['search'] ?? '');
        $page   = max(1, (int) ($_GET['page'] ?? 1));
        $lim    = min(100, max(1, (int) ($_GET['limit'] ?? 20)));
        $off    = ($page - 1) * $lim;
        $workerFilter = $isAdmin ? (string) ($_GET['worker_id'] ?? '') : (string) $USER['id'];
        $like = "%$search%";
        $where = "WHERE (? = '' OR DATE(s.created_at) >= ?) AND (? = '' OR DATE(s.created_at) <= ?)
                  AND (? = '' OR s.worker_id = ?) AND (? = '' OR s.payment_method = ?)
                  AND (? = '' OR s.sale_number LIKE ? OR COALESCE(s.customer_name,'') LIKE ?)";
        $args = [$from, $from, $to, $to, $workerFilter, (int) $workerFilter, $method_f, $method_f, $search, $like, $like];
        $total = (int) scalar("SELECT COUNT(*) FROM sales s $where", $args);
        $sum   = (float) scalar("SELECT COALESCE(SUM(s.total),0) FROM sales s $where", $args);
        $rows = all("SELECT s.id, s.sale_number, s.customer_name, s.total, s.total_cost, s.payment_method, s.created_at,
                u.full_name AS worker_name,
                (SELECT SUM(i.qty) FROM sale_items i WHERE i.sale_id = s.id) AS total_bags
             FROM sales s JOIN users u ON u.id = s.worker_id
             $where ORDER BY s.created_at DESC, s.id DESC LIMIT $lim OFFSET $off", $args);
        json_out(['data' => $rows, 'total' => $total, 'total_amount' => $sum, 'page' => $page, 'pages' => (int) ceil($total / $lim)]);
    }
}
