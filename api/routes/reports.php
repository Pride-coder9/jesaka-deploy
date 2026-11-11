<?php
/** /api/reports — P&L, sales summary, worker performance, stock valuation. Admin only. */

function report_range() {
    $today = date('Y-m-d');
    $from = (string) ($_GET['from'] ?? (substr($today, 0, 8) . '01'));
    $to   = (string) ($_GET['to'] ?? $today);
    return [$from, $to];
}

/**
 * net revenue = sales total − refunds
 * COGS        = sale cost − cost of resellable returns
 * gross       = net revenue − COGS
 * net profit  = gross − operating expenses − stock write-offs
 */
function report_compute_pl($from, $to) {
    $sales = one("SELECT COALESCE(SUM(total),0) revenue, COALESCE(SUM(total_cost),0) cogs, COUNT(*) cnt
                  FROM sales WHERE DATE(created_at) BETWEEN ? AND ?", [$from, $to]);
    $returns = one("SELECT COALESCE(SUM(refund_total),0) refunds, COALESCE(SUM(cost_restocked),0) restocked,
                    COALESCE(SUM(cost_written_off),0) return_writeoffs
                    FROM returns WHERE DATE(created_at) BETWEEN ? AND ?", [$from, $to]);
    $writeoffs = (float) scalar("SELECT COALESCE(SUM(total_cost),0) FROM stock_adjustments
                    WHERE qty_change < 0 AND reason_type IN ('spoilage','damage','theft')
                    AND DATE(created_at) BETWEEN ? AND ?", [$from, $to]);
    $expenseRows = all("SELECT category, COALESCE(SUM(amount),0) total FROM expenses
                        WHERE expense_date BETWEEN ? AND ? GROUP BY category ORDER BY total DESC", [$from, $to]);
    $expensesTotal = 0;
    foreach ($expenseRows as $r) $expensesTotal += (float) $r['total'];
    $byMethod = all("SELECT payment_method, COUNT(*) count, COALESCE(SUM(total),0) total FROM sales
                     WHERE DATE(created_at) BETWEEN ? AND ? GROUP BY payment_method", [$from, $to]);

    $revenue = (float) $sales['revenue'];
    $netRevenue = $revenue - (float) $returns['refunds'];
    $cogs = (float) $sales['cogs'] - (float) $returns['restocked'];
    $grossProfit = $netRevenue - $cogs;
    $netProfit = $grossProfit - $expensesTotal - $writeoffs;
    return [
        'period' => ['from' => $from, 'to' => $to],
        'revenue' => $revenue, 'sales_count' => (int) $sales['cnt'],
        'refunds' => (float) $returns['refunds'], 'net_revenue' => $netRevenue,
        'cogs' => $cogs, 'gross_profit' => $grossProfit,
        'gross_margin_pct' => $netRevenue > 0 ? ($grossProfit / $netRevenue) * 100 : 0,
        'expenses' => $expenseRows, 'expenses_total' => $expensesTotal,
        'writeoffs_total' => $writeoffs,
        'net_profit' => $netProfit,
        'by_method' => $byMethod,
    ];
}

function route_reports($method, $rest, $body) {
    global $USER;
    authenticate();
    require_admin();
    $sub = $rest[0] ?? '';

    if ($sub === 'profit-loss' && count($rest) === 1 && $method === 'GET') {
        [$from, $to] = report_range();
        json_out(report_compute_pl($from, $to));
    }

    if ($sub === 'profit-loss' && ($rest[1] ?? '') === 'snapshot' && $method === 'POST') {
        [$from, $to] = report_range();
        $pl = report_compute_pl($from, $to);
        q('INSERT INTO pl_summaries (period_start, period_end, revenue, refunds, net_revenue, cogs, gross_profit,
              expenses_total, writeoffs_total, net_profit, breakdown, generated_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [$from, $to, $pl['revenue'], $pl['refunds'], $pl['net_revenue'], $pl['cogs'], $pl['gross_profit'],
             $pl['expenses_total'], $pl['writeoffs_total'], $pl['net_profit'], json_encode($pl), $USER['id']]);
        $id = last_id();
        audit('create', 'pl_summary', $id, null, ['from' => $from, 'to' => $to, 'net_profit' => $pl['net_profit']]);
        json_out(array_merge(['id' => $id], $pl), 201);
    }

    if ($sub === 'profit-loss' && ($rest[1] ?? '') === 'snapshots' && $method === 'GET') {
        $rows = all('SELECT s.*, u.full_name AS generated_by_name FROM pl_summaries s
                     LEFT JOIN users u ON u.id = s.generated_by ORDER BY s.created_at DESC LIMIT 50');
        json_out(['data' => $rows]);
    }

    if ($sub === 'sales-summary' && $method === 'GET') {
        [$from, $to] = report_range();
        json_out([
            'period' => ['from' => $from, 'to' => $to],
            'daily' => all("SELECT DATE(created_at) day, COUNT(*) count, COALESCE(SUM(total),0) total,
                    COALESCE(SUM(total - total_cost),0) gross_profit
                 FROM sales WHERE DATE(created_at) BETWEEN ? AND ? GROUP BY day ORDER BY day", [$from, $to]),
            'best_sellers' => all("SELECT p.id, p.name, p.bag_weight_kg, p.sku, SUM(i.qty) bags, SUM(i.line_total) revenue,
                    SUM(i.line_total - i.line_cost) gross_profit
                 FROM sale_items i JOIN sales s ON s.id = i.sale_id JOIN products p ON p.id = i.product_id
                 WHERE DATE(s.created_at) BETWEEN ? AND ? GROUP BY p.id ORDER BY bags DESC LIMIT 10", [$from, $to]),
        ]);
    }

    if ($sub === 'worker-performance' && $method === 'GET') {
        [$from, $to] = report_range();
        $rows = all("SELECT u.id, u.full_name, u.username, u.is_active,
                COUNT(s.id) transactions, COALESCE(SUM(s.total),0) revenue,
                COALESCE(SUM(s.total - s.total_cost),0) gross_profit,
                COALESCE(AVG(s.total),0) avg_sale,
                COALESCE(SUM(CASE WHEN s.payment_method = 'cash' THEN s.total END),0) cash_total,
                COALESCE(SUM(CASE WHEN s.payment_method = 'mobile_money' THEN s.total END),0) momo_total
            FROM users u
            LEFT JOIN sales s ON s.worker_id = u.id AND DATE(s.created_at) BETWEEN ? AND ?
            GROUP BY u.id ORDER BY revenue DESC", [$from, $to]);
        json_out(['period' => ['from' => $from, 'to' => $to], 'data' => $rows]);
    }

    if ($sub === 'stock-valuation' && $method === 'GET') {
        $rows = all("SELECT p.id, p.name, p.sku, p.bag_weight_kg, p.reorder_level, p.selling_price,
                COALESCE(SUM(b.qty),0) total_qty,
                COALESCE(SUM(b.qty * b.avg_cost),0) cost_value,
                COALESCE(SUM(b.qty),0) * p.selling_price AS retail_value
            FROM products p LEFT JOIN inventory_balances b ON b.product_id = p.id
            WHERE p.is_active = 1 GROUP BY p.id ORDER BY p.name");
        $totals = ['qty' => 0, 'cost' => 0, 'retail' => 0];
        foreach ($rows as $r) {
            $totals['qty']    += (float) $r['total_qty'];
            $totals['cost']   += (float) $r['cost_value'];
            $totals['retail'] += (float) $r['retail_value'];
        }
        json_out(['data' => $rows, 'totals' => $totals]);
    }
}
