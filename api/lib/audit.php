<?php
/** Audit trail writer. Never throws — auditing must not break the operation. */

function audit_log($userId, $username, $action, $entityType, $entityId, $old = null, $new = null) {
    try {
        q('INSERT INTO audit_logs (user_id, username, action, entity_type, entity_id, old_values, new_values, ip_address)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
            $userId,
            $username,
            $action,
            $entityType,
            $entityId !== null ? (string) $entityId : null,
            $old !== null ? json_encode($old) : null,
            $new !== null ? json_encode($new) : null,
            $_SERVER['REMOTE_ADDR'] ?? null,
        ]);
    } catch (Throwable $e) {
        error_log('Audit log write failed: ' . $e->getMessage());
    }
}

/** Convenience wrapper bound to the authenticated user. */
function audit($action, $entityType, $entityId, $old = null, $new = null) {
    global $USER;
    audit_log($USER['id'] ?? null, $USER['username'] ?? null, $action, $entityType, $entityId, $old, $new);
}
