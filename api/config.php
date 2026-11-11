<?php
/**
 * Jesaka Rice Company — backend configuration.
 * Edit the database credentials to match your MySQL/MariaDB server.
 * Default values work with a stock XAMPP install (user "root", no password).
 */
return [
    'db' => [
        // === EDIT THESE 3 with the values from your host's cPanel → MySQL Databases ===
        'host'    => '127.0.0.1',        // usually 'localhost' on shared hosting
        'port'    => 3306,
        'name'    => 'REPLACE_WITH_DB_NAME',   // e.g. u481_jesaka_rice
        'user'    => 'REPLACE_WITH_DB_USER',   // e.g. u481_jesaka
        'pass'    => 'REPLACE_WITH_DB_PASS',   // the password you set in cPanel
        // ============================================================================
        'charset' => 'utf8mb4',
    ],
    // Replace both placeholders before deploying the application.
    'jwt_secret'       => 'REPLACE_WITH_A_LONG_RANDOM_SECRET',
    'jwt_expiry_hours' => 8,
    // Secret token required by install.php / seed.php to (re)build the database.
    'install_token'    => 'REPLACE_WITH_A_RANDOM_INSTALL_TOKEN',
];
