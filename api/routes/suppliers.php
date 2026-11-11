<?php
/** /api/suppliers — admin-only supplier directory. */

function supplier_schema($partial = false) {
    return [
        'name'           => ['type' => 'string', 'trim' => true, 'min' => 2, 'required' => !$partial, 'message' => 'Supplier name is required'],
        'contact_person' => ['type' => 'string', 'trim' => true, 'nullable' => true],
        'phone'          => ['type' => 'string', 'trim' => true, 'nullable' => true],
        'email'          => ['type' => 'email', 'nullable' => true],
        'address'        => ['type' => 'string', 'trim' => true, 'nullable' => true],
        'notes'          => ['type' => 'string', 'trim' => true, 'nullable' => true],
        'is_active'      => ['type' => 'int', 'min' => 0, 'max' => 1],
    ];
}

function route_suppliers($method, $rest, $body) {
    authenticate();
    require_admin();

    if (count($rest) === 0) {
        if ($method === 'GET') {
            $search = (string) ($_GET['search'] ?? '');
            $like = "%$search%";
            $rows = all(
                "SELECT s.*,
                    COALESCE((SELECT COUNT(*) FROM stock_receipts r WHERE r.supplier_id = s.id), 0) AS receipt_count,
                    COALESCE((SELECT SUM(r.total_cost) FROM stock_receipts r WHERE r.supplier_id = s.id), 0) AS total_supplied
                 FROM suppliers s
                 WHERE (? = '' OR s.name LIKE ? OR COALESCE(s.contact_person,'') LIKE ? OR COALESCE(s.phone,'') LIKE ?)
                 ORDER BY s.name",
                [$search, $like, $like, $like]
            );
            json_out(['data' => $rows]);
        }
        if ($method === 'POST') {
            $b = validate($body, supplier_schema(false));
            q('INSERT INTO suppliers (name, contact_person, phone, email, address, notes) VALUES (?, ?, ?, ?, ?, ?)',
                [$b['name'], $b['contact_person'] ?? null, $b['phone'] ?? null, $b['email'] ?? null, $b['address'] ?? null, $b['notes'] ?? null]);
            $created = one('SELECT * FROM suppliers WHERE id = ?', [last_id()]);
            audit('create', 'supplier', $created['id'], null, $created);
            json_out($created, 201);
        }
    }

    if (isset($rest[0]) && ctype_digit((string) $rest[0]) && $method === 'PUT') {
        $id = (int) $rest[0];
        $before = one('SELECT * FROM suppliers WHERE id = ?', [$id]);
        if (!$before) error_out('Supplier not found', 404);
        $patch = validate($body, supplier_schema(true), true);
        $b = array_merge($before, $patch);
        q('UPDATE suppliers SET name=?, contact_person=?, phone=?, email=?, address=?, notes=?, is_active=? WHERE id=?',
            [$b['name'], $b['contact_person'] ?: null, $b['phone'] ?: null, $b['email'] ?: null, $b['address'] ?: null,
             $b['notes'] ?: null, array_key_exists('is_active', $patch) ? $patch['is_active'] : $before['is_active'], $id]);
        $after = one('SELECT * FROM suppliers WHERE id = ?', [$id]);
        audit('update', 'supplier', $id, $before, $after);
        json_out($after);
    }
}
