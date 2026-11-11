# Jesaka Rice Company — Store Management System (PHP + MySQL)

A rebuild of the Jesaka Rice store management system using **HTML, CSS, JavaScript,
PHP, and MySQL** only. Same features and screens as the original Node version:
inventory, QR-based point of sale, receipts, returns, expenses, profit & loss,
worker management, audit log, and a switchable weighted-average / FIFO costing engine.

---

## Tech stack

| Layer     | Technology |
|-----------|------------|
| Frontend  | HTML, CSS, vanilla JavaScript (single-page app, no framework). Chart.js, jsQR (scanner) and a QR generator load from a CDN. |
| Backend   | PHP 8 (no framework, no Composer) — a small REST API under `/api`. |
| Database  | MySQL / MariaDB (works with XAMPP's bundled MariaDB). |
| Auth      | JSON Web Tokens (HS256), hand-rolled in `api/lib/jwt.php`. |
| Passwords | `password_hash()` / `password_verify()` (bcrypt). |

No build step, no bundler, no external PHP libraries.

---

## Requirements

- **XAMPP** (or any Apache + PHP 8 + MySQL/MariaDB stack). PHP must have the
  `pdo_mysql` extension (on by default in XAMPP).
- Apache **mod_rewrite** enabled (on by default in XAMPP) for clean `/api` URLs.
  If rewriting is unavailable the API still works via `/api/index.php/...`.

---

## Setup (XAMPP, ~2 minutes)

1. **Copy the project** into XAMPP's web root, e.g. `C:\xampp\htdocs\jesaka`
   (so the app lives at `http://localhost/jesaka/`). You can also make it a
   virtual host's document root to serve it at the web root.

2. **Start Apache and MySQL** from the XAMPP Control Panel.

3. **Check the database settings** in [`api/config.php`](api/config.php).
   Defaults match a stock XAMPP install (host `127.0.0.1`, user `root`, no
   password, database `jesaka_rice`). Edit if your MySQL differs.

4. **Run the installer** in your browser — this creates the database, all tables,
   and demo data:

   ```
   http://localhost/jesaka/api/install.php?token=YOUR_INSTALL_TOKEN
   ```

   Replace `YOUR_INSTALL_TOKEN` with the `install_token` value from
   `api/config.php`.

   Add `&fresh=1` to wipe and rebuild everything from scratch at any time.

5. **Open the app:**

   ```
   http://localhost/jesaka/
   ```

### Demo logins (password `jesaka123`)

| Username | Role   | Sees |
|----------|--------|------|
| `admin`  | Admin  | Everything |
| `amina`  | Worker | POS + their own sales |
| `brian`  | Worker | POS + their own sales |

---

## Command-line alternatives

From the project folder (adjust the PHP path for your system):

```bash
# Seed demo data into an already-created schema (imported schema.sql manually)
C:\xampp\php\php.exe api\seed.php           # seed only if empty
C:\xampp\php\php.exe api\seed.php --force    # wipe and reseed
```

You can also import [`api/schema.sql`](api/schema.sql) directly via phpMyAdmin
(create a database named `jesaka_rice` first), then run the seed command above.

---

## Security before going live

1. In [`api/config.php`](api/config.php): change `jwt_secret` to a long random
   string and change `install_token`.
2. **Delete `api/install.php`** once the store is set up.
3. Serve over HTTPS if the app is reachable from the internet.

The web server only ever serves `index.html`, `css/`, `js/`, and the two PHP
entry points (`api/index.php`, `api/install.php`). Everything else under `api/`
(config, database credentials, business logic) is routed through the front
controller and never served as raw files — see [`.htaccess`](.htaccess).

---

## Project layout

```
index.html            App shell (login + SPA)
css/ , js/            Frontend (vanilla JS, one file per page/module)
.htaccess            Routes /api/* to the PHP front controller; hides source files
api/
  config.php         DB credentials, JWT secret, install token
  index.php          Front controller — dispatches /api/<resource>
  install.php        One-click DB creator + seeder (delete after setup)
  schema.sql         MySQL schema
  seed.php           Demo-data generator (runs through the real costing engine)
  lib/               db, jwt, auth, validation, audit, respond, inventory engine
  routes/            One file per resource (auth, products, sales, reports, ...)
```

## API overview

All endpoints live under `/api` and return JSON. Authenticate by sending
`Authorization: Bearer <token>` from `POST /api/auth/login`.

- `auth` — login, me, change password
- `dashboard` — admin overview, worker daily summary
- `products` — catalogue, POS lookup by SKU/QR, create/update (admin)
- `suppliers`, `stock` (receipts / adjustments / movements / balances)
- `sales` — complete a sale (immutable), history (workers see only their own)
- `returns`, `expenses`
- `reports` — profit & loss, sales summary, worker performance, stock valuation
- `users`, `audit`, `settings`

Completed sales are immutable; returns and adjustments reverse stock and cost
through the same costing engine, so every report reconciles.
