<?php
/** /api/expenses — admin operating-cost ledger. */

function expense_schema($partial = false) {
    return [
        'category'     => ['type' => 'enum', 'values' => ['rent', 'transport', 'salaries', 'utilities', 'packaging', 'misc'], 'required' => !$partial],
        'description'  => ['type' => 'string', 'trim' => true, 'min' => 2, 'required' => !$partial, 'message' => 'Description is required'],
        'amount'       => ['type' => 'number', 'positive' => true, 'required' => !$partial, 'message' => 'Amount must be positive'],
        'expense_date' => ['type' => 'date', 'required' => !$partial, 'message' => 'Date must be YYYY-MM-DD'],
    ];
}

function route_expenses($method, $rest, $body) {
    global $USER;
    authenticate();
    require_admin();

    if (count($rest) === 0) {
        if ($method === 'GET') {
            $from = (string) ($_GET['from'] ?? '');
            $to   = (string) ($_GET['to'] ?? '');
            $cat  = (string) ($_GET['category'] ?? '');
            $page = max(1, (int) ($_GET['page'] ?? 1));
            $lim  = min(100, max(1, (int) ($_GET['limit'] ?? 25)));
            $off  = ($page - 1) * $lim;
            $where = "WHERE (? = '' OR e.expense_date >= ?) AND (? = '' OR e.expense_date <= ?) AND (? = '' OR e.category = ?)";
            $args = [$from, $from, $to, $to, $cat, $cat];
            $total = (int) scalar("SELECT COUNT(*) FROM expenses e $where", $args);
            $sum   = (float) scalar("SELECT COALESCE(SUM(e.amount),0) FROM expenses e $where", $args);
            $rows = all("SELECT e.*, u.full_name AS recorded_by_name FROM expenses e JOIN users u ON u.id = e.recorded_by
                $where ORDER BY e.expense_date DESC, e.id DESC LIMIT $lim OFFSET $off", $args);
            json_out(['data' => $rows, 'total' => $total, 'total_amount' => $sum, 'page' => $page, 'pages' => (int) ceil($total / $lim)]);
        }
        if ($method === 'POST') {
            $b = validate($body, expense_schema(false));
            q('INSERT INTO expenses (category, description, amount, expense_date, recorded_by) VALUES (?, ?, ?, ?, ?)',
                [$b['category'], $b['description'], $b['amount'], $b['expense_date'], $USER['id']]);
            $created = one('SELECT * FROM expenses WHERE id = ?', [last_id()]);
            audit('create', 'expense', $created['id'], null, $created);
            json_out($created, 201);
        }
    }

    if (isset($rest[0]) && ctype_digit((string) $rest[0])) {
        $id = (int) $rest[0];
        if ($method === 'PUT') {
            $before = one('SELECT * FROM expenses WHERE id = ?', [$id]);
            if (!$before) error_out('Expense not found', 404);
            $patch = validate($body, expense_schema(true), true);
            $b = array_merge($before, $patch);
            q('UPDATE expenses SET category=?, description=?, amount=?, expense_date=? WHERE id=?',
                [$b['category'], $b['description'], $b['amount'], $b['expense_date'], $id]);
            $after = one('SELECT * FROM expenses WHERE id = ?', [$id]);
            audit('update', 'expense', $id, $before, $after);
            json_out($after);
        }
        if ($method === 'DELETE') {
            $before = one('SELECT * FROM expenses WHERE id = ?', [$id]);
            if (!$before) error_out('Expense not found', 404);
            q('DELETE FROM expenses WHERE id = ?', [$id]);
            audit('delete', 'expense', $id, $before, null);
            json_out(['message' => 'Expense deleted']);
        }
    }
}
