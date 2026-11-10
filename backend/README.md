# AquaTracker PHP backend

The active application is the PHP API in `backend/api`, served with the frontend through the root `router.php` or XAMPP Apache. The legacy Node backend under `backend/src` is not used by the PHP setup.

## Run with XAMPP

1. Start XAMPP MySQL/MariaDB and Apache.
2. From the repository root, open `http://localhost:8080`.
3. The authoritative database schema is `create_erd.sql`; demo records are seeded with `C:\xampp\php\php.exe backend/seed_erd.php`.

For PHP's built-in server, run `C:\xampp\php\php.exe -S localhost:8080 -t . router.php` from the repository root. The API uses same-origin routes such as `/api/auth/me`, `/api/stations`, and `/api/orders`.

Database credentials are in `backend/api/config.php`: localhost, port 3306, database `aquatracker`, user `root`, empty password.

## Welcome email (Brevo)

The active PHP backend sends transactional email through the Brevo API. In the active XAMPP virtual host at `C:\xampp\apache\conf\extra\httpd-aquatracker.conf`, add these directives inside the `<VirtualHost *:8080>` block and replace the placeholders with a Brevo API v3 key and a sender address verified in Brevo:

```apache
SetEnv BREVO_API_KEY "your-brevo-api-v3-key"
SetEnv BREVO_SENDER_EMAIL "your-verified-sender@example.com"
```

Keep the API key out of source control and do not paste it into chat. Restart Apache after editing the vhost so the PHP process receives the variables. If Brevo is unavailable or unconfigured, registration still succeeds and the mail error is written to the PHP error log.

The previous Node mail helper contained a hard-coded Brevo key. Revoke that key in Brevo and use a newly generated API key in the Apache configuration above.

Check whether Apache received both settings at `http://localhost:8080/test_mail.php?env=1`; this displays only whether each variable is set. To send a test email, open `http://localhost:8080/test_mail.php?email=your-recipient@example.com`. The diagnostic endpoint accepts localhost requests only.

## Sign-in accounts

- Admin: `admin@test.com` / `password123` at `/auth/admin/login`
- Customer: `customer.demo@example.com` / `CustomerDemo123!`
- Owner: `owner.demo@example.com` / `OwnerDemo123!`
- Staff: `staff.demo@example.com` / `StaffDemo123!`
