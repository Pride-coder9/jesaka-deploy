<?php
/** /api/returns — admin-approved returns that reverse revenue and restock. */

function route_returns($method, $rest, $body) {
    global $USER;
    authenticate();
    require_admin();

    // GET /returns/{id}
    if ($method === 'GET' && isset($rest[0]) && ctype_digit((string) $rest[0])) {
        $id = (int) $rest[0];
        $r = one('SELECT r.*, s.sale_number, u.full_name AS processed_by_name FROM returns r
                  JOIN sales s ON s.id = r.sale_id JOIN users u ON u.id = r.processed_by WHERE r.id = ?', [$id]);
        if (!$r) error_out('Return not found', 404);
        $r['items'] = all('SELECT ri.*, p.name, p.sku, p.bag_weight_kg FROM return_items ri
                           JOIN products p ON p.id = ri.product_id WHERE ri.return_id = ?', [$id]);
        json_out($r);
    }

    // GET /returns
    if ($method === 'GET' && count($rest) === 0) {
        $rows = all('SELECT r.*, s.sale_number, s.customer_name, u.full_name AS processed_by_name
                     FROM returns r JOIN sales s ON s.id = r.sale_id JOIN users u ON u.id = r.processed_by
                     ORDER BY r.created_at DESC, r.id DESC LIMIT 200');
        json_out(['data' => $rows]);
    }

    // POST /returns
    if ($method === 'POST' && count($rest) === 0) {
        $b = validate($body, [
            'sale_id' => ['type' => 'int', 'positive' => true, 'required' => true],
            'reason'  => ['type' => 'string', 'trim' => true, 'min' => 3, 'required' => true, 'message' => 'A reason is required'],
        ]);
        $rawItems = $body['items'] ?? null;
        if (!is_array($rawItems) || count($rawItems) === 0) {
            throw new ValidationError([['field' => 'items', 'message' => 'Select at least one item to return']]);
        }
        $items = [];
        foreach ($rawItems as $i => $it) {
            $sid = isset($it['sale_item_id']) && is_numeric($it['sale_item_id']) ? (int) $it['sale_item_id'] : 0;
            $qty = isset($it['qty']) && is_numeric($it['qty']) ? (int) $it['qty'] : 0;
            if ($sid <= 0 || $qty <= 0) throw new ValidationError([['field' => "items.$i", 'message' => 'Invalid return line']]);
            $items[] = ['sale_item_id' => $sid, 'qty' => $qty, 'resellable' => !empty($it['resellable'])];
        }

        $pdo = db();
        $pdo->beginTransaction();
        try {
            $sale = one('SELECT * FROM sales WHERE id = ?', [$b['sale_id']]);
            if (!$sale) throw http_error(404, 'Sale not found');

            $number = inv_next_doc_number('JRT', 'returns', 'return_number');
            q('INSERT INTO returns (return_number, sale_id, reason, processed_by) VALUES (?, ?, ?, ?)',
                [$number, $sale['id'], $b['reason'], $USER['id']]);
            $returnId = last_id();

            $refundTotal = 0; $costRestocked = 0; $costWrittenOff = 0;
            foreach ($items as $item) {
                $si = one('SELECT * FROM sale_items WHERE id = ? AND sale_id = ?', [$item['sale_item_id'], $sale['id']]);
                if (!$si) throw http_error(400, "Sale item #{$item['sale_item_id']} does not belong to this sale");
                $alreadyReturned = (int) scalar('SELECT COALESCE(SUM(qty),0) FROM return_items WHERE sale_item_id = ?', [$si['id']]);
                if ($item['qty'] > $si['qty'] - $alreadyReturned) {
                    $remain = $si['qty'] - $alreadyReturned;
                    throw http_error(400, "Cannot return {$item['qty']}: only $remain of {$si['qty']} remain returnable on this line");
                }
                $refund = $item['qty'] * (float) $si['unit_price'];
                $cost   = $item['qty'] * (float) $si['unit_cost'];
                $refundTotal += $refund;
                if ($item['resellable']) {
                    inv_add_stock([
                        'productId' => $si['product_id'], 'locationId' => $sale['location_id'], 'qty' => $item['qty'],
                        'unitCost' => (float) $si['unit_cost'], 'movementType' => 'return_in', 'referenceType' => 'return',
                        'referenceId' => $returnId, 'reason' => $b['reason'], 'userId' => $USER['id'],
                    ]);
                    $costRestocked += $cost;
                } else {
                    $costWrittenOff += $cost;
                }
                q('INSERT INTO return_items (return_id, sale_item_id, product_id, qty, unit_price, unit_cost, resellable, line_refund)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                    [$returnId, $si['id'], $si['product_id'], $item['qty'], $si['unit_price'], $si['unit_cost'], $item['resellable'] ? 1 : 0, $refund]);
            }

            q('UPDATE returns SET refund_total = ?, cost_restocked = ?, cost_written_off = ? WHERE id = ?',
                [$refundTotal, $costRestocked, $costWrittenOff, $returnId]);
            $result = one('SELECT * FROM returns WHERE id = ?', [$returnId]);
            $pdo->commit();
        } catch (Throwable $e) { $pdo->rollBack(); throw $e; }
        audit('create', 'return', $result['id'], null, $result);
        json_out($result, 201);
    }
}
