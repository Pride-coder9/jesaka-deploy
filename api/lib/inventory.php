<?php
/**
 * Inventory & costing engine — direct port of the original service.
 *
 *  - weighted_average: COGS uses the running average cost of the balance.
 *  - fifo:             COGS consumes cost layers oldest-first.
 * Cost layers are maintained under BOTH methods so switching stays accurate.
 * Every mutating call is expected to run inside a db() transaction.
 */

function inv_get_setting($key, $fallback = null) {
    $row = one('SELECT svalue FROM settings WHERE skey = ?', [$key]);
    return $row ? $row['svalue'] : $fallback;
}

function inv_set_setting($key, $value) {
    q('INSERT INTO settings (skey, svalue) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE svalue = VALUES(svalue)', [$key, (string) $value]);
}

function inv_costing_method() {
    return inv_get_setting('costing_method', 'weighted_average');
}

function inv_default_sales_location_id() {
    $id = (int) inv_get_setting('default_sales_location_id', '1');
    $loc = one('SELECT id FROM locations WHERE id = ?', [$id]);
    if ($loc) return (int) $loc['id'];
    $fallback = one('SELECT id FROM locations WHERE is_sales_point = 1 ORDER BY id LIMIT 1');
    return $fallback ? (int) $fallback['id'] : 1;
}

function inv_ensure_balance($productId, $locationId) {
    $bal = one('SELECT * FROM inventory_balances WHERE product_id = ? AND location_id = ?', [$productId, $locationId]);
    if (!$bal) {
        q('INSERT INTO inventory_balances (product_id, location_id, qty, avg_cost) VALUES (?, ?, 0, 0)', [$productId, $locationId]);
        $bal = one('SELECT * FROM inventory_balances WHERE product_id = ? AND location_id = ?', [$productId, $locationId]);
    }
    return $bal;
}

function inv_insert_movement($m) {
    q('INSERT INTO stock_movements (product_id, location_id, movement_type, qty_change, unit_cost, reference_type, reference_id, reason, user_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, NOW()))', [
        $m['productId'], $m['locationId'], $m['movementType'], $m['qtyChange'], $m['unitCost'],
        $m['referenceType'] ?? null, $m['referenceId'] ?? null, $m['reason'] ?? null,
        $m['userId'] ?? null, $m['createdAt'] ?? null,
    ]);
}

/** Increase stock: updates weighted-average, appends a FIFO layer, logs a movement. */
function inv_add_stock($a) {
    if ($a['qty'] <= 0) throw http_error(400, 'Quantity to add must be positive');
    $bal = inv_ensure_balance($a['productId'], $a['locationId']);
    $curQty = (float) $bal['qty'];
    $curAvg = (float) $bal['avg_cost'];
    $newQty = $curQty + $a['qty'];
    $newAvg = $newQty > 0 ? (($curQty * $curAvg) + ($a['qty'] * $a['unitCost'])) / $newQty : $a['unitCost'];
    q('UPDATE inventory_balances SET qty = ?, avg_cost = ? WHERE id = ?', [$newQty, $newAvg, $bal['id']]);
    q('INSERT INTO cost_layers (product_id, location_id, qty_remaining, unit_cost, created_at)
       VALUES (?, ?, ?, ?, COALESCE(?, NOW()))',
        [$a['productId'], $a['locationId'], $a['qty'], $a['unitCost'], $a['createdAt'] ?? null]);
    inv_insert_movement([
        'productId' => $a['productId'], 'locationId' => $a['locationId'],
        'movementType' => $a['movementType'] ?? 'receipt', 'qtyChange' => $a['qty'], 'unitCost' => $a['unitCost'],
        'referenceType' => $a['referenceType'] ?? null, 'referenceId' => $a['referenceId'] ?? null,
        'reason' => $a['reason'] ?? null, 'userId' => $a['userId'] ?? null, 'createdAt' => $a['createdAt'] ?? null,
    ]);
    return ['qty' => $newQty, 'avgCost' => $newAvg];
}

/**
 * Decrease stock. Rejects if the location holds too little (never goes below
 * zero). Returns the cost consumed per the configured costing method.
 */
function inv_remove_stock($a) {
    if ($a['qty'] <= 0) throw http_error(400, 'Quantity to remove must be positive');
    $bal = inv_ensure_balance($a['productId'], $a['locationId']);
    $balQty = (float) $bal['qty'];
    $avgCost = (float) $bal['avg_cost'];
    if ($balQty < $a['qty']) {
        $p = one('SELECT name, bag_weight_kg FROM products WHERE id = ?', [$a['productId']]);
        $label = $p ? ($p['name'] . ' ' . rtrim(rtrim($p['bag_weight_kg'], '0'), '.') . 'kg') : 'product';
        throw http_error(400, "Insufficient stock for $label: available " . (int) $balQty . ", requested {$a['qty']}");
    }

    // Consume layers oldest-first so FIFO data stays correct under either method.
    $remaining = (float) $a['qty'];
    $fifoCost = 0.0;
    $layers = all('SELECT * FROM cost_layers WHERE product_id = ? AND location_id = ? AND qty_remaining > 0
                   ORDER BY created_at, id', [$a['productId'], $a['locationId']]);
    foreach ($layers as $layer) {
        if ($remaining <= 0) break;
        $take = min((float) $layer['qty_remaining'], $remaining);
        $fifoCost += $take * (float) $layer['unit_cost'];
        $remaining -= $take;
        q('UPDATE cost_layers SET qty_remaining = qty_remaining - ? WHERE id = ?', [$take, $layer['id']]);
    }
    if ($remaining > 0) $fifoCost += $remaining * $avgCost; // layers out of sync — fall back to average

    $unitCost = inv_costing_method() === 'fifo' ? $fifoCost / $a['qty'] : $avgCost;
    q('UPDATE inventory_balances SET qty = qty - ? WHERE id = ?', [$a['qty'], $bal['id']]);
    inv_insert_movement([
        'productId' => $a['productId'], 'locationId' => $a['locationId'],
        'movementType' => $a['movementType'], 'qtyChange' => -$a['qty'], 'unitCost' => $unitCost,
        'referenceType' => $a['referenceType'] ?? null, 'referenceId' => $a['referenceId'] ?? null,
        'reason' => $a['reason'] ?? null, 'userId' => $a['userId'] ?? null, 'createdAt' => $a['createdAt'] ?? null,
    ]);
    return ['unitCost' => $unitCost, 'totalCost' => $unitCost * $a['qty']];
}

/** Sequential per-day document numbers like JRS-20260721-0003. */
function inv_next_doc_number($prefix, $table, $column, $dateStr = null) {
    $d = $dateStr ?: date('Y-m-d');
    $compact = str_replace('-', '', $d);
    $like = "$prefix-$compact-%";
    // $table/$column are internal constants supplied by route code (never user input).
    $count = (int) scalar("SELECT COUNT(*) FROM $table WHERE $column LIKE ?", [$like]);
    return "$prefix-$compact-" . str_pad($count + 1, 4, '0', STR_PAD_LEFT);
}
