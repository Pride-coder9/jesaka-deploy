<?php
/** /api/audit — admin audit log with filters. */

function route_audit($method, $rest, $body) {
    authenticate();
    require_admin();
    if ($method !== 'GET' || count($rest) !== 0) return;

    $entity = (string) ($_GET['entity_type'] ?? '');
    $action = (string) ($_GET['action'] ?? '');
    $username = (string) ($_GET['username'] ?? '');
    $from = (string) ($_GET['from'] ?? '');
    $to   = (string) ($_GET['to'] ?? '');
    $page = max(1, (int) ($_GET['page'] ?? 1));
    $lim  = min(100, max(1, (int) ($_GET['limit'] ?? 30)));
    $off  = ($page - 1) * $lim;

    $where = "WHERE (? = '' OR a.entity_type = ?) AND (? = '' OR a.action = ?)
              AND (? = '' OR COALESCE(a.username,'') LIKE ?)
              AND (? = '' OR DATE(a.created_at) >= ?) AND (? = '' OR DATE(a.created_at) <= ?)";
    $args = [$entity, $entity, $action, $action, $username, "%$username%", $from, $from, $to, $to];
    $total = (int) scalar("SELECT COUNT(*) FROM audit_logs a $where", $args);
    $rows = all("SELECT a.* FROM audit_logs a $where ORDER BY a.created_at DESC, a.id DESC LIMIT $lim OFFSET $off", $args);
    $filters = [
        'entity_types' => array_column(all('SELECT DISTINCT entity_type FROM audit_logs ORDER BY entity_type'), 'entity_type'),
        'actions' => array_column(all('SELECT DISTINCT action FROM audit_logs ORDER BY action'), 'action'),
    ];
    json_out(['data' => $rows, 'total' => $total, 'page' => $page, 'pages' => (int) ceil($total / $lim), 'filters' => $filters]);
}
