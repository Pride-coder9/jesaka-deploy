<?php
/** /api/settings — read for all users; update + locations for admins. */

function route_settings($method, $rest, $body) {
    authenticate();
    $sub = $rest[0] ?? '';

    // GET /settings
    if ($method === 'GET' && count($rest) === 0) {
        $settings = [];
        foreach (all('SELECT skey, svalue FROM settings') as $r) $settings[$r['skey']] = $r['svalue'];
        $locations = all('SELECT * FROM locations ORDER BY id');
        json_out(['settings' => $settings, 'locations' => $locations]);
    }

    // PUT /settings
    if ($method === 'PUT' && count($rest) === 0) {
        require_admin();
        $b = validate($body, [
            'store_name'    => ['type' => 'string', 'trim' => true, 'min' => 2],
            'store_phone'   => ['type' => 'string', 'trim' => true],
            'store_address' => ['type' => 'string', 'trim' => true],
            'currency'      => ['type' => 'string', 'trim' => true, 'min' => 2, 'max' => 6],
            'costing_method' => ['type' => 'enum', 'values' => ['weighted_average', 'fifo']],
            'default_sales_location_id' => ['type' => 'int', 'positive' => true],
            'receipt_footer' => ['type' => 'string', 'trim' => true],
        ], true);

        $before = [];
        foreach (all('SELECT skey, svalue FROM settings') as $r) $before[$r['skey']] = $r['svalue'];
        if (isset($b['default_sales_location_id']) &&
            !one('SELECT id FROM locations WHERE id = ?', [$b['default_sales_location_id']])) {
            error_out('Selected sales location does not exist', 400);
        }
        foreach ($b as $k => $v) inv_set_setting($k, $v);
        $after = [];
        foreach (all('SELECT skey, svalue FROM settings') as $r) $after[$r['skey']] = $r['svalue'];
        audit('update', 'settings', 'store', $before, $after);
        json_out(['settings' => $after]);
    }

    // POST /settings/reset-data — delete ALL business data, back to zero.
    // Keeps user accounts, roles, locations and store settings so the store
    // stays usable and you stay logged in.
    if ($method === 'POST' && $sub === 'reset-data') {
        require_admin();
        if (($body['confirm'] ?? '') !== 'DELETE') error_out('Type DELETE to confirm the reset', 400);
        $pdo = db();
        $tables = ['return_items', 'returns', 'payments', 'sale_items', 'sales',
            'stock_receipt_items', 'stock_receipts', 'stock_adjustments', 'stock_movements',
            'cost_layers', 'inventory_balances', 'expenses', 'pl_summaries', 'products', 'suppliers', 'audit_logs'];
        $pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
        foreach ($tables as $t) { $pdo->exec("DELETE FROM $t"); $pdo->exec("ALTER TABLE $t AUTO_INCREMENT = 1"); }
        $pdo->exec('SET FOREIGN_KEY_CHECKS = 1');
        audit('reset', 'data', 'all', null, ['note' => 'All business data deleted; store reset to zero']);
        json_out(['message' => 'All products, suppliers, stock, sales and history have been deleted. The store is reset to zero.']);
    }

    // POST /settings/locations
    if ($method === 'POST' && $sub === 'locations') {
        require_admin();
        $b = validate($body, [
            'name' => ['type' => 'string', 'trim' => true, 'min' => 2, 'required' => true, 'message' => 'Location name is required'],
            'is_sales_point' => ['type' => 'int', 'min' => 0, 'max' => 1, 'default' => 0],
        ]);
        q('INSERT INTO locations (name, is_sales_point) VALUES (?, ?)', [$b['name'], $b['is_sales_point'] ?? 0]);
        $created = one('SELECT * FROM locations WHERE id = ?', [last_id()]);
        audit('create', 'location', $created['id'], null, $created);
        json_out($created, 201);
    }
}
