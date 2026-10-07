/**
 * AquaTracker — Centralized Role & Permission System (roles.js)
 *
 * Single Source of Truth for user roles, target users, primary objectives,
 * landing routes, navigation menus, and granular permission definitions.
 *
 * Conforms to the AquaTracker Role Reference:
 * - customer: Households & individuals | Find stations, order water refills, manage subscriptions, track points
 * - owner: Water refilling station owners | Run business operations, manage staff, pricing, promotions, and customers
 * - staff: Station operational workers | Process refill orders, handle inventory, attend shifts, address requests
 */

(function (global) {
  "use strict";

  // 1. Role Definitions & Navigation Map
  const ROLES = {
    customer: {
      name: "customer",
      label: "Customer",
      eyebrow: "Your water, sorted.",
      title: "Find your next refill in a few taps.",
      description:
        "Discover trusted stations, compare plans, and keep your home stocked without the guesswork.",
      targetUser: "Households & individuals",
      primaryObjective:
        "Find stations, order water refills, manage subscriptions, track points",
      defaultLanding: "/customer-dashboard.html",
      dashboardPath: "/customer-dashboard.html",
      permissions: [
        "stations.view",
        "refills.order",
        "orders.view",
        "subscriptions.manage",
        "rewards.view",
        "notifications.view",
        "profile.manage",
      ],
      navItems: [
        {
          id: "station-finder",
          label: "Station Finder",
          icon: "map-pin",
          permission: "stations.view",
          section: "station-finder",
          eyebrow: "Nearest Refill Hubs",
          title: "Find clean water close by.",
        },
        {
          id: "order-refills",
          label: "Order Refills",
          icon: "droplet",
          permission: "refills.order",
          section: "order-refills",
          eyebrow: "Water Refill",
          title: "Refill your home in a few clicks.",
        },
        {
          id: "order-history",
          label: "Order History & Tracking",
          icon: "clock",
          permission: "orders.view",
          section: "order-history",
          eyebrow: "Live Tracking & Receipts",
          title: "Track every refill status.",
        },
        {
          id: "subscriptions",
          label: "Subscriptions",
          icon: "refresh-cw",
          permission: "subscriptions.manage",
          section: "subscriptions",
          eyebrow: "Automated Plans",
          title: "Never run out of clean drinking water.",
        },
        {
          id: "loyalty",
          label: "AquaPoints & Rewards",
          icon: "award",
          permission: "rewards.view",
          section: "loyalty",
          eyebrow: "Customer Loyalty",
          title: "Your refills give back.",
        },
        {
          id: "notifications",
          label: "Notifications",
          icon: "bell",
          permission: "notifications.view",
          section: "notifications",
          eyebrow: "Activity Stream",
          title: "Order updates and refill reminders.",
        },
        {
          id: "profile",
          label: "Account & Settings",
          icon: "user",
          permission: "profile.manage",
          section: "profile",
          eyebrow: "Customer Profile",
          title: "Manage your address & preferences.",
        },
      ],
    },

    owner: {
      name: "owner",
      label: "Station Owner",
      eyebrow: "Run a smoother station.",
      title: "Your station operations, at a glance.",
      description:
        "Stay on top of orders, subscriptions, prices, and the customers who keep coming back.",
      targetUser: "Water refilling station owners",
      primaryObjective:
        "Run business operations, manage staff, pricing, promotions, and customers",
      defaultLanding: "/owner-dashboard.html",
      dashboardPath: "/owner-dashboard.html",
      permissions: [
        "station.overview",
        "orders.manage",
        "subscriptions.manage",
        "customers.manage",
        "staff.approve",
        "promotions.manage",
        "station.settings",
        "profile.manage",
      ],
      navItems: [
        {
          id: "overview",
          label: "Overview",
          icon: "grid",
          permission: "station.overview",
          section: "overview",
        },
        {
          id: "orders",
          label: "Orders",
          icon: "package",
          permission: "orders.manage",
          section: "orders",
        },
        {
          id: "subscriptions",
          label: "Subscriptions",
          icon: "repeat",
          permission: "subscriptions.manage",
          section: "subscriptions",
        },
        {
          id: "customers",
          label: "Customers",
          icon: "users",
          permission: "customers.manage",
          section: "customers",
        },
        {
          id: "staff-approvals",
          label: "Staff Approvals",
          icon: "user-check",
          permission: "staff.approve",
          section: "staff-approvals",
        },
        {
          id: "promotions",
          label: "Promotions",
          icon: "tag",
          permission: "promotions.manage",
          section: "promotions",
        },
        {
          id: "pricing",
          label: "Pricing & Products",
          icon: "tag",
          permission: "station.settings",
          section: "pricing",
        },
        {
          id: "station-settings",
          label: "Station Settings",
          icon: "settings",
          permission: "station.settings",
          section: "station-settings",
        },
        {
          id: "profile",
          label: "Owner Profile",
          icon: "user",
          permission: "profile.manage",
          section: "profile",
        },
      ],
    },

    staff: {
      name: "staff",
      label: "Station Staff",
      eyebrow: "Support your station team.",
      title: "Your station shift, at a glance.",
      description:
        "Manage assigned station work, coordinate orders, and stay connected with your owner.",
      targetUser: "Station operational workers",
      primaryObjective:
        "Process refill orders, handle inventory, attend shifts, address requests",
      defaultLanding: "/staff-dashboard.html",
      dashboardPath: "/staff-dashboard.html",
      permissions: [
        "shifts.view",
        "orders.fulfill",
        "orders.pickup",
        "inventory.manage",
        "requests.handle",
        "profile.manage",
      ],
      navItems: [
        {
          id: "shifts",
          label: "My Shifts",
          icon: "calendar",
          permission: "shifts.view",
          section: "my-shifts",
        },
        {
          id: "station-orders",
          label: "Station Orders",
          icon: "shopping-bag",
          permission: "orders.fulfill",
          section: "station-orders",
        },
        {
          id: "pickup-orders",
          label: "Pickup Orders",
          icon: "store",
          permission: "orders.pickup",
          section: "pickup-orders",
        },
        {
          id: "inventory",
          label: "Inventory",
          icon: "layers",
          permission: "inventory.manage",
          section: "inventory",
        },
        {
          id: "customer-requests",
          label: "Customer Requests",
          icon: "message-circle",
          permission: "requests.handle",
          section: "customer-requests",
        },
        {
          id: "profile",
          label: "Staff Profile",
          icon: "user",
          permission: "profile.manage",
          section: "profile",
        },
      ],
    },
  };

  // 2. Canonical Demo Seed Accounts (Full Parity across All 3 Roles)
  const DEMO_ACCOUNTS = {
    customer: {
      userId: "usr-cust-001",
      role: "customer",
      name: "Mia Santos",
      email: "customer.demo@example.com",
      password: "CustomerDemo123!",
      subtitle: "Household Account · San Jose District",
      phone: "+63 917 555 4321",
      address:
        "Block 4, Lot 12, Sunrise Village, Brgy. San Jose, Pagadian City",
      landmark: "Near Yellow Chapel",
      savedAddresses: [
        {
          id: "addr-1",
          label: "Home",
          address:
            "Block 4, Lot 12, Sunrise Village, Brgy. San Jose, Pagadian City",
          landmark: "Near Yellow Chapel",
          isDefault: true,
        },
        {
          id: "addr-2",
          label: "Office / Shop",
          address: "Unit 204, Gaisano Mall Commercial Complex, Pagadian City",
          landmark: "2nd Floor beside Pharmacy",
          isDefault: false,
        },
      ],
      savedPaymentMethods: [
        {
          id: "pay-1",
          type: "cod",
          label: "Cash on Delivery (COD)",
          identifier: "Exact change appreciated",
          isDefault: true,
        },
      ],
      points: 240,
      stationId: "",
      station: "",
      permissions: ROLES.customer.permissions,
      status: "active",
      createdAt: "2026-09-01T08:00:00.000Z",
    },

    owner: {
      userId: "usr-own-001",
      role: "owner",
      name: "Joan Dela Cruz",
      email: "owner.demo@example.com",
      password: "OwnerDemo123!",
      subtitle: "ClearSpring Water Hub Owner",
      phone: "+63 920 888 1234",
      station: "ClearSpring Water Hub",
      stationId: "drink-refill",
      permissions: ROLES.owner.permissions,
      status: "active",
      createdAt: "2026-08-15T09:30:00.000Z",
    },

    staff: {
      userId: "usr-stf-001",
      role: "staff",
      name: "Dani Cruz",
      email: "staff.demo@example.com",
      password: "StaffDemo123!",
      subtitle: "ClearSpring Water Hub Operations",
      phone: "+63 939 123 9876",
      station: "ClearSpring Water Hub",
      stationId: "drink-refill",
      permissions: ROLES.staff.permissions,
      status: "active",
      createdAt: "2026-09-10T11:00:00.000Z",
    },
  };

  // 3. Helper Functions
  function isValidRole(role) {
    return Boolean(ROLES[role]);
  }

  function getRoleConfig(role) {
    return ROLES[role] || null;
  }

  function hasPermission(user, requiredPermission) {
    if (!user || !user.role) return false;
    if (!requiredPermission) return true;

    // User permissions array check (falls back to role defaults if missing)
    const userPermissions =
      Array.isArray(user.permissions) && user.permissions.length > 0
        ? user.permissions
        : ROLES[user.role]?.permissions || [];

    return userPermissions.includes(requiredPermission);
  }

  function getAuthorizedNav(user) {
    if (!user || !user.role || !ROLES[user.role]) return [];
    const config = ROLES[user.role];
    return config.navItems.filter(item => hasPermission(user, item.permission));
  }

  function normalizeSessionUser(rawUser) {
    if (!rawUser) return null;
    const role = rawUser.role || "customer";
    const baseRole = ROLES[role] || ROLES.customer;
    const validPermissions = Array.isArray(rawUser.permissions)
      ? rawUser.permissions.filter(permission =>
          baseRole.permissions.includes(permission)
        )
      : [];

    return {
      userId: rawUser.userId || rawUser.id || "usr-" + Date.now(),
      role: role,
      name: rawUser.name || "AquaTracker User",
      email: rawUser.email || "",
      subtitle: rawUser.subtitle || baseRole.label,
      phone: rawUser.phone || "",
      address: rawUser.address || "",
      landmark: rawUser.landmark || "",
      savedAddresses: Array.isArray(rawUser.savedAddresses)
        ? rawUser.savedAddresses
        : [],
      savedPaymentMethods: Array.isArray(rawUser.savedPaymentMethods)
        ? rawUser.savedPaymentMethods
        : [],
      points:
        typeof rawUser.points === "number"
          ? rawUser.points
          : role === "customer"
            ? 240
            : 0,
      station: rawUser.station || "",
      stationId: rawUser.stationId || "",
      permissions: validPermissions.length
        ? validPermissions
        : baseRole.permissions,
      status: rawUser.status || "active",
      createdAt: rawUser.createdAt || new Date().toISOString(),
    };
  }

  // Export module globally
  const RolesModule = {
    ROLES,
    DEMO_ACCOUNTS,
    isValidRole,
    getRoleConfig,
    hasPermission,
    getAuthorizedNav,
    normalizeSessionUser,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = RolesModule;
  } else {
    global.AquaRoles = RolesModule;
  }
})(typeof window !== "undefined" ? window : this);
