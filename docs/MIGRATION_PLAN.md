# React/Vite to Node/Express Migration Plan

## Audit summary

Authentication is implemented in the Express replacement: role-scoped login and registration for `customer`, `owner`, and `staff`, scrypt password hashes, HttpOnly persisted sessions, logout invalidation, `/api/auth/me`, protected dashboards, and seeded demo users in `data/users.json`.

- **Features:** AquaTracker landing page, customer/owner/staff authentication screens, role-based dashboards, profile settings, owner staff approval workflow, station discovery, subscriptions, orders, rewards, and owner operations.
- **Routes:** `/`, `/client/index.html`, `/auth/:role/:mode`, `/dashboard/:role`, `/dashboard/:role/profile`, `/dashboard/:role/:section`, `/404`, plus a catch-all 404 route.
- **API endpoints:** `/api/auth/me` returns the authenticated user without password hashes. Authentication data is persisted in `data/users.json` and `data/sessions.json`; dashboard datasets remain static demo data.
- **Data models:** Demo accounts, station listings, orders, dashboard section datasets, and server-persisted staff approval requests.
- **Dependencies:** React, React DOM, Vite, Wouter, Radix UI, Lucide React, Tailwind, form/chart utilities, and Express. The replacement will retain only Node/Express/EJS and browser-safe assets/utilities needed by the server-rendered UI.
- **Proposed structure:** `server.js`, `src/app.js`, `src/config`, `src/controllers`, `src/middleware`, `src/models`, `src/routes`, `src/services`, `src/validators`, `views/layouts`, `views/partials`, `views/pages`, and `public/{css,js,images}`.
- **Risks:** Recreating the large Tailwind-generated visual system without React, preserving deep-link behavior, maintaining local demo state across server-rendered navigations, and avoiding accidental exposure of server-only environment variables.

## Migration approach

1. Build the Express/EJS application alongside the existing client implementation.
2. Port all route behavior and demo datasets into server modules and EJS views.
3. Move interactive behavior to a small plain-browser JavaScript bundle and retain the existing image assets/styles where practical.
4. Run the Node server, exercise every route, and verify the production start path.
5. Remove React/Vite source and dependencies only after the replacement passes validation.
