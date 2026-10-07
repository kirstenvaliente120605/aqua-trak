# AquaTracker — Project Structure & Architecture Guide

## 1. Overview & Architecture Philosophy

AquaTracker connects households with water refilling stations in a Filipino local context across three core roles:

- **Customer (`customer`)**: Find stations, order water refills, manage recurring subscriptions, and earn AquaPoints loyalty rewards.
- **Station Owner (`owner`)**: Run station operations, manage pricing, promotions, subscriber retention, and staff approvals.
- **Station Staff (`staff`)**: Fulfill order queues, attend work shifts, report container inventory, and handle support requests.

The project is structured with a strict separation between **`frontend`** (vanilla HTML5, CSS3, ES6 JavaScript) and **`backend`** (Node.js/Express REST API and Data Services). Both tiers are independently deployable:

- The **frontend** can be deployed directly to any static web host, CDN, or object storage (Vercel, Netlify, Cloudflare Pages, S3, GitHub Pages).
- The **backend** can run as a standalone API service on its own server, container (Docker), or port.

---

## 2. Directory Layout

```
AQUATRACKER/
├── frontend/                        # Client-side presentation tier (Vanilla HTML/CSS/JS)
│   ├── pages/                       # UI Views & Workspace pages
│   │   ├── index.html               # Public landing page (Hero, features, CTA)
│   │   ├── auth.html                # Unified Auth portal (Login / Register with role tabs)
│   │   ├── customer-dashboard.html  # Full Customer Workspace (Station Finder, Refill Orders, Tracking, Subscriptions, Rewards)
│   │   ├── owner-dashboard.html     # Station Owner Workspace (Queue, revenue, CRM)
│   │   ├── staff-dashboard.html     # Station Staff Workspace (Shift orders, inventory)
│   │   ├── profile.html             # Profile & account preferences
│   │   ├── not-found.html           # 404 Error page
│   │   └── error.html               # 500 Error page
│   ├── js/                          # Client business logic & modules
│   │   ├── roles.js                 # Centralized role definitions, permissions, and demo seed accounts
│   │   ├── auth.js                  # Client session management & role-based route guards
│   │   ├── dashboard.js             # Customer dashboard controller & API-swappable stubs
│   │   └── app.js                   # Client routing and legacy page binders
│   ├── css/                         # Shared stylesheets & design tokens
│   │   └── styles.css               # Glassmorphism design system, typography, mobile-first responsive rules
│   ├── assets/                      # Static branding and media assets
│   │   ├── aquatracker-hero.png     # Hero section graphic
│   │   └── aquatracker-station.png  # Station showcase photo
│   └── index.html                   # Root static entry redirecting to pages/index.html
│
├── backend/                         # Server-side application tier (Node.js/Express)
│   ├── src/                         # Server source code
│   │   ├── app.js                   # Express application setup, static asset mounts, and error handlers
│   │   ├── middleware/
│   │   │   └── auth.js              # Cookie parsing, session tokens, and route protection
│   │   ├── models/
│   │   │   └── demoData.js          # Catalog constants and seed records
│   │   ├── routes/
│   │   │   └── index.js             # REST API routes and page controllers
│   │   └── services/
│   │       ├── authStore.js         # User CRUD & secure scrypt password verification
│   │       ├── commerceStore.js     # Orders and subscriptions engine
│   │       └── staffStore.js        # Shifts, inventory logs, and customer requests
│   ├── data/                        # JSON database files (users, orders, subscriptions, shifts)
│   │   ├── users.json
│   │   ├── orders.json
│   │   ├── subscriptions.json
│   │   ├── customer-requests.json
│   │   ├── sessions.json
│   │   ├── staff-inventory.json
│   │   ├── staff-notifications.json
│   │   └── staff-shifts.json
│   ├── server.js                    # Standalone backend server runner
│   ├── .env.example                 # Environment configuration template
│   └── README.md                    # Backend API endpoint reference
│
├── docs/                            # Documentation & architecture records
│   ├── PROJECT_STRUCTURE.md         # This architectural specification
│   ├── MIGRATION_PLAN.md            # Framework migration notes
│   └── VS_CODE_RUN_GUIDE.md         # VS Code execution instructions
│
├── start-app.ps1                    # Main PowerShell launcher script
├── START_AQUATRACKER.bat            # Windows Batch launcher script
├── server.js                        # Root entry point delegating to backend/src/app.js
├── package.json                     # Project manifest and dependencies
└── package-lock.json                # Locked dependency tree
```

---

## 3. API Integration & Stub Boundaries (Backend-Ready Swaps)

In [`frontend/js/dashboard.js`](file:///c:/AQUATRACKER%20UI/New%20folder/frontend/js/dashboard.js) and [`frontend/js/auth.js`](file:///c:/AQUATRACKER%20UI/New%20folder/frontend/js/auth.js), all data mutations and reads are designed as cleanly isolated stubs. When migrating from `localStorage` to a live REST or GraphQL backend, replace the marked function bodies:

| Stub Function in `dashboard.js`        | Current Prototype Behavior                       | Target Backend REST Endpoint                                       |
| :------------------------------------- | :----------------------------------------------- | :----------------------------------------------------------------- |
| `fetchStations(query, filter)`         | Filters `STATIONS_STORE` in `localStorage`       | `GET /api/stations?search=${query}&filter=${filter}`               |
| `placeRefillOrder(orderPayload)`       | Generates order ID and saves to `ORDERS_STORE`   | `POST /api/orders`                                                 |
| `fetchOrders()`                        | Reads `ORDERS_STORE`                             | `GET /api/orders`                                                  |
| `advanceOrderStatus(orderId)`          | Progresses 4-stage pipeline for demo testing     | `PATCH /api/orders/:id/status` (or WebSocket `/ws/order-tracking`) |
| `fetchSubscriptions()`                 | Reads `SUBSCRIPTIONS_STORE`                      | `GET /api/subscriptions`                                           |
| `createSubscription(subPayload)`       | Adds recurring plan with 10% auto-discount       | `POST /api/subscriptions`                                          |
| `updateSubscriptionStatus(id, status)` | Updates `active`, `paused`, or `cancelled`       | `PATCH /api/subscriptions/:id/status`                              |
| `fetchLoyalty()`                       | Reads `LOYALTY_STORE` points balance and history | `GET /api/loyalty`                                                 |
| `redeemLoyaltyReward(rewardId)`        | Validates points and generates promo voucher     | `POST /api/loyalty/redeem`                                         |
| `fetchNotifications()`                 | Reads `NOTIFICATIONS_STORE`                      | `GET /api/notifications`                                           |
| `markAllNotificationsRead()`           | Marks alert items as read                        | `POST /api/notifications/mark-read`                                |

### In `auth.js`:

- `login(email, password, role)` $\rightarrow$ Replaces local credential check with `POST /api/auth/login`.
- `register(userData)` $\rightarrow$ Replaces local user append with `POST /api/auth/register`.
- `logout()` $\rightarrow$ Calls `POST /api/auth/logout` and clears active tokens.
- `requireRole(expectedRole)` $\rightarrow$ Validates token session and redirects unauthorized access to the matching role dashboard.

---

## 4. How to Run

### Option A: PowerShell Launcher (Recommended)

```powershell
.\start-app.ps1
```

### Option B: Windows Batch Launcher

Double-click `START_AQUATRACKER.bat` or run:

```cmd
START_AQUATRACKER.bat
```

### Option C: Direct Node Command

```bash
node server.js
```

The server will boot at **`http://localhost:3001`**.
