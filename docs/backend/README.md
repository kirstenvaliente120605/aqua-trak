# AquaTracker PHP backend

The active application is the PHP API in `backend/api`, served with the frontend through the root `router.php` or XAMPP Apache. The legacy Node backend under `backend/src` is not used by the PHP setup.

## Run with XAMPP

1. Start XAMPP MySQL/MariaDB and Apache.
2. From the repository root, open `http://localhost:8080`.
3. The authoritative database schema is `create_erd.sql`; demo records are seeded with `C:\xampp\php\php.exe backend/seed_erd.php`.

For PHP's built-in server, run `C:\xampp\php\php.exe -S localhost:8080 -t . router.php` from the repository root. The API uses same-origin routes such as `/api/auth/me`, `/api/stations`, and `/api/orders`.

Database credentials are in `backend/api/config.php`: localhost, port 3306, database `aquatracker`, user `root`, empty password.

## OTP email verification and password reset

The active PHP backend sends OTP messages through the existing Brevo transactional email API. In the XAMPP vhost at `C:\xampp\apache\conf\extra\httpd-aquatracker.conf`, set the verified sender and API key inside the `<VirtualHost *:8080>` block:

```apache
SetEnv BREVO_API_KEY "your-brevo-api-v3-key"
SetEnv BREVO_SENDER_EMAIL "your-verified-sender@example.com"
SetEnv BREVO_SENDER_NAME "AquaTracker"
SetEnv APP_ENV "production"
```

Keep the API key out of source control. Restart Apache after editing the vhost. Never expose the API key or OTP to the browser or logs. OTP debug output is disabled unless `OTP_DEBUG=true` and `APP_ENV=development`; do not enable it in production. Brevo errors are logged server-side with response bodies suppressed and the client receives a generic message.

The `.env.example` contains the OTP settings and their defaults: 10-minute expiry, five attempts, and a 60-second resend cooldown. The server also rate-limits sends by email and source IP. The `.env` file is a reference; Apache must explicitly export the values as `SetEnv` directives.

For an existing PHP/ERD database, apply the one-time schema migration from the project root:

```powershell
cmd /c '"C:\xampp\mysql\bin\mysql.exe" -u root aquatracker < backend\migrations\004_email_otp.sql'
```

`create_erd.sql` includes the new columns and tables for a fresh database. Password-reset tokens are hashed at rest and invalidate every prior PHP session when used.

For older PHP/ERD databases, also apply `backend\migrations\011_customer_default_address.sql`.
The customer registration flow inserts an empty `default_address`, so this column
must exist before new accounts can be created.

The package scripts can also start the alternate Express backend with `npm run dev`. For an existing Express database, apply its migration:

```powershell
cmd /c '"C:\xampp\mysql\bin\mysql.exe" -u root aquatracker < backend\migrations\005_node_otp.sql'
```

For an existing Express database, also add the station availability field used by the customer map and order validation:

```powershell
cmd /c '"C:\xampp\mysql\bin\mysql.exe" -u root aquatracker < backend\migrations\006_station_status.sql'
```

A fresh Express database should use the updated `backend/schema.sql`. The Node service uses the same Brevo/API and OTP environment variables, and its password-reset transaction deletes all stored sessions.

## Station delivery options

The station capability is stored as the existing `delivery` boolean; a second
boolean or JSON `order_types` field would duplicate that information. The
`delivery_fee` column stores the per-station fee. Both APIs return
`deliveryAvailable` and `deliveryFee` while retaining `delivery` for existing
clients. Pickup-only stations have a zero delivery fee, and delivery orders are
rejected server-side when the station does not offer delivery.

Apply the migration for the backend schema you run:

- Express (`stations` table): `backend\migrations\009_station_delivery_fee_express.sql`
- PHP/ERD (`station` table): `backend\migrations\010_station_delivery_options_php.sql`

The migration preserves the existing ₱15 delivery fee. The PHP migration adds
the capability column if needed and seeds the known demo stations by ID or name
only when that column is new; otherwise, it preserves existing station choices.
The fresh-install `create_erd.sql` schema and `seed_erd.php` demo data also
include the capability and fee. Review custom station rows and set their
delivery capability and fee before enabling delivery for them.

For an existing Express database, back it up and run the users cleanup in two stages:

1. Apply `backend\migrations\007_users_cleanup_prepare.sql`.
2. Review all three audit result sets. They must be empty. Assign any unmatched owner/staff rows to a real `stations.id` and repair blank full names before proceeding.
3. Apply `backend\migrations\008_users_cleanup_finalize.sql` only after the audit is clean. It adds the `users.station_id` foreign key and drops the legacy columns.

For an existing PHP/ERD database (`user`, singular), back it up and then drop the
legacy `name`, `station`, `location` and `reviewed_at` columns with
`backend\migrations\012_drop_user_legacy_columns.sql`. The ERD schema never
declared them; older databases gained them at runtime. Display names come from
`full_name`, and the station name comes from `STATION` via `station_id`. The
`reviewed_at` audit timestamps cannot be recovered after the drop.

Then apply `backend\migrations\013_drop_unused_columns.sql`. It drops columns
that no flow reads: `ORDER.promotion_id`, `CUSTOMER_REWARD.reason`,
`SUBSCRIPTION.start_date`, `REWARD.required_purchases`, `USER.remember_me`
(the Remember-me option is gone from the login form) and
`CUSTOMER.default_address` (the profile address endpoint was removed; checkout
still collects a delivery address per order). Each migration has a rollback
file, and both are safe to re-run.

The prepare migration changes `permissions` to the JSON array currently used by the Express app: staff receive `["orders","inventory","requests"]`, other roles receive `NULL`. It only strips `stn ` from a station ID when the cleaned ID exists in `stations`.

### Auth endpoints

- `POST /auth/signup` creates an unverified account and sends a verification code.
- `POST /auth/verify-email` verifies the code and starts the normal account session.
- `POST /auth/resend-otp` accepts `{ email, purpose }`, where purpose is `verify_email` or `reset_password`.
- `POST /auth/login` returns `EMAIL_NOT_VERIFIED` for an unverified account; the login screen redirects to verification and requests a fresh code.
- `POST /auth/forgot-password` always returns the same generic message for valid email addresses.
- `POST /auth/verify-reset-otp` returns a short-lived reset token after a valid code.
- `POST /auth/reset-password` accepts `{ email, resetToken, newPassword }`, saves the hash, and invalidates existing sessions.

### Tests and manual flow

Run the PHP OTP service tests (they mock the mailer and do not contact Brevo):

```powershell
& "C:\xampp\php\php.exe" backend/tests/otp.test.php
```

With the selected backend's MySQL schema applied and Brevo configured:

1. Open `/auth/customer/register`, create an account with an email you can access, then enter the received code on `/auth/verify-email`.
2. Confirm successful verification signs you in. Sign out and confirm a normal login succeeds.
3. Use **Forgot your password?** from the login screen, request a reset code, verify it, and set a new password. Confirm the new password works and the old one does not.
4. Try an incorrect code five times, an expired code, and a resend before the countdown ends; the screens should show the matching inline error/countdown.

## Sign-in accounts

- Admin: `admin@test.com` / `password123` at `/auth/admin/login`
- Customer: `customer.demo@example.com` / `CustomerDemo123!`
- Owner: `owner.demo@example.com` / `OwnerDemo123!`
- Staff: `staff.demo@example.com` / `StaffDemo123!`
