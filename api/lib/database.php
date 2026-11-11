<?php
/** PDO connection + tiny query helpers (mirrors the role of better-sqlite3's db). */

function config() {
    static $cfg = null;
    if ($cfg === null) $cfg = require __DIR__ . '/../config.php';
    return $cfg;
}

/** Connect to the MySQL server without selecting a database (used by install). */
function db_server() {
    $d = config()['db'];
    $dsn = "mysql:host={$d['host']};port={$d['port']};charset={$d['charset']}";
    return new PDO($dsn, $d['user'], $d['pass'], [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
}

/** Shared application connection (selects the configured database). */
function db() {
    static $pdo = null;
    if ($pdo) return $pdo;
    $d = config()['db'];
    $dsn = "mysql:host={$d['host']};port={$d['port']};dbname={$d['name']};charset={$d['charset']}";
    $pdo = new PDO($dsn, $d['user'], $d['pass'], [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ]);
    return $pdo;
}

/** Run a prepared statement and return it. */
function q($sql, $args = []) {
    $st = db()->prepare($sql);
    $st->execute($args);
    return $st;
}

/** First matching row (assoc array) or null. */
function one($sql, $args = []) {
    $r = q($sql, $args)->fetch();
    return $r === false ? null : $r;
}

/** All matching rows. */
function all($sql, $args = []) {
    return q($sql, $args)->fetchAll();
}

/** Scalar from the first column of the first row. */
function scalar($sql, $args = []) {
    $r = q($sql, $args)->fetch(PDO::FETCH_NUM);
    return $r === false ? null : $r[0];
}

function last_id() { return (int) db()->lastInsertId(); }

/**
 * Execute a multi-statement SQL script one statement at a time. PDO_MySQL can
 * crash on a single exec() of many statements, so we split on ';'. The schema
 * contains no routines/triggers, so a simple split is safe.
 */
function exec_sql_script(PDO $pdo, $sql) {
    $lines = preg_split('/\r?\n/', $sql);
    $clean = [];
    foreach ($lines as $ln) {
        $t = ltrim($ln);
        if ($t === '' || strpos($t, '--') === 0) continue;
        $clean[] = $ln;
    }
    $joined = implode("\n", $clean);
    foreach (explode(';', $joined) as $stmt) {
        $stmt = trim($stmt);
        if ($stmt !== '') $pdo->exec($stmt);
    }
}
