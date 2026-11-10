# AquaTracker — Water Station Locator & Management Platform

## How to Run (PHP + XAMPP)

1. Start **XAMPP MySQL** (port 3306) and **XAMPP Apache**.
2. Create the 15-table ERD schema and demo data (first run only):
   ```powershell
   & "C:\xampp\mysql\bin\mysql.exe" -u root aquatracker < create_erd.sql
   & "C:\xampp\php\php.exe" backend/seed_erd.php
   ```
3. The Apache vhost is in `C:\xampp\apache\conf\extra\httpd-aquatracker.conf`
   and is included by `httpd.conf`. Open **`http://localhost:8080`**.

If Apache is not configured, the same app runs from the PHP built-in server:
```powershell
& "C:\xampp\php\php.exe" -S localhost:8080 router.php
```

The Node backend in `backend/src` is legacy and still queries the old plural
tables; it is not used by this setup.

## Demo Accounts
- **Admin sign-in**: `admin@test.com` / `password123` (`/auth/admin/login`)
- **Customer**: `customer.demo@example.com` / `CustomerDemo123!`
- **Station Owner**: `owner.demo@example.com` / `OwnerDemo123!`
- **Station Staff**: `staff.demo@example.com` / `StaffDemo123!`

## Database

- `create_erd.sql` — authoritative ERD schema (15 tables + JSON `meta` extensions).
- `backend/seed_erd.php` — idempotent demo users, stations, rewards, and subscription plans.
- Database/credentials: `backend/api/config.php` (`aquatracker`, root, blank password).
