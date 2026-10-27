# AquaTracker — Apache + PHP + MySQL backend

This is the MySQL-backed implementation of the AquaTracker API. It replaces the
Node/Express backend in `../backend` for serving the app, and it is what runs at
<http://localhost:8080>.

The Node backend is untouched and still works on port 3001, so you can switch
between the two implementations at any time to compare or to roll back.

---

## Getting started

Double-click **`start-aquatracker.bat`**. It starts MySQL and Apache (skipping
either if it is already running), waits for both to answer, prints the URLs, and
opens the app. It takes about eight seconds from cold.

Then open <http://localhost:8080/install> once to create the database and tables.

| Role     | Email                       | Password          |
| -------- | --------------------------- | ----------------- |
| Customer | `customer.demo@example.com` | `CustomerDemo123!` |
| Owner    | `owner.demo@example.com`    | `OwnerDemo123!`   |
| Staff    | `staff.demo@example.com`    | `StaffDemo123!`   |

phpMyAdmin is untouched and still works on port 80 at
<http://localhost/phpmyadmin>.

There is **no database password to set**. `api/config.php` already points at the
right host, port and database, and this instance was initialised with an empty
root password. If you ever give root a password, put it in `AQ_DB_PASS`.

### After a reboot

Run `start-aquatracker.bat` again. Neither server is a Windows service on this
machine, so the script is the way back up. To stop things again:

```powershell
Get-CimInstance Win32_Process -Filter "Name='mysqld.exe'" | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Get-Process httpd | Stop-Process -Force
Remove-Item C:\xampp\apache\logs\httpd.pid -Force -ErrorAction SilentlyContinue
```

---

## The database is not XAMPP's MySQL

This is the one part of the setup that is deliberately unusual, so it is worth
reading before you change anything.

XAMPP ships MariaDB 10.4.32, and **that build is not usable on this machine**:

- it asserted during a plain startup, before AquaTracker sent a single request —
  `InnoDB: Failing assertion: slot` at `os0file.cc:6132`;
- under load it deadlocked inside InnoDB on a lost buffer-pool latch (reserved by
  "thread id 0", never released) while holding `DICT_SYS` exclusively, blocked
  every other connection, and then killed itself on purpose:
  `InnoDB: Semaphore wait has lasted > 600 seconds. We intentionally crash the
  server because it appears to be hung.`

Both are engine bugs. No schema or query change fixes them, and the second one
takes the whole site down, so AquaTracker does not use that server.

Instead it runs **MySQL Server 26.7**, which was already installed here, against
its own private data directory:

| | |
| --- | --- |
| Server | `C:\Program Files\MySQL\MySQL Server 26.7\bin\mysqld.exe` |
| Config | `mysql/my-aquatracker.ini` |
| Data | `C:\xampp\mysql\data-aquatracker` |
| Port | **3307** |
| User | `root`, empty password |

Two details behind that choice:

- **A private data directory.** The existing one,
  `C:\ProgramData\MySQL\MySQL Server 26.7\Data`, belongs to the `MySQL267`
  service (running as NetworkService) and is access-denied for a normal user, so
  that service cannot be reconfigured or started without elevation. A private
  directory sidesteps that, and keeps AquaTracker completely isolated from every
  other database on the machine. Nothing that was already installed is touched.
- **Port 3307, not 3306**, so this instance cannot collide with any other MySQL
  or MariaDB server started later on the default port.

XAMPP's own `mysql/bin/my.ini` is left exactly as it shipped — AquaTracker does
not use it.

---

## How it is wired

```
Browser
  |
  |-- http://localhost:8080/                     landing page
  |-- http://localhost:8080/css|/js|/assets|/pages  static files
  |-- http://localhost:8080/api/orders           JSON API
  |-- http://localhost:8080/dashboard/customer   dashboards
  |-- http://localhost:8080/auth/customer/login  sign in / register
  |
  v
Apache vhost  (conf/extra/httpd-aquatracker.conf)
  |
  |-- real file on disk  -> served as-is
  `-- anything else      -> FallbackResource -> php-backend/api/index.php
                              |
                              v
                            Router  ->  Controller  ->  MySQL 26.7 (:3307)
```

The vhost lives in a **single removable file**:
`C:\xampp\apache\conf\extra\httpd-aquatracker.conf`, included from
`httpd-xampp.conf`. Comment out that one `Include` line to remove AquaTracker
from Apache completely.

### Why the document root is `php-backend/api`, not `frontend/`

Putting the document root on the API directory means no HTML, CSS or JS file can
ever be executed as PHP, and the web server has no write access to the frontend.
The frontend is exposed through `Alias` rules instead, so it stays in the project
folder and edits show up on refresh with no copy step.

### Why `FallbackResource` and not `mod_rewrite`

The project path contains spaces (`AQUATRACKER UI/New folder`). `mod_rewrite`
percent-encodes spaces into the rewritten path, and Apache then fails to map it
back and answers **400 Bad Request** for every request. `FallbackResource` does
the same front-controller dispatch without rewriting filesystem paths, so there
is no `.htaccess` anywhere in this backend.

---

## Layout

```
php-backend/
├── start-aquatracker.bat    double-click this to bring everything up
├── start-aquatracker.ps1    the actual start logic
├── mysql/
│   └── my-aquatracker.ini    the database server's config
├── schema.sql                all tables + station/inventory/request seed data
├── install.php               the installer (http://localhost:8080/install)
└── api/
    ├── config.php            DB credentials and shared constants
    ├── index.php             front controller: the whole route table
    └── src/
        ├── Database.php      PDO wrapper + friendly connection errors
        ├── Http.php          Request / Response helpers
        ├── Router.php        ":param" routing with middleware chains
        ├── Auth.php          accounts, password hashing, sessions, role guards
        └── Controllers/
            ├── AuthController.php       sign in, sign up, session, staff approvals
            ├── CommerceController.php   stations, orders, subscriptions
            ├── StaffController.php      shifts, inventory, requests, notifications
            ├── OwnerController.php      overview, pricing, settings, customers
            └── PageController.php       page routes
```

---

## Behaviour notes

**Sessions** live in the `sessions` table, keyed by a random token in the
`aquatracker_session` cookie. Passwords use `password_hash()` /
`password_verify()`. Logout deletes the row server-side, so a copied cookie
stops working immediately.

**Unauthenticated API calls return `401` with a JSON body.** The Node backend
redirected instead, which made `fetch()` follow into an HTML login page and fail
inside `response.json()`. Page routes still redirect to the login form.

**New staff accounts start as `pending`** and cannot sign in until an owner
approves them from `/api/staff-approvals`.

**Orders** are stored with the customer-facing status `New order`; the staff and
owner views normalise that to `New` on read, matching the previous behaviour.

**Order ids come from a counter, not `COUNT(*)`.** They stay human-friendly
(`AT-2001`), which rules out a UUID — but deriving them from
`SELECT COUNT(*) FROM orders` is a read-then-write race, and two overlapping
orders would be handed the same id, with one dying on a duplicate-key error. That
was reproduced at 8 concurrent clients before this was fixed. `id_sequence` holds
a single row that `CommerceController` increments with
`LAST_INSERT_ID(value + 1)`, so the server hands out distinct numbers.

**Station coordinates** are real columns (`lat`, `lng`), which is what the
nearest-station filter in Step 1 of the order flow needs. `alka` has no
coordinates, so it is skipped by the proximity filter — that is intentional and
handled by `getNearestStations()` on the frontend. Its `address` repeats its
`area` and its rating is `0`, because no fixture for that station exists
anywhere in the repo; `0` means "not yet rated", so it simply drops out of a
"top rated" filter rather than outranking anything.

**JSON-shaped columns** (`permissions`, `attendance`, pricing, settings) are
stored as `TEXT` and encoded in PHP, so the schema behaves identically on MySQL
and MariaDB.

**Re-running the installer is safe.** `CREATE TABLE IF NOT EXISTS` everywhere,
`INSERT IGNORE` for the seeds, and the demo accounts are left alone if they
already exist. The one statement that is an *upsert* rather than an insert is the
station catalogue, so that re-running repairs a row seeded without its
descriptive fields. It only ever touches the `stations` table — users, orders,
subscriptions and the owner-edited `station_settings` / `station_pricing` blobs
are never rewritten.

---

## Tests

Three suites, all run against the live server on port 8080. Start the stack
first, then run each with `node` from this directory. They exit non-zero on
failure, so they work in CI or a git hook.

| File | What it covers |
| --- | --- |
| `tests/api.test.mjs` | 101 checks: every page route, both login flows, session lifecycle, orders and volume pricing, subscriptions, staff shifts/inventory/requests, the owner screens, staff approval, role enforcement, data isolation between customers, malformed input and SQL-injection attempts. Safe to re-run. |
| `tests/stations.test.mjs` | 28 checks: the live `/api/stations` payload against the frontend's own `getNearestStations()` and haversine maths, copied verbatim from `frontend/js/dashboard.js` and `location.js`. Fails if the station JSON contract ever changes. |
| `tests/concurrency.test.mjs` | 8 clients × 6 rounds of sign in → read stations → place an order → list orders → sign out. This is what exposed the `COUNT(*)` order-id collision. |

The last two are not ceremony. `concurrency.test.mjs` caught a duplicate-key 500
under load, and `stations.test.mjs` caught the station catalogue being seeded
with empty addresses, phone numbers, hours and a `rating` of `0.0`.

---

## Troubleshooting

**Nothing responds on 8080** — run `start-aquatracker.bat`. If it reports that
Apache would not start, confirm Apache picked up the config with
`httpd.exe -f C:\xampp\apache\conf\httpd.conf -t`, and check that
`conf/extra/httpd-xampp.conf` still has its `Include` line for
`httpd-aquatracker.conf`.

**"MySQL did not start within 45 seconds"** — the start script prints the tail of
`C:\xampp\mysql\data-aquatracker\error.log`, which is where the real reason is.

**"Cannot reach MySQL"** — the server is not running. Run `start-aquatracker.bat`,
or start it by hand:

```powershell
& 'C:\Program Files\MySQL\MySQL Server 26.7\bin\mysqld.exe' `
  --defaults-file='C:\AQUATRACKER UI\New folder\php-backend\mysql\my-aquatracker.ini' --standalone
```

**"MySQL rejected the credentials"** — root has a password that is not in
`api/config.php`. This instance was created with an empty one, so this only
happens if you changed it.

**"Database aquatracker does not exist"** — run <http://localhost:8080/install>.

**A page loads but is unstyled** — check that
<http://localhost:8080/css/styles.css> returns 200. If not, the `Alias` block in
`httpd-aquatracker.conf` no longer matches your folder name.

**Ordering the same water twice in a row fails** — that was the `COUNT(*)`
collision described above. If you are running a database created before
`id_sequence` existed, delete its counter row and re-run `/install`, which
re-seeds it above the highest order id already present.

**Checking what failed** — `C:\xampp\apache\logs\aquatracker-error.log` records
PHP's diagnostics for this vhost (it should stay empty), and
`C:\xampp\apache\logs\aquatracker-access.log` records every request. PHP's own
notices for the whole server go to `C:\xampp\apache\logs\error.log`.