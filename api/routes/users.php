<?php
/** /api/users — admin worker/account management. */

const USER_SAFE = 'u.id, u.username, u.full_name, u.phone, u.role_id, u.is_active, u.created_at, r.name AS role_name';

function route_users($method, $rest, $body) {
    global $USER;
    authenticate();
    require_admin();
    $sub = $rest[0] ?? '';

    // GET /users/roles
    if ($sub === 'roles' && $method === 'GET') {
        json_out(['data' => all('SELECT id, name, description FROM roles ORDER BY id')]);
    }

    // Collection
    if (count($rest) === 0) {
        if ($method === 'GET') {
            $rows = all("SELECT " . USER_SAFE . ",
                    (SELECT COUNT(*) FROM sales s WHERE s.worker_id = u.id) AS sales_count,
                    (SELECT COALESCE(SUM(s.total),0) FROM sales s WHERE s.worker_id = u.id
                     AND DATE(s.created_at) = CURDATE()) AS today_sales
                FROM users u JOIN roles r ON r.id = u.role_id ORDER BY u.full_name");
            json_out(['data' => $rows]);
        }
        if ($method === 'POST') {
            $b = validate($body, [
                'username' => ['type' => 'string', 'trim' => true, 'min' => 3, 'required' => true,
                               'regex' => '/^[a-zA-Z0-9_.-]+$/', 'regex_msg' => 'Letters, numbers, dot, dash, underscore only',
                               'message' => 'Username must be at least 3 characters'],
                'password' => ['type' => 'string', 'min' => 6, 'required' => true, 'message' => 'Password must be at least 6 characters'],
                'full_name' => ['type' => 'string', 'trim' => true, 'min' => 2, 'required' => true],
                'phone'    => ['type' => 'string', 'trim' => true, 'nullable' => true],
                'role_id'  => ['type' => 'int', 'positive' => true, 'required' => true],
            ]);
            if (!one('SELECT id FROM roles WHERE id = ?', [$b['role_id']])) error_out('Invalid role', 400);
            q('INSERT INTO users (username, password_hash, full_name, phone, role_id) VALUES (?, ?, ?, ?, ?)',
                [strtolower($b['username']), password_hash($b['password'], PASSWORD_BCRYPT), $b['full_name'], $b['phone'] ?? null, $b['role_id']]);
            $created = one('SELECT ' . USER_SAFE . ' FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?', [last_id()]);
            audit('create', 'user', $created['id'], null, $created);
            json_out($created, 201);
        }
    }

    // /users/{id} and /users/{id}/reset-password
    if (isset($rest[0]) && ctype_digit((string) $rest[0])) {
        $id = (int) $rest[0];

        if (($rest[1] ?? '') === 'reset-password' && $method === 'POST') {
            $b = validate($body, ['new_password' => ['type' => 'string', 'min' => 6, 'required' => true, 'message' => 'Password must be at least 6 characters']]);
            $u = one('SELECT id, username FROM users WHERE id = ?', [$id]);
            if (!$u) error_out('User not found', 404);
            q("UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?", [password_hash($b['new_password'], PASSWORD_BCRYPT), $id]);
            audit('reset_password', 'user', $id, null, ['username' => $u['username']]);
            json_out(['message' => "Password reset for {$u['username']}"]);
        }

        if (count($rest) === 1 && $method === 'PUT') {
            $before = one('SELECT ' . USER_SAFE . ' FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?', [$id]);
            if (!$before) error_out('User not found', 404);
            $patch = validate($body, [
                'full_name' => ['type' => 'string', 'trim' => true, 'min' => 2],
                'phone'     => ['type' => 'string', 'trim' => true, 'nullable' => true],
                'role_id'   => ['type' => 'int', 'positive' => true],
                'is_active' => ['type' => 'int', 'min' => 0, 'max' => 1],
            ], true);
            if ((int) $before['id'] === $USER['id'] && array_key_exists('is_active', $patch) && $patch['is_active'] === 0) {
                error_out('You cannot deactivate your own account', 400);
            }
            $b = array_merge($before, $patch);
            q("UPDATE users SET full_name=?, phone=?, role_id=?, is_active=?, updated_at=NOW() WHERE id=?",
                [$b['full_name'], $b['phone'] ?: null, $b['role_id'], $b['is_active'], $id]);
            $after = one('SELECT ' . USER_SAFE . ' FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?', [$id]);
            audit('update', 'user', $id, $before, $after);
            json_out($after);
        }

        if (count($rest) === 1 && $method === 'DELETE') {
            $before = one('SELECT ' . USER_SAFE . ' FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?', [$id]);
            if (!$before) error_out('User not found', 404);
            if ((int) $before['id'] === $USER['id']) error_out('You cannot delete your own account', 400);
            // A worker with any activity history can't be hard-deleted (it would orphan records).
            $refs = [
                'sales' => 'worker_id', 'stock_receipts' => 'received_by', 'stock_adjustments' => 'adjusted_by',
                'stock_movements' => 'user_id', 'payments' => 'received_by', 'returns' => 'processed_by',
                'expenses' => 'recorded_by', 'pl_summaries' => 'generated_by',
            ];
            foreach ($refs as $table => $col) {
                if ((int) scalar("SELECT COUNT(*) FROM $table WHERE $col = ?", [$id]) > 0) {
                    error_out('This worker has activity history and cannot be deleted. Deactivate the account instead.', 409);
                }
            }
            q('DELETE FROM users WHERE id = ?', [$id]);
            audit('delete', 'user', $id, $before, null);
            json_out(['message' => "Worker \"{$before['full_name']}\" deleted"]);
        }
    }
}
