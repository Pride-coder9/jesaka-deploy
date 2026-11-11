<?php
/**
 * Front controller for the Jesaka Rice API.
 * All /api/* requests are rewritten here by .htaccess. Dispatches on the path
 * segment after "/api/" and mirrors the original Express routing + error shape.
 */
declare(strict_types=1);

error_reporting(E_ALL);
ini_set('display_errors', '0');
date_default_timezone_set(@date_default_timezone_get() ?: 'UTC');

require __DIR__ . '/lib/database.php';
require __DIR__ . '/lib/respond.php';
require __DIR__ . '/lib/jwt.php';
require __DIR__ . '/lib/validate.php';
require __DIR__ . '/lib/auth.php';
require __DIR__ . '/lib/audit.php';
require __DIR__ . '/lib/inventory.php';

// CORS (same-origin in practice; permissive like the original dev setup).
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Authorization, Content-Type');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') { http_response_code(204); exit; }

set_exception_handler(function ($e) {
    error_log('Unhandled: ' . $e->getMessage());
    error_out('Internal server error', 500);
});

// ---- Resolve the path after "/api/" (works at web root or in a subfolder) ----
$uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$uri = urldecode($uri);
$pos = strpos($uri, '/api/');
$rel = $pos === false ? '' : substr($uri, $pos + 5);
$rel = trim($rel, '/');
$segments = $rel === '' ? [] : explode('/', $rel);
// Support hosts without URL rewriting: /api/index.php/<resource>/...
if (($segments[0] ?? '') === 'index.php') array_shift($segments);

$method   = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$resource = $segments[0] ?? '';
$rest     = array_slice($segments, 1);
$raw      = file_get_contents('php://input');
$body     = $raw ? (json_decode($raw, true) ?? []) : [];

try {
    switch ($resource) {
        case 'health':
            json_out(['status' => 'ok', 'timestamp' => date('c')]);
            break;
        case 'auth':       require __DIR__ . '/routes/auth.php';       route_auth($method, $rest, $body); break;
        case 'dashboard':  require __DIR__ . '/routes/dashboard.php';  route_dashboard($method, $rest, $body); break;
        case 'products':   require __DIR__ . '/routes/products.php';   route_products($method, $rest, $body); break;
        case 'suppliers':  require __DIR__ . '/routes/suppliers.php';  route_suppliers($method, $rest, $body); break;
        case 'stock':      require __DIR__ . '/routes/stock.php';      route_stock($method, $rest, $body); break;
        case 'sales':      require __DIR__ . '/routes/sales.php';      route_sales($method, $rest, $body); break;
        case 'returns':    require __DIR__ . '/routes/returns.php';    route_returns($method, $rest, $body); break;
        case 'expenses':   require __DIR__ . '/routes/expenses.php';   route_expenses($method, $rest, $body); break;
        case 'reports':    require __DIR__ . '/routes/reports.php';    route_reports($method, $rest, $body); break;
        case 'users':      require __DIR__ . '/routes/users.php';      route_users($method, $rest, $body); break;
        case 'audit':      require __DIR__ . '/routes/audit.php';      route_audit($method, $rest, $body); break;
        case 'settings':   require __DIR__ . '/routes/settings.php';   route_settings($method, $rest, $body); break;
        default:
            error_out("Route $method /$rel not found", 404);
    }
    error_out("Route $method /$rel not found", 404);
} catch (ValidationError $e) {
    error_out('Validation failed', 400, ['details' => $e->details]);
} catch (HttpError $e) {
    error_out($e->getMessage(), $e->status);
} catch (PDOException $e) {
    $code = $e->errorInfo[1] ?? 0;
    if ($code === 1062)      error_out('A record with this value already exists', 409);
    if ($code === 1452)      error_out('Referenced record does not exist', 400);
    if (in_array($code, [3819, 4025], true)) error_out('Operation rejected: it would violate a data rule (e.g. stock below zero)', 400);
    error_log('DB error: ' . $e->getMessage());
    error_out('Internal server error', 500);
}
