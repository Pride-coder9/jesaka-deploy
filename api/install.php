<?php
/**
 * One-click installer. Open in a browser:
 *   /api/install.php?token=jesaka-setup            (create DB + schema, seed if empty)
 *   /api/install.php?token=jesaka-setup&fresh=1     (DROP + rebuild + reseed everything)
 * The token must match config.php -> install_token. Delete/rename this file
 * once the store is live.
 */
declare(strict_types=1);
error_reporting(E_ALL);
ini_set('display_errors', '1');

require __DIR__ . '/lib/database.php';
require __DIR__ . '/lib/respond.php';
require __DIR__ . '/lib/inventory.php';
require __DIR__ . '/seed.php';

header('Content-Type: text/html; charset=utf-8');
$cfg = config();

function page($title, $bodyHtml) {
    echo "<!doctype html><meta charset=utf-8><title>$title</title>"
       . "<style>body{font-family:system-ui,Segoe UI,Arial,sans-serif;background:#0b0e0c;color:#e8eae8;"
       . "max-width:640px;margin:8vh auto;padding:0 20px;line-height:1.55}"
       . "h1{font-size:1.4rem}code{background:#1c211d;padding:2px 6px;border-radius:5px}"
       . ".ok{color:#7ee081}.bad{color:#ff8a8a}a{color:#e8c37a}"
       . ".card{background:#141814;border:1px solid #263026;border-radius:12px;padding:18px 22px;margin:16px 0}</style>"
       . "<h1>🍚 Jesaka Rice Company — Installer</h1>$bodyHtml";
    exit;
}

$token = (string) ($_GET['token'] ?? '');
if (!hash_equals((string) $cfg['install_token'], $token)) {
    http_response_code(403);
    page('Installer', "<div class='card'><p class='bad'>Access token required.</p>"
        . "<p>Open this page as:<br><code>install.php?token=YOUR_TOKEN</code></p>"
        . "<p>The token is the <code>install_token</code> value in <code>api/config.php</code>.</p></div>");
}

$fresh = isset($_GET['fresh']);
$name = $cfg['db']['name'];

try {
    $srv = db_server();
    if ($fresh) $srv->exec("DROP DATABASE IF EXISTS `$name`");
    $srv->exec("CREATE DATABASE IF NOT EXISTS `$name` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    $srv->exec("USE `$name`");

    $hasTables = (int) $srv->query(
        "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = " . $srv->quote($name)
    )->fetchColumn();

    if ($fresh || $hasTables === 0) {
        $schema = file_get_contents(__DIR__ . '/schema.sql');
        exec_sql_script($srv, $schema);
    }

    // demo=0  -> empty database for real use (no demo data, one temporary admin)
    // demo=1  -> demo/sample data (default)
    $wantDemo = ($_GET['demo'] ?? '1') !== '0';

    if ($wantDemo) {
        $seeded = seed_demo($fresh);
        $counts = [];
        foreach (['products', 'users', 'sales', 'suppliers', 'expenses'] as $t) {
            $counts[$t] = (int) scalar("SELECT COUNT(*) FROM $t");
        }
        $summary = "<ul><li>Products: {$counts['products']}</li><li>Users: {$counts['users']}</li>"
            . "<li>Sales: {$counts['sales']}</li><li>Suppliers: {$counts['suppliers']}</li>"
            . "<li>Expenses: {$counts['expenses']}</li></ul>";
        page('Installed', "<div class='card'><p class='ok'>✔ Database <code>$name</code> is ready"
            . ($seeded ? " and demo data was seeded." : " (existing data kept — add <code>&amp;fresh=1</code> to wipe and reseed).") . "</p>"
            . $summary
            . "<p><b>Demo logins</b> (password <code>jesaka123</code>): admin · amina · brian</p>"
            . "<p>For a clean store with no demo data, run "
            . "<code>install.php?token=YOUR_TOKEN&amp;fresh=1&amp;demo=0</code> instead.</p>"
            . "<p>➡ <a href='../index.html'>Open the store</a></p>"
            . "<p style='color:#9aa79a'>Security: change <code>install_token</code> and <code>jwt_secret</code> in "
            . "<code>api/config.php</code>, then delete <code>api/install.php</code>.</p></div>");
    } else {
        // Empty start: create one temporary admin only if no users exist yet.
        $tempPass = null;
        if ((int) scalar('SELECT COUNT(*) FROM users') === 0) {
            $tempPass = 'Jesaka-' . strtoupper(bin2hex(random_bytes(3)));
            init_empty('admin', $tempPass);
        }
        $userCount = (int) scalar('SELECT COUNT(*) FROM users');
        $loginBlock = $tempPass
            ? "<p class='ok'><b>Temporary login</b> — username <code>admin</code>, password <code>$tempPass</code></p>"
              . "<p class='bad'>Sign in, then immediately: (1) Settings → Change My Password, and "
              . "(2) Workers → add your real admin account, then deactivate this temporary one.</p>"
            : "<p>Existing accounts kept ($userCount user(s)). No temporary admin was created. "
              . "Add <code>&amp;fresh=1</code> to wipe everything and start over.</p>";
        page('Ready for your data', "<div class='card'>"
            . "<p class='ok'>✔ Clean database <code>$name</code> created — no demo data.</p>"
            . $loginBlock
            . "<p>Now enter your own data in the app: Settings (store name/currency), Workers, "
            . "Suppliers, Products, Receive Stock, then sell from Point of Sale.</p>"
            . "<p>➡ <a href='../index.html'>Open the store</a></p>"
            . "<p style='color:#9aa79a'>Security: change <code>install_token</code> and <code>jwt_secret</code> in "
            . "<code>api/config.php</code>, then delete <code>api/install.php</code>.</p></div>");
    }
} catch (Throwable $e) {
    http_response_code(500);
    page('Install failed', "<div class='card'><p class='bad'>Install failed:</p>"
        . "<p><code>" . htmlspecialchars($e->getMessage()) . "</code></p>"
        . "<p>Check the database credentials in <code>api/config.php</code> and that MySQL is running.</p></div>");
}
