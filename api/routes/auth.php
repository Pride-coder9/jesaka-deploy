<?php
/** /api/auth — login, me, change password. */

function auth_throttle_key($ip, $username) {
    return sys_get_temp_dir() . '/jesaka_login_' . md5($ip . ':' . strtolower($username)) . '.json';
}

function route_auth($method, $rest, $body) {
    $sub = $rest[0] ?? '';

    // POST /auth/login
    if ($method === 'POST' && $sub === 'login') {
        $data = validate($body, [
            'username' => ['type' => 'string', 'trim' => true, 'min' => 1, 'required' => true, 'message' => 'Username is required'],
            'password' => ['type' => 'string', 'min' => 1, 'required' => true, 'message' => 'Password is required'],
        ]);

        $ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
        $file = auth_throttle_key($ip, $data['username']);
        $windowMs = 15 * 60;
        $a = ['n' => 0, 't' => time()];
        if (is_file($file)) {
            $prev = json_decode((string) @file_get_contents($file), true);
            if (is_array($prev)) $a = $prev;
        }
        if (time() - ($a['t'] ?? 0) > $windowMs) $a = ['n' => 0, 't' => time()];
        if (($a['n'] ?? 0) >= 8) error_out('Too many failed attempts. Try again in 15 minutes.', 429);

        $user = one(
            'SELECT u.*, r.name AS role_name FROM users u JOIN roles r ON r.id = u.role_id
             WHERE lower(u.username) = lower(?)', [$data['username']]
        );

        if (!$user || !password_verify($data['password'], $user['password_hash'])) {
            $a['n'] = ($a['n'] ?? 0) + 1;
            @file_put_contents($file, json_encode($a));
            error_out('Invalid username or password', 401);
        }
        if (!$user['is_active']) error_out('Account is deactivated. Contact the administrator.', 403);

        @unlink($file);

        // Separate admin / worker sign-in: the account's role must match the tab used.
        $portal = $body['portal'] ?? null;
        if ($portal === 'admin' || $portal === 'worker') {
            if ($user['role_name'] !== $portal) {
                error_out($portal === 'admin'
                    ? 'That is not an administrator account — please use the Worker sign-in.'
                    : 'Administrators must use the Administrator sign-in.', 403);
            }
        }

        audit_log($user['id'], $user['username'], 'login', 'user', $user['id']);
        json_out([
            'token' => auth_generate_token($user),
            'user'  => ['id' => (int) $user['id'], 'username' => $user['username'], 'full_name' => $user['full_name'], 'role' => $user['role_name']],
            'store' => ['name' => inv_get_setting('store_name'), 'currency' => inv_get_setting('currency', 'UGX')],
        ]);
    }

    // GET /auth/me
    if ($method === 'GET' && $sub === 'me') {
        $u = authenticate();
        json_out([
            'user'  => ['id' => $u['id'], 'username' => $u['username'], 'full_name' => $u['full_name'], 'role' => $u['role_name']],
            'store' => ['name' => inv_get_setting('store_name'), 'currency' => inv_get_setting('currency', 'UGX')],
        ]);
    }

    // PUT /auth/password
    if ($method === 'PUT' && $sub === 'password') {
        $u = authenticate();
        $data = validate($body, [
            'current_password' => ['type' => 'string', 'min' => 1, 'required' => true],
            'new_password'     => ['type' => 'string', 'min' => 6, 'required' => true, 'message' => 'New password must be at least 6 characters'],
        ]);
        $row = one('SELECT * FROM users WHERE id = ?', [$u['id']]);
        if (!password_verify($data['current_password'], $row['password_hash'])) {
            error_out('Current password is incorrect', 400);
        }
        q("UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?",
            [password_hash($data['new_password'], PASSWORD_BCRYPT), $u['id']]);
        audit('change_password', 'user', $u['id']);
        json_out(['message' => 'Password updated']);
    }
}
