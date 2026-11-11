<?php
/** Authentication + role guards. Sets the global $USER on success. */

$USER = null;

function auth_generate_token($user) {
    $cfg = config();
    $payload = [
        'id'       => (int) $user['id'],
        'username' => $user['username'],
        'role'     => $user['role_name'],
        'iat'      => time(),
        'exp'      => time() + 3600 * (int) $cfg['jwt_expiry_hours'],
    ];
    return jwt_encode($payload, $cfg['jwt_secret']);
}

/** Pull the bearer token from the Authorization header or ?token= fallback. */
function auth_bearer_token() {
    $hdr = null;
    if (!empty($_SERVER['HTTP_AUTHORIZATION'])) {
        $hdr = $_SERVER['HTTP_AUTHORIZATION'];
    } elseif (!empty($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
        $hdr = $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
    } elseif (function_exists('apache_request_headers')) {
        foreach (apache_request_headers() as $k => $v) {
            if (strcasecmp($k, 'Authorization') === 0) { $hdr = $v; break; }
        }
    }
    if ($hdr && stripos($hdr, 'Bearer ') === 0) return substr($hdr, 7);
    if (isset($_GET['token'])) return $_GET['token'];
    return null;
}

/** Require a valid session; returns the user row and sets global $USER. */
function authenticate() {
    global $USER;
    $cfg = config();
    $token = auth_bearer_token();
    if (!$token) error_out('Authentication required', 401);

    try {
        $decoded = jwt_decode($token, $cfg['jwt_secret']);
    } catch (JwtExpired $e) {
        error_out('Session expired. Please sign in again.', 401);
    } catch (Throwable $e) {
        error_out('Invalid session token', 401);
    }

    $user = one(
        'SELECT u.id, u.username, u.full_name, u.phone, u.is_active, r.name AS role_name, r.permissions
         FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?',
        [$decoded['id']]
    );
    if (!$user || !$user['is_active']) error_out('Account not found or deactivated', 401);
    $user['id'] = (int) $user['id'];
    $user['permissions'] = json_decode($user['permissions'] ?: '{}', true);
    $USER = $user;
    return $user;
}

function current_user() { global $USER; return $USER; }
function is_admin() { global $USER; return ($USER['role_name'] ?? null) === 'admin'; }

function require_admin() {
    if (!is_admin()) error_out('You do not have permission for this action', 403);
}
