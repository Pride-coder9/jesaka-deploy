<?php
/** /api/stock — receipts (goods in), adjustments, movements, balances. Admin only. */

function stock_validate_items($items) {
    if (!is_array($items) || count($items) === 0) {
        throw new ValidationError([['field' => 'items', 'message' => 'At least one line item is required']]);
    }
    $out = [];
    $errors = [];
    foreach ($items as $i => $it) {
        $pid = isset($it['product_id']) && is_numeric($it['product_id']) ? (int) $it['product_id'] : 0;
        $qty = isset($it['qty']) && is_numeric($it['qty']) ? (int) $it['qty'] : 0;
        $cost = isset($it['unit_cost']) && is_numeric($it['unit_cost']) ? (float) $it['unit_cost'] : -1;
        if ($pid <= 0) $errors[] = ['field' => "items.$i.product_id", 'message' => 'Product is required'];
        if ($qty <= 0) $errors[] = ['field' => "items.$i.qty", 'message' => 'Quantity must be at least 1'];
        if ($cost < 0) $errors[] = ['field' => "items.$i.unit_cost", 'message' => 'Unit cost must be 0 or more'];
        $out[] = ['product_id' => $pid, 'qty' => $qty, 'unit_cost' => $cost];
    }
    if ($errors) throw new ValidationError($errors);
    return $out;
}

function route_stock($method, $rest, $body) {
    global $USER;
    authenticate();
    require_admin();
    $section = $rest[0] ?? '';

    // ---------- Receipts ----------
    if ($section === 'receipts') {
        if (isset($rest[1]) && ctype_digit((string) $rest[1]) && $method === 'GET') {
            $id = (int) $rest[1];
            $r = one('SELECT r.*, s.name AS supplier_name, l.name AS location_name, u.full_name AS received_by_name
                      FROM stock_receipts r LEFT JOIN suppliers s ON s.id = r.supplier_id
                      JOIN locations l ON l.id = r.location_id JOIN users u ON u.id = r.received_by WHERE r.id = ?', [$id]);
            if (!$r) error_out('Receipt not found', 404);
            $r['items'] = all('SELECT i.*, p.name, p.sku, p.bag_weight_kg FROM stock_receipt_items i
                               JOIN products p ON p.id = i.product_id WHERE i.receipt_id = ?', [$id]);
            json_out($r);
        }
        if ($method === 'GET') {
            $from = (string) ($_GET['from'] ?? '');
            $to   = (string) ($_GET['to'] ?? '');
            $sup  = (string) ($_GET['supplier_id'] ?? '');
            $page = max(1, (int) ($_GET['page'] ?? 1));
            $lim  = min(100, max(1, (int) ($_GET['limit'] ?? 20)));
            $off  = ($page - 1) * $lim;
            $where = "WHERE (? = '' OR DATE(r.received_at) >= ?) AND (? = '' OR DATE(r.received_at) <= ?)
                      AND (? = '' OR r.supplier_id = ?)";
            $args = [$from, $from, $to, $to, $sup, (int) $sup];
            $total = (int) scalar("SELECT COUNT(*) FROM stock_receipts r $where", $args);
            $rows = all("SELECT r.*, s.name AS supplier_name, l.name AS location_name, u.full_name AS received_by_name,
                    (SELECT SUM(i.qty) FROM stock_receipt_items i WHERE i.receipt_id = r.id) AS total_bags
                 FROM stock_receipts r LEFT JOIN suppliers s ON s.id = r.supplier_id
                 JOIN locations l ON l.id = r.location_id JOIN users u ON u.id = r.received_by
                 $where ORDER BY r.received_at DESC, r.id DESC LIMIT $lim OFFSET $off", $args);
            json_out(['data' => $rows, 'total' => $total, 'page' => $page, 'pages' => (int) ceil($total / $lim)]);
        }
        if ($method === 'POST') {
            $b = validate($body, [
                'supplier_id'    => ['type' => 'int', 'positive' => true, 'nullable' => true],
                'location_id'    => ['type' => 'int', 'positive' => true, 'required' => true],
                'invoice_ref'    => ['type' => 'string', 'trim' => true, 'nullable' => true],
                'transport_cost' => ['type' => 'number', 'min' => 0, 'default' => 0],
                'other_cost'     => ['type' => 'number', 'min' => 0, 'default' => 0],
                'notes'          => ['type' => 'string', 'trim' => true, 'nullable' => true],
                'received_at'    => ['type' => 'string', 'trim' => true, 'nullable' => true],
            ]);
            $items = stock_validate_items($body['items'] ?? null);

            $pdo = db();
            $pdo->beginTransaction();
            try {
                $goodsCost = 0;
                foreach ($items as $i) $goodsCost += $i['qty'] * $i['unit_cost'];
                $extras = ($b['transport_cost'] ?? 0) + ($b['other_cost'] ?? 0);
                $number = inv_next_doc_number('JRR', 'stock_receipts', 'receipt_number');
                q('INSERT INTO stock_receipts (receipt_number, supplier_id, location_id, invoice_ref, transport_cost, other_cost, goods_cost, total_cost, notes, received_by, received_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, NOW()))',
                    [$number, $b['supplier_id'] ?? null, $b['location_id'], $b['invoice_ref'] ?? null,
                     $b['transport_cost'] ?? 0, $b['other_cost'] ?? 0, $goodsCost, $goodsCost + $extras,
                     $b['notes'] ?? null, $USER['id'], $b['received_at'] ?? null]);
                $receiptId = last_id();
                foreach ($items as $item) {
                    $lineTotal = $item['qty'] * $item['unit_cost'];
                    $share = $goodsCost > 0 ? $lineTotal / $goodsCost : 1 / count($items);
                    $landedUnit = $item['unit_cost'] + ($extras * $share) / $item['qty'];
                    q('INSERT INTO stock_receipt_items (receipt_id, product_id, qty, unit_cost, landed_unit_cost, line_total)
                       VALUES (?, ?, ?, ?, ?, ?)', [$receiptId, $item['product_id'], $item['qty'], $item['unit_cost'], $landedUnit, $lineTotal]);
                    inv_add_stock([
                        'productId' => $item['product_id'], 'locationId' => $b['location_id'], 'qty' => $item['qty'],
                        'unitCost' => $landedUnit, 'movementType' => 'receipt', 'referenceType' => 'stock_receipt',
                        'referenceId' => $receiptId, 'userId' => $USER['id'], 'createdAt' => $b['received_at'] ?? null,
                    ]);
                }
                $result = one('SELECT * FROM stock_receipts WHERE id = ?', [$receiptId]);
                $pdo->commit();
            } catch (Throwable $e) { $pdo->rollBack(); throw $e; }
            audit('create', 'stock_receipt', $result['id'], null, array_merge($result, ['items' => $items]));
            json_out($result, 201);
        }
    }

    // ---------- Adjustments ----------
    if ($section === 'adjustments') {
        if ($method === 'GET') {
            $rows = all("SELECT a.*, p.name AS product_name, p.bag_weight_kg, l.name AS location_name, u.full_name AS adjusted_by_name
                FROM stock_adjustments a JOIN products p ON p.id = a.product_id
                JOIN locations l ON l.id = a.location_id JOIN users u ON u.id = a.adjusted_by
                ORDER BY a.created_at DESC, a.id DESC LIMIT 200");
            json_out(['data' => $rows]);
        }
        if ($method === 'POST') {
            $b = validate($body, [
                'product_id'  => ['type' => 'int', 'positive' => true, 'required' => true],
                'location_id' => ['type' => 'int', 'positive' => true, 'required' => true],
                'qty_change'  => ['type' => 'int', 'required' => true],
                'reason_type' => ['type' => 'enum', 'values' => ['spoilage', 'damage', 'theft', 'return_to_supplier', 'correction'], 'required' => true],
                'reason'      => ['type' => 'string', 'trim' => true, 'min' => 3, 'required' => true, 'message' => 'A reason is required for every adjustment'],
            ]);
            if ($b['qty_change'] == 0) throw new ValidationError([['field' => 'qty_change', 'message' => 'Quantity change cannot be zero']]);

            $pdo = db();
            $pdo->beginTransaction();
            try {
                $number = inv_next_doc_number('JRA', 'stock_adjustments', 'adjustment_number');
                $isLoss = in_array($b['reason_type'], ['spoilage', 'damage', 'theft'], true);
                if ($b['qty_change'] < 0) {
                    $out = inv_remove_stock([
                        'productId' => $b['product_id'], 'locationId' => $b['location_id'], 'qty' => -$b['qty_change'],
                        'movementType' => $isLoss ? 'write_off' : 'adjustment', 'referenceType' => 'stock_adjustment',
                        'reason' => "{$b['reason_type']}: {$b['reason']}", 'userId' => $USER['id'],
                    ]);
                    $unitCost = $out['unitCost']; $totalCost = $out['totalCost'];
                } else {
                    $bal = inv_ensure_balance($b['product_id'], $b['location_id']);
                    $unitCost = (float) $bal['avg_cost'];
                    if ($unitCost <= 0) {
                        $bp = one('SELECT buying_price FROM products WHERE id = ?', [$b['product_id']]);
                        $unitCost = $bp ? (float) $bp['buying_price'] : 0;
                    }
                    $totalCost = $unitCost * $b['qty_change'];
                    inv_add_stock([
                        'productId' => $b['product_id'], 'locationId' => $b['location_id'], 'qty' => $b['qty_change'],
                        'unitCost' => $unitCost, 'movementType' => 'adjustment', 'referenceType' => 'stock_adjustment',
                        'reason' => "{$b['reason_type']}: {$b['reason']}", 'userId' => $USER['id'],
                    ]);
                }
                q('INSERT INTO stock_adjustments (adjustment_number, product_id, location_id, qty_change, reason_type, reason, unit_cost, total_cost, adjusted_by)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [$number, $b['product_id'], $b['location_id'], $b['qty_change'], $b['reason_type'], $b['reason'], $unitCost, $totalCost, $USER['id']]);
                $result = one('SELECT * FROM stock_adjustments WHERE id = ?', [last_id()]);
                $pdo->commit();
            } catch (Throwable $e) { $pdo->rollBack(); throw $e; }
            audit('adjust', 'stock_adjustment', $result['id'], null, $result);
            json_out($result, 201);
        }
    }

    // ---------- Movements ----------
    if ($section === 'movements' && $method === 'GET') {
        $pid  = (string) ($_GET['product_id'] ?? '');
        $type = (string) ($_GET['type'] ?? '');
        $from = (string) ($_GET['from'] ?? '');
        $to   = (string) ($_GET['to'] ?? '');
        $page = max(1, (int) ($_GET['page'] ?? 1));
        $lim  = min(100, max(1, (int) ($_GET['limit'] ?? 30)));
        $off  = ($page - 1) * $lim;
        $where = "WHERE (? = '' OR m.product_id = ?) AND (? = '' OR m.movement_type = ?)
                  AND (? = '' OR DATE(m.created_at) >= ?) AND (? = '' OR DATE(m.created_at) <= ?)";
        $args = [$pid, (int) $pid, $type, $type, $from, $from, $to, $to];
        $total = (int) scalar("SELECT COUNT(*) FROM stock_movements m $where", $args);
        $rows = all("SELECT m.*, p.name AS product_name, p.sku, p.bag_weight_kg, l.name AS location_name, u.full_name AS user_name
            FROM stock_movements m JOIN products p ON p.id = m.product_id
            JOIN locations l ON l.id = m.location_id LEFT JOIN users u ON u.id = m.user_id
            $where ORDER BY m.created_at DESC, m.id DESC LIMIT $lim OFFSET $off", $args);
        json_out(['data' => $rows, 'total' => $total, 'page' => $page, 'pages' => (int) ceil($total / $lim)]);
    }

    // ---------- Balances ----------
    if ($section === 'balances' && $method === 'GET') {
        $rows = all("SELECT b.*, p.name AS product_name, p.sku, p.bag_weight_kg, p.reorder_level, p.is_active,
                l.name AS location_name, (b.qty * b.avg_cost) AS stock_value
            FROM inventory_balances b JOIN products p ON p.id = b.product_id JOIN locations l ON l.id = b.location_id
            ORDER BY p.name, l.name");
        json_out(['data' => $rows]);
    }
}
