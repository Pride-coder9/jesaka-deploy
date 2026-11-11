<?php
/** /api/products — catalogue, POS lookup, admin create/update. */

function product_make_sku($name, $bag) {
    $base = preg_replace('/[^A-Z0-9]+/', '', strtoupper($name));
    $base = $base === '' ? 'RICE' : substr($base, 0, 6);
    $suffix = strtoupper(substr(base_convert((string) (int) (microtime(true) * 1000), 10, 36), -4));
    return "JRC-$base-" . round($bag) . "KG-$suffix";
}

function product_schema($partial = false) {
    return [
        'name'          => ['type' => 'string', 'trim' => true, 'min' => 2, 'required' => !$partial, 'message' => 'Rice name is required'],
        'brand'         => ['type' => 'string', 'trim' => true, 'nullable' => true],
        'bag_weight_kg' => ['type' => 'number', 'positive' => true, 'required' => !$partial, 'message' => 'Bag weight must be positive'],
        'buying_price'  => ['type' => 'number', 'min' => 0, 'required' => !$partial],
        'selling_price' => ['type' => 'number', 'min' => 0, 'required' => !$partial],
        'supplier_id'   => ['type' => 'int', 'nullable' => true],
        'reorder_level' => ['type' => 'int', 'min' => 0, 'default' => 10],
        'sku'           => ['type' => 'string', 'trim' => true, 'min' => 3, 'max' => 40, 'nullable' => true],
        'is_active'     => ['type' => 'int', 'min' => 0, 'max' => 1],
    ];
}

function route_products($method, $rest, $body) {
    authenticate();

    // GET /products/lookup
    if ($method === 'GET' && ($rest[0] ?? '') === 'lookup') {
        $code = trim((string) ($_GET['code'] ?? ''));
        if ($code === '') error_out('code query parameter is required', 400);
        $locId = inv_default_sales_location_id();
        $p = one(
            'SELECT p.id, p.sku, p.name, p.brand, p.bag_weight_kg, p.selling_price, p.is_active,
                COALESCE((SELECT qty FROM inventory_balances b WHERE b.product_id = p.id AND b.location_id = ?), 0) AS available_qty
             FROM products p WHERE (upper(p.sku) = upper(?) OR upper(p.qr_payload) = upper(?))',
            [$locId, $code, $code]
        );
        if (!$p) error_out("No product found for code \"$code\"", 404);
        if (!$p['is_active']) error_out("{$p['name']} is deactivated and cannot be sold", 400);
        $p['id'] = (int) $p['id'];
        $p['available_qty'] = (int) $p['available_qty'];
        json_out($p);
    }

    // Collection: GET list / POST create
    if (count($rest) === 0) {
        if ($method === 'GET') {
            $search = (string) ($_GET['search'] ?? '');
            $active = (string) ($_GET['active'] ?? '');
            $page   = max(1, (int) ($_GET['page'] ?? 1));
            $limit  = min(100, max(1, (int) ($_GET['limit'] ?? 20)));
            $off    = ($page - 1) * $limit;
            $like   = "%$search%";
            $where  = "WHERE (? = '' OR p.name LIKE ? OR p.sku LIKE ? OR COALESCE(p.brand,'') LIKE ?)
                       AND (? = '' OR p.is_active = ?)";
            $args = [$search, $like, $like, $like, $active, (int) $active];
            $total = (int) scalar("SELECT COUNT(*) FROM products p $where", $args);
            $rows = all(
                "SELECT p.*, s.name AS supplier_name,
                    COALESCE((SELECT SUM(b.qty) FROM inventory_balances b WHERE b.product_id = p.id), 0) AS total_qty,
                    COALESCE((SELECT SUM(b.qty * b.avg_cost) FROM inventory_balances b WHERE b.product_id = p.id), 0) AS stock_value
                 FROM products p LEFT JOIN suppliers s ON s.id = p.supplier_id
                 $where ORDER BY p.name, p.bag_weight_kg LIMIT $limit OFFSET $off", $args);
            json_out(['data' => $rows, 'total' => $total, 'page' => $page, 'pages' => (int) ceil($total / $limit)]);
        }
        if ($method === 'POST') {
            require_admin();
            $b = validate($body, product_schema(false));
            $sku = strtoupper($b['sku'] ?? product_make_sku($b['name'], $b['bag_weight_kg']));
            q('INSERT INTO products (sku, qr_payload, name, brand, bag_weight_kg, buying_price, selling_price, supplier_id, reorder_level)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [$sku, $sku, $b['name'], $b['brand'] ?? null, $b['bag_weight_kg'], $b['buying_price'],
                 $b['selling_price'], $b['supplier_id'] ?? null, $b['reorder_level'] ?? 10]);
            $created = one('SELECT * FROM products WHERE id = ?', [last_id()]);
            audit('create', 'product', $created['id'], null, $created);
            json_out($created, 201);
        }
    }

    // Item: /products/{id}
    if (isset($rest[0]) && ctype_digit((string) $rest[0]) && count($rest) === 1) {
        $id = (int) $rest[0];
        if ($method === 'GET') {
            $p = one('SELECT p.*, s.name AS supplier_name FROM products p LEFT JOIN suppliers s ON s.id = p.supplier_id WHERE p.id = ?', [$id]);
            if (!$p) error_out('Product not found', 404);
            $p['stock'] = all('SELECT l.name AS location, b.qty, b.avg_cost FROM inventory_balances b
                               JOIN locations l ON l.id = b.location_id WHERE b.product_id = ?', [$id]);
            $p['recent_movements'] = all(
                'SELECT m.*, l.name AS location, u.full_name AS user_name FROM stock_movements m
                 JOIN locations l ON l.id = m.location_id LEFT JOIN users u ON u.id = m.user_id
                 WHERE m.product_id = ? ORDER BY m.created_at DESC, m.id DESC LIMIT 15', [$id]);
            json_out($p);
        }
        if ($method === 'PUT') {
            require_admin();
            $before = one('SELECT * FROM products WHERE id = ?', [$id]);
            if (!$before) error_out('Product not found', 404);
            $patch = validate($body, product_schema(true), true);
            $b = array_merge($before, $patch);
            q("UPDATE products SET name=?, brand=?, bag_weight_kg=?, buying_price=?, selling_price=?,
                supplier_id=?, reorder_level=?, is_active=?, updated_at=NOW() WHERE id=?",
                [$b['name'], $b['brand'] ?: null, $b['bag_weight_kg'], $b['buying_price'], $b['selling_price'],
                 $b['supplier_id'] ?: null, $b['reorder_level'],
                 array_key_exists('is_active', $patch) ? $patch['is_active'] : $before['is_active'], $id]);
            $after = one('SELECT * FROM products WHERE id = ?', [$id]);
            audit('update', 'product', $id, $before, $after);
            json_out($after);
        }
    }
}
