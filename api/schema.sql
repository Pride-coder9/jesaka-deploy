-- Jesaka Rice Company — MySQL schema (port of the original SQLite schema).
-- Engine InnoDB for foreign keys + transactions; utf8mb4 throughout.
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS roles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  description VARCHAR(255),
  permissions VARCHAR(500) NOT NULL DEFAULT '{}'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(60) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(120) NOT NULL,
  phone VARCHAR(40),
  role_id INT NOT NULL,
  is_active TINYINT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL,
  CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS suppliers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  contact_person VARCHAR(120),
  phone VARCHAR(40),
  email VARCHAR(160),
  address VARCHAR(255),
  notes TEXT,
  is_active TINYINT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS locations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL UNIQUE,
  is_sales_point TINYINT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sku VARCHAR(60) NOT NULL UNIQUE,
  qr_payload VARCHAR(120) NOT NULL UNIQUE,
  name VARCHAR(160) NOT NULL,
  brand VARCHAR(120),
  bag_weight_kg DECIMAL(8,2) NOT NULL,
  buying_price DECIMAL(14,2) NOT NULL DEFAULT 0,
  selling_price DECIMAL(14,2) NOT NULL,
  supplier_id INT NULL,
  reorder_level INT NOT NULL DEFAULT 10,
  is_active TINYINT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL,
  CONSTRAINT fk_products_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS inventory_balances (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  location_id INT NOT NULL,
  qty INT NOT NULL DEFAULT 0,
  avg_cost DECIMAL(16,4) NOT NULL DEFAULT 0,
  UNIQUE KEY uq_balance (product_id, location_id),
  CONSTRAINT fk_bal_product FOREIGN KEY (product_id) REFERENCES products(id),
  CONSTRAINT fk_bal_location FOREIGN KEY (location_id) REFERENCES locations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cost_layers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  location_id INT NOT NULL,
  qty_remaining DECIMAL(14,3) NOT NULL,
  unit_cost DECIMAL(16,4) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS stock_receipts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  receipt_number VARCHAR(40) NOT NULL UNIQUE,
  supplier_id INT NULL,
  location_id INT NOT NULL,
  invoice_ref VARCHAR(80),
  transport_cost DECIMAL(14,2) NOT NULL DEFAULT 0,
  other_cost DECIMAL(14,2) NOT NULL DEFAULT 0,
  goods_cost DECIMAL(14,2) NOT NULL DEFAULT 0,
  total_cost DECIMAL(14,2) NOT NULL DEFAULT 0,
  notes TEXT,
  received_by INT NOT NULL,
  received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_receipt_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
  CONSTRAINT fk_receipt_location FOREIGN KEY (location_id) REFERENCES locations(id),
  CONSTRAINT fk_receipt_user FOREIGN KEY (received_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS stock_receipt_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  receipt_id INT NOT NULL,
  product_id INT NOT NULL,
  qty INT NOT NULL,
  unit_cost DECIMAL(16,4) NOT NULL,
  landed_unit_cost DECIMAL(16,4) NOT NULL,
  line_total DECIMAL(14,2) NOT NULL,
  CONSTRAINT fk_ritem_receipt FOREIGN KEY (receipt_id) REFERENCES stock_receipts(id),
  CONSTRAINT fk_ritem_product FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS stock_adjustments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  adjustment_number VARCHAR(40) NOT NULL UNIQUE,
  product_id INT NOT NULL,
  location_id INT NOT NULL,
  qty_change INT NOT NULL,
  reason_type ENUM('spoilage','damage','theft','return_to_supplier','correction') NOT NULL,
  reason VARCHAR(255) NOT NULL,
  unit_cost DECIMAL(16,4) NOT NULL DEFAULT 0,
  total_cost DECIMAL(14,2) NOT NULL DEFAULT 0,
  adjusted_by INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_adj_product FOREIGN KEY (product_id) REFERENCES products(id),
  CONSTRAINT fk_adj_location FOREIGN KEY (location_id) REFERENCES locations(id),
  CONSTRAINT fk_adj_user FOREIGN KEY (adjusted_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS stock_movements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  location_id INT NOT NULL,
  movement_type ENUM('receipt','sale','adjustment','return_in','write_off') NOT NULL,
  qty_change INT NOT NULL,
  unit_cost DECIMAL(16,4) NOT NULL DEFAULT 0,
  reference_type VARCHAR(40),
  reference_id INT,
  reason VARCHAR(255),
  user_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_mv_product FOREIGN KEY (product_id) REFERENCES products(id),
  CONSTRAINT fk_mv_location FOREIGN KEY (location_id) REFERENCES locations(id),
  CONSTRAINT fk_mv_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sales (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sale_number VARCHAR(40) NOT NULL UNIQUE,
  worker_id INT NOT NULL,
  location_id INT NOT NULL,
  customer_name VARCHAR(160),
  customer_phone VARCHAR(40),
  subtotal DECIMAL(14,2) NOT NULL DEFAULT 0,
  total DECIMAL(14,2) NOT NULL DEFAULT 0,
  total_cost DECIMAL(14,2) NOT NULL DEFAULT 0,
  payment_method ENUM('cash','mobile_money','bank','credit') NOT NULL,
  status ENUM('completed') NOT NULL DEFAULT 'completed',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sale_worker FOREIGN KEY (worker_id) REFERENCES users(id),
  CONSTRAINT fk_sale_location FOREIGN KEY (location_id) REFERENCES locations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sale_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sale_id INT NOT NULL,
  product_id INT NOT NULL,
  qty INT NOT NULL,
  unit_price DECIMAL(14,2) NOT NULL,
  unit_cost DECIMAL(16,4) NOT NULL,
  line_total DECIMAL(14,2) NOT NULL,
  line_cost DECIMAL(14,2) NOT NULL,
  CONSTRAINT fk_sitem_sale FOREIGN KEY (sale_id) REFERENCES sales(id),
  CONSTRAINT fk_sitem_product FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sale_id INT NOT NULL,
  method VARCHAR(30) NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  reference VARCHAR(80),
  received_by INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pay_sale FOREIGN KEY (sale_id) REFERENCES sales(id),
  CONSTRAINT fk_pay_user FOREIGN KEY (received_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS returns (
  id INT AUTO_INCREMENT PRIMARY KEY,
  return_number VARCHAR(40) NOT NULL UNIQUE,
  sale_id INT NOT NULL,
  reason VARCHAR(255) NOT NULL,
  refund_total DECIMAL(14,2) NOT NULL DEFAULT 0,
  cost_restocked DECIMAL(14,2) NOT NULL DEFAULT 0,
  cost_written_off DECIMAL(14,2) NOT NULL DEFAULT 0,
  processed_by INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ret_sale FOREIGN KEY (sale_id) REFERENCES sales(id),
  CONSTRAINT fk_ret_user FOREIGN KEY (processed_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS return_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  return_id INT NOT NULL,
  sale_item_id INT NOT NULL,
  product_id INT NOT NULL,
  qty INT NOT NULL,
  unit_price DECIMAL(14,2) NOT NULL,
  unit_cost DECIMAL(16,4) NOT NULL,
  resellable TINYINT NOT NULL DEFAULT 1,
  line_refund DECIMAL(14,2) NOT NULL,
  CONSTRAINT fk_retitem_return FOREIGN KEY (return_id) REFERENCES returns(id),
  CONSTRAINT fk_retitem_saleitem FOREIGN KEY (sale_item_id) REFERENCES sale_items(id),
  CONSTRAINT fk_retitem_product FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS expenses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  category ENUM('rent','transport','salaries','utilities','packaging','misc') NOT NULL,
  description VARCHAR(255) NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  expense_date DATE NOT NULL,
  recorded_by INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_exp_user FOREIGN KEY (recorded_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pl_summaries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  revenue DECIMAL(14,2) NOT NULL DEFAULT 0,
  refunds DECIMAL(14,2) NOT NULL DEFAULT 0,
  net_revenue DECIMAL(14,2) NOT NULL DEFAULT 0,
  cogs DECIMAL(14,2) NOT NULL DEFAULT 0,
  gross_profit DECIMAL(14,2) NOT NULL DEFAULT 0,
  expenses_total DECIMAL(14,2) NOT NULL DEFAULT 0,
  writeoffs_total DECIMAL(14,2) NOT NULL DEFAULT 0,
  net_profit DECIMAL(14,2) NOT NULL DEFAULT 0,
  breakdown MEDIUMTEXT,
  generated_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pl_user FOREIGN KEY (generated_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT,
  username VARCHAR(60),
  action VARCHAR(40) NOT NULL,
  entity_type VARCHAR(40) NOT NULL,
  entity_id VARCHAR(40),
  old_values MEDIUMTEXT,
  new_values MEDIUMTEXT,
  ip_address VARCHAR(64),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS settings (
  skey VARCHAR(64) PRIMARY KEY,
  svalue TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_movements_product ON stock_movements(product_id, created_at);
CREATE INDEX idx_movements_created ON stock_movements(created_at);
CREATE INDEX idx_sales_created ON sales(created_at);
CREATE INDEX idx_sales_worker ON sales(worker_id, created_at);
CREATE INDEX idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX idx_layers_product ON cost_layers(product_id, location_id, created_at);
CREATE INDEX idx_audit_created ON audit_logs(created_at);
CREATE INDEX idx_expenses_date ON expenses(expense_date);

SET FOREIGN_KEY_CHECKS = 1;
