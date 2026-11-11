<?php
/** /api/dashboard — admin overview and worker daily summary. */

function dash_sales_in($cond) {
    return one("SELECT COALESCE(SUM(total),0) total, COUNT(*) count, COALESCE(SUM(total - total_cost),0) gross
                FROM sales WHERE $cond");
}

function route_dashboard($method, $rest, $body) {
    global $USER;
    authenticate();
    $sub = $rest[0] ?? '';

    if ($sub === 'admin' && $method === 'GET') {
        require_admin();

        $today = dash_sales_in("DATE(created_at) = CURDATE()");
        $week  = dash_sales_in("DATE(created_at) >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)");
        $month = dash_sales_in("DATE_FORMAT(created_at,'%Y-%m') = DATE_FORMAT(CURDATE(),'%Y-%m')");

        $monthExpenses = (float) scalar("SELECT COALESCE(SUM(amount),0) FROM expenses
            WHERE DATE_FORMAT(expense_date,'%Y-%m') = DATE_FORMAT(CURDATE(),'%Y-%m')");
        $monthRefunds = one("SELECT COALESCE(SUM(refund_total),0) r, COALESCE(SUM(cost_restocked),0) rc FROM returns
            WHERE DATE_FORMAT(created_at,'%Y-%m') = DATE_FORMAT(CURDATE(),'%Y-%m')");
        $monthWriteoffs = (float) scalar("SELECT COALESCE(SUM(total_cost),0) FROM stock_adjustments
            WHERE qty_change < 0 AND reason_type IN ('spoilage','damage','theft')
            AND DATE_FORMAT(created_at,'%Y-%m') = DATE_FORMAT(CURDATE(),'%Y-%m')");

        $stock = all("SELECT p.id, p.name, p.bag_weight_kg, p.sku, p.reorder_level,
                COALESCE(SUM(b.qty),0) qty, COALESCE(SUM(b.qty * b.avg_cost),0) value
            FROM products p LEFT JOIN inventory_balances b ON b.product_id = p.id
            WHERE p.is_active = 1 GROUP BY p.id ORDER BY p.name");

        $monthGross = (float) $month['gross'] + (float) $monthRefunds['rc'] - (float) $monthRefunds['r'];
        $stockTotal = ['qty' => 0, 'value' => 0];
        $lowStock = [];
        foreach ($stock as $s) {
            $stockTotal['qty']   += (float) $s['qty'];
            $stockTotal['value'] += (float) $s['value'];
            if ((float) $s['qty'] <= (float) $s['reorder_level']) $lowStock[] = $s;
        }

        json_out([
            'today' => $today, 'week' => $week, 'month' => $month,
            'month_pl' => [
                'revenue' => (float) $month['total'],
                'refunds' => (float) $monthRefunds['r'],
                'cogs_net' => 0,
                'gross_profit' => $monthGross,
                'expenses' => $monthExpenses,
                'writeoffs' => $monthWriteoffs,
                'net_profit' => $monthGross - $monthExpenses - $monthWriteoffs,
            ],
            'stock_by_product' => $stock,
            'stock_total' => $stockTotal,
            'stock_by_location' => all("SELECT l.name, COALESCE(SUM(b.qty),0) qty, COALESCE(SUM(b.qty*b.avg_cost),0) value
                FROM locations l LEFT JOIN inventory_balances b ON b.location_id = l.id GROUP BY l.id ORDER BY l.id"),
            'low_stock' => $lowStock,
            'sales_trend' => all("SELECT DATE(created_at) day, COALESCE(SUM(total),0) total, COUNT(*) count
                FROM sales WHERE DATE(created_at) >= DATE_SUB(CURDATE(), INTERVAL 29 DAY) GROUP BY day ORDER BY day"),
            'by_method_month' => all("SELECT payment_method, COALESCE(SUM(total),0) total FROM sales
                WHERE DATE_FORMAT(created_at,'%Y-%m') = DATE_FORMAT(CURDATE(),'%Y-%m') GROUP BY payment_method"),
            'best_sellers' => all("SELECT p.name, p.bag_weight_kg, SUM(i.qty) bags, SUM(i.line_total) revenue
                FROM sale_items i JOIN sales s ON s.id = i.sale_id JOIN products p ON p.id = i.product_id
                WHERE DATE(s.created_at) >= DATE_SUB(CURDATE(), INTERVAL 29 DAY) GROUP BY p.id ORDER BY bags DESC LIMIT 5"),
            'sales_by_worker' => all("SELECT u.full_name, COUNT(s.id) transactions, COALESCE(SUM(s.total),0) revenue
                FROM users u JOIN sales s ON s.worker_id = u.id
                WHERE DATE(s.created_at) >= DATE_SUB(CURDATE(), INTERVAL 29 DAY) GROUP BY u.id ORDER BY revenue DESC"),
            'recent_sales' => all("SELECT s.id, s.sale_number, s.total, s.payment_method, s.created_at, s.customer_name,
                u.full_name worker_name FROM sales s JOIN users u ON u.id = s.worker_id
                ORDER BY s.created_at DESC, s.id DESC LIMIT 8"),
            'recent_movements' => all("SELECT m.movement_type, m.qty_change, m.created_at, m.reason,
                p.name product_name, p.bag_weight_kg, l.name location_name, u.full_name user_name
                FROM stock_movements m JOIN products p ON p.id = m.product_id
                JOIN locations l ON l.id = m.location_id LEFT JOIN users u ON u.id = m.user_id
                ORDER BY m.created_at DESC, m.id DESC LIMIT 8"),
        ]);
    }

    if ($sub === 'worker' && $method === 'GET') {
        $uid = $USER['id'];
        $today = one("SELECT COALESCE(SUM(total),0) total, COUNT(*) count FROM sales
                      WHERE worker_id = ? AND DATE(created_at) = CURDATE()", [$uid]);
        $byMethod = all("SELECT payment_method, COALESCE(SUM(total),0) total, COUNT(*) count FROM sales
                         WHERE worker_id = ? AND DATE(created_at) = CURDATE() GROUP BY payment_method", [$uid]);
        $recent = all("SELECT s.id, s.sale_number, s.total, s.payment_method, s.created_at,
                (SELECT SUM(i.qty) FROM sale_items i WHERE i.sale_id = s.id) total_bags
             FROM sales s WHERE s.worker_id = ? ORDER BY s.created_at DESC, s.id DESC LIMIT 10", [$uid]);
        json_out(['today' => $today, 'by_method' => $byMethod, 'recent' => $recent]);
    }
}
