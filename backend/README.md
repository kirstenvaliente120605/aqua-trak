# AquaTracker Backend Services & API

This directory contains the server-side architecture, session/auth services, commerce data stores, and RESTful API endpoints for the AquaTracker platform.

## Architecture

- **Runtime**: Node.js ES Modules (Express.js)
- **Storage**: JSON Flat-File Data Store in `backend/data/` (prepared for migration to PostgreSQL / SQLite / MongoDB)
- **Auth**: Secure `scrypt` password hashing + Session Cookie / Bearer Token state

## Folder Structure

```
backend/
├── src/
│   ├── app.js               # Express application initialization & middleware
│   ├── middleware/
│   │   └── auth.js          # Authentication cookies, session attachment, & route guards
│   ├── models/
│   │   └── demoData.js      # Seed models and catalog constants
│   ├── routes/
│   │   └── index.js         # API and web page routes
│   └── services/
│       ├── authStore.js     # User registration, password verification, & session store
│       ├── commerceStore.js # Refill orders & recurring subscription plans CRUD
│       └── staffStore.js    # Shift scheduling, attendance, & inventory alerts
├── data/                    # JSON database files
├── server.js                # Server entry point
└── README.md
```

## REST API Endpoints

### Authentication & Account

- `GET /api/auth/me` — Return current session user details
- `POST /auth/:role/login` — Authenticate by role (customer, owner, staff)
- `POST /auth/:role/register` — Register a new account
- `GET /auth/logout` — Destroy active session and clear cookie

### Water Refill Commerce & Subscriptions

- `GET /api/stations` — Get list of verified water refilling stations
- `GET /api/orders` — List customer's orders
- `POST /api/orders` — Place a new refill order
- `GET /api/subscriptions` — List active recurring subscription plans
- `POST /api/subscriptions` — Register a new recurring plan (10% discount)
- `POST /api/subscriptions/:id/cancel` — Cancel an active plan

### Staff & Shift Operations

- `GET /api/staff/overview` — Station summary metrics
- `GET /api/staff/orders` — Assigned order fulfillment queue
- `PATCH /api/staff/orders/:id` — Update order status and internal rider notes
- `GET /api/staff/shifts` — Scheduled shift attendance logs
- `POST /api/staff/shifts/:id/attendance` — Clock in / Clock out action
- `GET /api/staff/inventory` — Stock levels for containers, caps, and seals
- `POST /api/staff/inventory/report` — Submit stock counts
- `GET /api/staff/requests` — Customer service request inbox
- `PATCH /api/staff/requests/:id` — Update request status
