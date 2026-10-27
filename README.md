# AquaTracker — Water Station Locator & Management Platform

## How to Run

1. Ensure MySQL is running on port 3306 (e.g. XAMPP MySQL).
2. Start the AquaTracker application:
   ```powershell
   npm run dev
   # Or run:
   node server.js
   # Or using PowerShell launcher:
   .\scripts\start-aquatracker.ps1
   ```
3. Open **`http://localhost:3001`** in your browser.

## Demo Accounts
- **Customer**: `customer.demo@example.com` / `CustomerDemo123!`
- **Station Owner**: `owner.demo@example.com` / `OwnerDemo123!`
- **Station Staff**: `staff.demo@example.com` / `StaffDemo123!`

## Running Verification Tests
```bash
node backend/tests/api.test.mjs
node backend/tests/stations.test.mjs
```
