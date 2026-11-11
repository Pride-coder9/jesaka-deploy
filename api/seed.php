<?php
/**
 * Demo/seed data for Jesaka Rice Company (port of the original seed.js).
 * Seeded receipts, sales, the write-off and the return all flow through the
 * real costing engine, so every report (P&L, valuation, movements) reconciles.
 */

function bootstrap_defaults() {
    if ((int) scalar('SELECT COUNT(*) FROM roles') === 0) {
        q("INSERT INTO roles (name, description, permissions) VALUES ('admin', 'Full access to every module', '{\"all\":true}')");
        q("INSERT INTO roles (name, description, permissions) VALUES ('worker', 'Point of sale and own sales history only', '{\"pos\":true,\"sales_own\":true}')");
    }
    if ((int) scalar('SELECT COUNT(*) FROM locations') === 0) {
        q("INSERT INTO locations (name, is_sales_point) VALUES ('Main Store', 1)");
        q("INSERT INTO locations (name, is_sales_point) VALUES ('Back Warehouse', 0)");
    }
    $defaults = [
        'store_name'                => 'Jesaka Rice Company',
        'currency'                  => 'UGX',
        'costing_method'            => 'weighted_average',
        'default_sales_location_id' => '1',
        'receipt_footer'            => 'Thank you for buying from Jesaka Rice Company!',
        'store_phone'               => '+256 700 000 000',
        'store_address'             => 'Plot 14, Nakasero Market Rd, Kampala',
    ];
    foreach ($defaults as $k => $v) q('INSERT IGNORE INTO settings (skey, svalue) VALUES (?, ?)', [$k, $v]);
}

/**
 * Empty start for going live: create roles/locations/settings and a single
 * admin account, with NO demo data. Returns false if any user already exists
 * (so it never clobbers a real account). Used by install.php?demo=0.
 */
function init_empty($adminUsername, $adminPassword, $adminFullName = 'Store Administrator') {
    bootstrap_defaults();
    if ((int) scalar('SELECT COUNT(*) FROM users') > 0) return false;
    $adminRole = (int) scalar("SELECT id FROM roles WHERE name = 'admin'");
    q('INSERT INTO users (username, password_hash, full_name, role_id) VALUES (?, ?, ?, ?)',
        [strtolower($adminUsername), password_hash($adminPassword, PASSWORD_BCRYPT), $adminFullName, $adminRole]);
    return true;
}

function seed_day($offset, $h = 10, $m = 0) {
    $d = new DateTime('now');
    $d->modify("$offset day");
    $d->setTime((int) $h, (int) $m, mt_rand(0, 59));
    return $d;
}
function seed_iso(DateTime $d) { return $d->format('Y-m-d H:i:s'); }
function seed_pick(array $a) { return $a[array_rand($a)]; }

/** Returns true if it seeded, false if data already existed (and not forced). */
function seed_demo($force = false) {
    bootstrap_defaults();
    if ((int) scalar('SELECT COUNT(*) FROM users') > 0 && !$force) return false;

    if ($force) {
        $tables = ['audit_logs', 'pl_summaries', 'return_items', 'returns', 'payments', 'sale_items', 'sales',
            'stock_movements', 'stock_adjustments', 'stock_receipt_items', 'stock_receipts', 'cost_layers',
            'inventory_balances', 'expenses', 'products', 'suppliers', 'users'];
        db()->exec('SET FOREIGN_KEY_CHECKS = 0');
        foreach ($tables as $t) db()->exec("DELETE FROM $t");
        foreach ($tables as $t) db()->exec("ALTER TABLE $t AUTO_INCREMENT = 1");
        db()->exec('SET FOREIGN_KEY_CHECKS = 1');
    }

    $hash = password_hash('jesaka123', PASSWORD_BCRYPT);
    $adminRole = (int) scalar("SELECT id FROM roles WHERE name = 'admin'");
    $workerRole = (int) scalar("SELECT id FROM roles WHERE name = 'worker'");

    $pdo = db();
    $pdo->beginTransaction();
    try {
        q('INSERT INTO users (username, password_hash, full_name, phone, role_id) VALUES (?, ?, ?, ?, ?)', ['admin', $hash, 'Joseph Sakwa', '+256 700 111 222', $adminRole]);
        $adminId = last_id();
        q('INSERT INTO users (username, password_hash, full_name, phone, role_id) VALUES (?, ?, ?, ?, ?)', ['amina', $hash, 'Amina Nakato', '+256 701 333 444', $workerRole]);
        $aminaId = last_id();
        q('INSERT INTO users (username, password_hash, full_name, phone, role_id) VALUES (?, ?, ?, ?, ?)', ['brian', $hash, 'Brian Okello', '+256 702 555 666', $workerRole]);
        $brianId = last_id();
        $workers = [$aminaId, $brianId];

        $insSup = 'INSERT INTO suppliers (name, contact_person, phone, email, address) VALUES (?, ?, ?, ?, ?)';
        q($insSup, ['Kibimba Rice Millers', 'Grace Auma', '+256 772 100 200', 'sales@kibimba.co.ug', 'Bugiri District']); $sup1 = last_id();
        q($insSup, ['Doho Rice Scheme', 'Peter Wanyama', '+256 772 300 400', 'orders@doho.co.ug', 'Butaleja District']); $sup2 = last_id();
        q($insSup, ['Kampala Grain Traders', 'Sarah Nambi', '+256 772 500 600', 'info@kgt.co.ug', 'Kikuubo, Kampala']); $sup3 = last_id();

        $productDefs = [
            ['JRC-KAISO-25KG', 'Super Kaiso', 'Kibimba', 25, 78000, 95000, $sup1, 40],
            ['JRC-KAISO-50KG', 'Super Kaiso', 'Kibimba', 50, 152000, 185000, $sup1, 25],
            ['JRC-SUPA-25KG', 'Supa Rice', 'Doho', 25, 90000, 110000, $sup2, 30],
            ['JRC-SINDANO-25KG', 'Sindano Long Grain', 'Doho', 25, 70000, 86000, $sup2, 30],
            ['JRC-BASMATI-25KG', 'Basmati Aromatic', 'Imported', 25, 130000, 158000, $sup3, 20],
            ['JRC-NERICA-50KG', 'Upland Nerica 4', 'Local', 50, 138000, 168000, $sup3, 15],
        ];
        $products = [];
        foreach ($productDefs as $d) {
            [$sku, $name, $brand, $kg, $buy, $sell, $sup, $reorder] = $d;
            q('INSERT INTO products (sku, qr_payload, name, brand, bag_weight_kg, buying_price, selling_price, supplier_id, reorder_level)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [$sku, $sku, $name, $brand, $kg, $buy, $sell, $sup, $reorder]);
            $products[] = ['id' => last_id(), 'sku' => $sku, 'name' => $name, 'kg' => $kg, 'buy' => $buy, 'sell' => $sell, 'sup' => $sup];
        }

        // ---- Stock receipts (opening stock ~35 and ~15 days ago) ----
        $receiptDefs = [
            ['offset' => -35, 'supplier' => $sup1, 'invoice' => 'KIB-4471', 'transport' => 400000, 'lines' => [[0, 220], [1, 120]]],
            ['offset' => -35, 'supplier' => $sup2, 'invoice' => 'DOH-1203', 'transport' => 250000, 'lines' => [[2, 150], [3, 160]]],
            ['offset' => -33, 'supplier' => $sup3, 'invoice' => 'KGT-0088', 'transport' => 300000, 'lines' => [[4, 90], [5, 70]]],
            ['offset' => -15, 'supplier' => $sup1, 'invoice' => 'KIB-4519', 'transport' => 350000, 'lines' => [[0, 150], [1, 80]]],
            ['offset' => -12, 'supplier' => $sup2, 'invoice' => 'DOH-1266', 'transport' => 200000, 'lines' => [[2, 100], [3, 100]]],
        ];
        foreach ($receiptDefs as $r) {
            $when = seed_iso(seed_day($r['offset'], 9));
            $dateStr = substr($when, 0, 10);
            $goods = 0;
            foreach ($r['lines'] as [$pi, $qty]) $goods += $qty * $products[$pi]['buy'];
            $number = inv_next_doc_number('JRR', 'stock_receipts', 'receipt_number', $dateStr);
            q('INSERT INTO stock_receipts (receipt_number, supplier_id, location_id, invoice_ref, transport_cost, other_cost, goods_cost, total_cost, received_by, received_at)
               VALUES (?, ?, 1, ?, ?, 0, ?, ?, ?, ?)',
                [$number, $r['supplier'], $r['invoice'], $r['transport'], $goods, $goods + $r['transport'], $adminId, $when]);
            $receiptId = last_id();
            foreach ($r['lines'] as [$pi, $qty]) {
                $p = $products[$pi];
                $share = ($qty * $p['buy']) / $goods;
                $landed = $p['buy'] + ($r['transport'] * $share) / $qty;
                q('INSERT INTO stock_receipt_items (receipt_id, product_id, qty, unit_cost, landed_unit_cost, line_total)
                   VALUES (?, ?, ?, ?, ?, ?)', [$receiptId, $p['id'], $qty, $p['buy'], $landed, $qty * $p['buy']]);
                inv_add_stock(['productId' => $p['id'], 'locationId' => 1, 'qty' => $qty, 'unitCost' => $landed,
                    'movementType' => 'receipt', 'referenceType' => 'stock_receipt', 'referenceId' => $receiptId,
                    'userId' => $adminId, 'createdAt' => $when]);
            }
        }

        // ---- ~30 days of sales through the real costing engine ----
        $customers = [null, null, 'Mama Sarah Restaurant', 'Kansanga Boarding School', 'Mukwano Retail Shop', 'Hotel Diplomat', null, 'St. Jude Church'];
        $methods = ['cash', 'cash', 'cash', 'mobile_money', 'mobile_money', 'bank', 'credit'];
        $lastSaleId = null;

        for ($offset = -29; $offset <= 0; $offset++) {
            $salesToday = $offset === 0 ? 3 : 1 + mt_rand(0, 3);
            for ($n = 0; $n < $salesToday; $n++) {
                $when = seed_iso(seed_day($offset, 8 + mt_rand(0, 9), mt_rand(0, 59)));
                $dateStr = substr($when, 0, 10);
                $worker = seed_pick($workers);
                $method = seed_pick($methods);
                $customer = seed_pick($customers);
                $number = inv_next_doc_number('JRS', 'sales', 'sale_number', $dateStr);
                $phone = $customer ? '+256 75' . (string) mt_rand(1000000, 1899999) : null;
                q('INSERT INTO sales (sale_number, worker_id, location_id, customer_name, customer_phone, subtotal, total, total_cost, payment_method, created_at)
                   VALUES (?, ?, 1, ?, ?, 0, 0, 0, ?, ?)', [$number, $worker, $customer, $phone, $method, $when]);
                $saleId = last_id();

                $subtotal = 0; $totalCost = 0; $lines = 0;
                $chosen = [];
                $lineCount = 1 + mt_rand(0, 2);
                for ($li = 0; $li < $lineCount; $li++) {
                    $p = seed_pick($products);
                    if (in_array($p['id'], $chosen, true)) continue;
                    $chosen[] = $p['id'];
                    $qty = 1 + mt_rand(0, 5);
                    try {
                        $out = inv_remove_stock(['productId' => $p['id'], 'locationId' => 1, 'qty' => $qty, 'movementType' => 'sale',
                            'referenceType' => 'sale', 'referenceId' => $saleId, 'userId' => $worker, 'createdAt' => $when]);
                        q('INSERT INTO sale_items (sale_id, product_id, qty, unit_price, unit_cost, line_total, line_cost)
                           VALUES (?, ?, ?, ?, ?, ?, ?)', [$saleId, $p['id'], $qty, $p['sell'], $out['unitCost'], $qty * $p['sell'], $qty * $out['unitCost']]);
                        $subtotal += $qty * $p['sell'];
                        $totalCost += $qty * $out['unitCost'];
                        $lines++;
                    } catch (Throwable $e) { /* out of stock in demo generation — skip line */ }
                }
                if ($lines === 0) { q('DELETE FROM sales WHERE id = ?', [$saleId]); continue; }
                q('UPDATE sales SET subtotal = ?, total = ?, total_cost = ? WHERE id = ?', [$subtotal, $subtotal, $totalCost, $saleId]);
                q('INSERT INTO payments (sale_id, method, amount, reference, received_by, created_at) VALUES (?, ?, ?, ?, ?, ?)',
                    [$saleId, $method, $subtotal, $method === 'mobile_money' ? 'MM' . mt_rand(0, 99999999) : null, $worker, $when]);
                $lastSaleId = $saleId;
            }
        }

        // ---- One spoilage write-off ----
        $spoiled = $products[3];
        $when = seed_iso(seed_day(-6, 17));
        $adjNo = inv_next_doc_number('JRA', 'stock_adjustments', 'adjustment_number', substr($when, 0, 10));
        $out = inv_remove_stock(['productId' => $spoiled['id'], 'locationId' => 1, 'qty' => 4, 'movementType' => 'write_off',
            'referenceType' => 'stock_adjustment', 'reason' => 'spoilage: soaked by roof leak', 'userId' => $adminId, 'createdAt' => $when]);
        q("INSERT INTO stock_adjustments (adjustment_number, product_id, location_id, qty_change, reason_type, reason, unit_cost, total_cost, adjusted_by, created_at)
           VALUES (?, ?, 1, -4, 'spoilage', 'Bags soaked by roof leak during heavy rain', ?, ?, ?, ?)",
            [$adjNo, $spoiled['id'], $out['unitCost'], $out['totalCost'], $adminId, $when]);

        // ---- One return against the most recent sale ----
        if ($lastSaleId) {
            $si = one('SELECT * FROM sale_items WHERE sale_id = ? LIMIT 1', [$lastSaleId]);
            if ($si) {
                $rWhen = seed_iso(seed_day(0, 18));
                $rNo = inv_next_doc_number('JRT', 'returns', 'return_number', substr($rWhen, 0, 10));
                $sale = one('SELECT * FROM sales WHERE id = ?', [$lastSaleId]);
                q("INSERT INTO returns (return_number, sale_id, reason, refund_total, cost_restocked, cost_written_off, processed_by, created_at)
                   VALUES (?, ?, 'Customer bought wrong bag size', ?, ?, 0, ?, ?)",
                    [$rNo, $lastSaleId, $si['unit_price'], $si['unit_cost'], $adminId, $rWhen]);
                $retId = last_id();
                q('INSERT INTO return_items (return_id, sale_item_id, product_id, qty, unit_price, unit_cost, resellable, line_refund)
                   VALUES (?, ?, ?, 1, ?, ?, 1, ?)', [$retId, $si['id'], $si['product_id'], $si['unit_price'], $si['unit_cost'], $si['unit_price']]);
                inv_add_stock(['productId' => $si['product_id'], 'locationId' => $sale['location_id'], 'qty' => 1, 'unitCost' => (float) $si['unit_cost'],
                    'movementType' => 'return_in', 'referenceType' => 'return', 'referenceId' => $retId, 'userId' => $adminId, 'createdAt' => $rWhen]);
            }
        }

        // ---- Operating expenses (this month and last) ----
        $d0 = new DateTime('now');
        $lastMonth = new DateTime('first day of last month');
        $ym = function (DateTime $d, $dd) { return $d->format('Y-m') . '-' . str_pad((string) $dd, 2, '0', STR_PAD_LEFT); };
        $expenses = [
            [$d0, 1, 'rent', 'Store rent — Nakasero', 1200000],
            [$lastMonth, 1, 'rent', 'Store rent — Nakasero', 1200000],
            [$lastMonth, 28, 'salaries', 'Staff salaries', 1500000],
            [$d0, 5, 'utilities', 'UMEME electricity + NWSC water', 185000],
            [$d0, 8, 'transport', 'Boda deliveries to customers', 96000],
            [$d0, 11, 'packaging', 'Small packing bags (2kg/5kg repack)', 60000],
            [$d0, 14, 'misc', 'Weighing scale calibration', 45000],
            [$lastMonth, 20, 'transport', 'Truck hire — Kibimba pickup', 400000],
        ];
        foreach ($expenses as [$d, $dd, $cat, $desc, $amt]) {
            q('INSERT INTO expenses (category, description, amount, expense_date, recorded_by) VALUES (?, ?, ?, ?, ?)',
                [$cat, $desc, $amt, $ym($d, $dd), $adminId]);
        }

        q("INSERT INTO audit_logs (user_id, username, action, entity_type, entity_id, new_values)
           VALUES (?, 'admin', 'seed', 'system', 'demo', '{\"note\":\"Demo data loaded\"}')", [$adminId]);

        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
    return true;
}

// CLI usage:  php seed.php          (seed only if empty)
//             php seed.php --force  (wipe and reseed)
if (PHP_SAPI === 'cli' && isset($argv[0]) && realpath($argv[0]) === realpath(__FILE__)) {
    require __DIR__ . '/lib/database.php';
    require __DIR__ . '/lib/respond.php';
    require __DIR__ . '/lib/inventory.php';
    $force = in_array('--force', $argv, true);
    $done = seed_demo($force);
    echo $done ? "Seed complete.\n" : "Database already has data — run with --force to wipe and reseed.\n";
}
