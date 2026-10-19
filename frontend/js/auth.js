/**
 * AquaTracker client auth and route guards.
 * Identity is verified by the server session; localStorage is only a UI cache.
 */

(function (global) {
  "use strict";

  const STORAGE_KEYS = {
    SESSION: "aquatracker_session_user",
    ALL_USERS: "aquatracker_registered_users",
  };

  async function getCurrentUser() {
    try {
      const res = await fetch(API_BASE + "/api/auth/me", {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data.authenticated || !data.user) return null;
      return global.AquaRoles
        ? global.AquaRoles.normalizeSessionUser(data.user)
        : data.user;
    } catch (error) {
      console.error("Failed to fetch current user session:", error);
      return null;
    }
  }

  function setCurrentUser(user) {
    if (typeof localStorage === "undefined") return;
    if (!user) {
      localStorage.removeItem(STORAGE_KEYS.SESSION);
      return;
    }
    const normalized = global.AquaRoles
      ? global.AquaRoles.normalizeSessionUser(user)
      : user;
    localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(normalized));
  }

  async function login(email, password, requestedRole) {
    initAuthStorage();
    const cleanEmail = String(email || "").trim().toLowerCase();
    const cleanPassword = String(password || "").trim();
    const demoAccounts = Object.values(global.AquaRoles?.DEMO_ACCOUNTS || {});
    let matchedUser = demoAccounts.find(
      user => user.email.toLowerCase() === cleanEmail
    );

    if (!matchedUser) {
      try {
        const users = JSON.parse(
          localStorage.getItem(STORAGE_KEYS.ALL_USERS) || "[]"
        );
        matchedUser = users.find(user => user.email.toLowerCase() === cleanEmail);
      } catch {
        matchedUser = null;
      }
    }
    if (!matchedUser) {
      return { success: false, error: "No account found with this email address." };
    }
    if (
      matchedUser.password &&
      cleanPassword &&
      matchedUser.password !== cleanPassword
    ) {
      return { success: false, error: "Incorrect password. Please try again." };
    }
    if (requestedRole && matchedUser.role !== requestedRole) {
      return {
        success: false,
        error: `This account is registered as a ${matchedUser.role}, not a ${requestedRole}.`,
      };
    }

    const user = global.AquaRoles
      ? global.AquaRoles.normalizeSessionUser(matchedUser)
      : matchedUser;
    setCurrentUser(user);
    const landing =
      global.AquaRoles?.getRoleConfig(user.role)?.defaultLanding ||
      "/customer-dashboard.html";
    return { success: true, user, redirectUrl: landing };
  }

  async function register(userData) {
    initAuthStorage();
    const email = String(userData.email || "").trim().toLowerCase();
    let users;
    try {
      users = JSON.parse(localStorage.getItem(STORAGE_KEYS.ALL_USERS) || "[]");
    } catch {
      users = [];
    }
    if (users.some(user => user.email.toLowerCase() === email)) {
      return { success: false, error: "An account with this email already exists." };
    }

    const user = {
      userId: "usr-" + Date.now().toString(36),
      role: userData.role || "customer",
      name: userData.name || "AquaTracker Member",
      email,
      password: userData.password,
      subtitle:
        userData.role === "owner"
          ? userData.station || "Station Owner"
          : "Customer Account",
      station: userData.station || "",
      stationId: userData.stationId || "",
      phone: userData.phone || "",
      address: userData.address || "",
      points: userData.role === "customer" ? 50 : 0,
      status: userData.role === "staff" ? "pending" : "active",
      createdAt: new Date().toISOString(),
    };
    users.push(user);
    localStorage.setItem(STORAGE_KEYS.ALL_USERS, JSON.stringify(users));

    if (user.role === "staff") {
      return {
        success: true,
        notice: "Staff registration submitted! Awaiting owner approval.",
        redirectUrl: "/auth/staff/login?notice=pending",
      };
    }
    const normalized = global.AquaRoles
      ? global.AquaRoles.normalizeSessionUser(user)
      : user;
    setCurrentUser(normalized);
    return {
      success: true,
      user: normalized,
      redirectUrl:
        global.AquaRoles?.getRoleConfig(normalized.role)?.defaultLanding ||
        "/customer-dashboard.html",
    };
  }

  async function logout() {
    try {
      await fetch("/auth/logout", { method: "POST", credentials: "same-origin" });
    } catch (error) {
      console.warn("Server logout failed, proceeding with client clear", error);
    }
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(STORAGE_KEYS.SESSION);
    }
    if (typeof document !== "undefined") {
      document.cookie =
        "aquatracker_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;";
    }
    window.location.href = "/";
  }

  async function switchDemoRole(role) {
    const demoUser = global.AquaRoles?.DEMO_ACCOUNTS[role];
    if (!demoUser) return;
    try {
      const res = await fetch("/auth/login", {
        credentials: "same-origin",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: demoUser.email,
          password: demoUser.password,
          role,
        }),
      });
      if (res.ok) {
        window.location.href =
          global.AquaRoles.ROLES[role]?.defaultLanding ||
          "/customer-dashboard.html";
      } else {
        alert("Demo login failed. Please check backend logs.");
      }
    } catch (error) {
      console.error("Error switching demo role:", error);
    }
  }

  async function requireRole(expectedRole) {
    const user = await getCurrentUser();
    if (!user) {
      // Use the canonical /auth/<role>/<mode> route. The old
      // /pages/auth.html?role=... form was parsed by js/app.js as
      // pathname[2] === "auth.html", which shadowed the role query param and
      // always rendered the Customer portal.
      const loginPath = `/auth/${encodeURIComponent(expectedRole)}/login`;
      window.location.replace(loginPath);
      return null;
    }
    if (user.role !== expectedRole) {
      const landing =
        global.AquaRoles?.ROLES[user.role]?.defaultLanding ||
        "/customer-dashboard.html";
      window.location.replace(landing);
      return null;
    }
    return user;
  }

  function initAuthStorage() {
    if (typeof localStorage === "undefined") return;
    // Prototype data is initialized separately from the server-owned session.
  }

  function seedDemoContent() {
    if (typeof localStorage === "undefined") return;

    const seedIfMissing = (key, value) => {
      if (localStorage.getItem(key) === null) {
        localStorage.setItem(key, JSON.stringify(value));
      }
    };
    const today = new Date().toISOString().slice(0, 10);
    const now = new Date().toISOString();

    seedIfMissing("aquatracker_stations_db", [
      {
        id: "drink-refill",
        name: "ClearSpring Water Hub",
        address: "45 Sabellano St, San Jose District, Pagadian City",
        distanceKm: 0.8,
        rating: 4.9,
        reviewsCount: 142,
        pricePerGallon: 35,
        hours: "Mon-Sat 7:30 AM-5:00 PM",
        phone: "0918 962 5038",
        waterTypes: ["Purified", "Alkaline (+P10)"],
        deliveryAvailable: true,
        pickupAvailable: true,
        minOrderGallons: 1,
        tag: "Best Value - Verified",
        coords: { lat: 7.8269, lng: 123.4371 },
      },
      {
        id: "ultra-pure",
        name: "Ultra Pure Water Refilling Station",
        address: "Purok Bakhaw A, Brgy. Kawit, Pagadian City",
        distanceKm: 1.4,
        rating: 4.7,
        reviewsCount: 88,
        pricePerGallon: 30,
        hours: "Mon-Sun 8:00 AM-6:00 PM",
        phone: "0970 488 8866",
        waterTypes: ["Purified"],
        deliveryAvailable: false,
        pickupAvailable: true,
        minOrderGallons: 1,
        tag: "Lowest Price",
        coords: { lat: 7.8312, lng: 123.4437 },
      },
      {
        id: "waterpol",
        name: "Waterpol Water Refilling Station",
        address: "Purok Pagang, Brgy. Kawit, Pagadian City",
        distanceKm: 2.1,
        rating: 4.8,
        reviewsCount: 116,
        pricePerGallon: 35,
        hours: "Mon-Sat 7:00 AM-6:30 PM",
        phone: "0927 251 4246",
        waterTypes: ["Purified", "Mineral"],
        deliveryAvailable: true,
        pickupAvailable: true,
        minOrderGallons: 2,
        tag: "Fast Delivery",
        coords: { lat: 7.8347, lng: 123.4481 },
      },
    ]);

    seedIfMissing("aquatracker_customer_orders", [
      {
        id: "AT-1048",
        stationId: "drink-refill",
        stationName: "ClearSpring Water Hub",
        containers: [{ type: "5-gal-slim", label: "5-Gallon Slim Container", count: 2, unitPrice: 35 }],
        gallonsTotal: 2,
        fulfillment: "delivery",
        deliveryAddress: "Block 4, Lot 12, Sunrise Village, Brgy. San Jose",
        landmark: "Near Yellow Chapel",
        contactPhone: "0917 555 4321",
        paymentMethod: "Cash on Delivery",
        subtotal: 70,
        discount: 0,
        deliveryFee: 15,
        total: 85,
        pointsEarned: 20,
        status: "out-for-delivery",
        timeline: [
          { status: "pending", label: "Order Placed", time: "9:15 AM", done: true },
          { status: "confirmed", label: "Confirmed & Refilled", time: "9:28 AM", done: true },
          { status: "out-for-delivery", label: "Out for Delivery", time: "9:45 AM", done: true },
          { status: "completed", label: "Delivered & Completed", time: "On the way", done: false },
        ],
        createdAt: now,
      },
      {
        id: "AT-1042",
        stationId: "drink-refill",
        stationName: "ClearSpring Water Hub",
        containers: [{ type: "5-gal-round", label: "5-Gallon Round Container", count: 4, unitPrice: 35 }],
        gallonsTotal: 4,
        fulfillment: "pickup",
        deliveryAddress: "Station Pickup Counter",
        landmark: "",
        contactPhone: "0917 555 4321",
        paymentMethod: "Cash on Delivery",
        subtotal: 140,
        discount: 14,
        deliveryFee: 0,
        total: 126,
        pointsEarned: 40,
        status: "completed",
        timeline: [
          { status: "pending", label: "Order Placed", time: "Sep 23, 2:00 PM", done: true },
          { status: "confirmed", label: "Confirmed by Station", time: "Sep 23, 2:10 PM", done: true },
          { status: "out-for-delivery", label: "Ready for Pickup", time: "Sep 23, 2:40 PM", done: true },
          { status: "completed", label: "Completed", time: "Sep 23, 2:50 PM", done: true },
        ],
        createdAt: `${today}T06:00:00.000Z`,
      },
    ]);

    seedIfMissing("aquatracker_customer_subscriptions", [
      {
        id: "sub-8041",
        stationId: "drink-refill",
        stationName: "ClearSpring Water Hub",
        frequency: "weekly",
        frequencyLabel: "Every Monday Morning",
        containerType: "5-Gallon Slim Container",
        gallonsPerRefill: 2,
        basePrice: 70,
        subscriptionDiscount: 7,
        estimatedTotal: 63,
        status: "active",
        nextRefillDate: "Monday, Sep 28, 2026",
        deliveryAddress: "Block 4, Lot 12, Sunrise Village, Brgy. San Jose",
        paymentMethod: "Cash on Delivery",
        createdAt: "2026-08-10T08:00:00.000Z",
      },
    ]);

    seedIfMissing("aquatracker_customer_loyalty", {
      balance: 240,
      tier: "Silver Refiller",
      nextTierPoints: 500,
      history: [
        { id: "lh-1", type: "earn", title: "Refill Order #AT-1048", points: 20, date: "Today" },
        { id: "lh-2", type: "earn", title: "September Refill Streak", points: 25, date: "Sep 22, 2026" },
        { id: "lh-3", type: "earn", title: "Refill Order #AT-1042", points: 60, date: "Sep 23, 2026" },
        { id: "lh-4", type: "welcome", title: "Welcome Account Bonus", points: 50, date: "Sep 01, 2026" },
      ],
      rewardsCatalog: [
        { id: "rew-30-off", name: "P30 Refill Voucher", category: "Discount", pointsCost: 100, description: "P30 off your next refill order.", code: "AQUA30OFF" },
        { id: "rew-70-off", name: "P70 Refill Voucher", category: "Discount", pointsCost: 200, description: "P70 off an order of two or more containers.", code: "AQUA70FREE" },
        { id: "rew-caps", name: "Sanitary Cap & Seal Kit", category: "Merchandise", pointsCost: 150, description: "A pack of five sanitary water-container caps.", code: "FREE-CAPS5" },
        { id: "rew-tumbler", name: "Insulated Water Tumbler", category: "Merchandise", pointsCost: 500, description: "A reusable insulated tumbler.", code: "CLAIM-TUMBLER" },
      ],
    });

    seedIfMissing("aquatracker_customer_notifications", [
      {
        id: "notif-1",
        title: "Order Out for Delivery!",
        message: "Your refill from ClearSpring Water Hub is on its way.",
        type: "order",
        time: "15 mins ago",
        read: false,
      },
      {
        id: "notif-2",
        title: "Upcoming Subscription Refill",
        message: "Your weekly refill is scheduled for Monday, Sep 28.",
        type: "subscription",
        time: "1 hour ago",
        read: false,
      },
    ]);

    seedIfMissing("aquatracker_saved_stations", ["drink-refill"]);

    const ownerOrders = [
      { id: "AT-1048", userId: "usr-cust-001", customerName: "Mia Santos", stationId: "drink-refill", stationName: "ClearSpring Water Hub", gallons: 2, fulfillment: "delivery", status: "Preparing", total: 85, createdAt: now },
      { id: "AT-1047", userId: "usr-cust-002", customerName: "Noah Garcia", stationId: "drink-refill", stationName: "ClearSpring Water Hub", gallons: 1, fulfillment: "pickup", status: "New order", total: 35, createdAt: now },
      { id: "AT-1046", userId: "usr-cust-003", customerName: "Lia Mendoza", stationId: "drink-refill", stationName: "ClearSpring Water Hub", gallons: 4, fulfillment: "delivery", status: "Delivered", total: 126, createdAt: "2026-09-23T14:00:00.000Z" },
      { id: "AT-1042", userId: "usr-cust-001", customerName: "Mia Santos", stationId: "drink-refill", stationName: "ClearSpring Water Hub", gallons: 2, fulfillment: "pickup", status: "Delivered", total: 70, createdAt: "2026-09-24T10:15:00.000Z" },
    ];

    seedIfMissing("aquatracker_business_stations_db", [
      {
        id: "drink-refill",
        name: "ClearSpring Water Hub",
        address: "45 Sabellano St, San Jose District, Pagadian City",
        phone: "0918 962 5038",
        contact: "0918 962 5038",
        hours: "Mon-Sat 7:30 AM-5:00 PM",
        ownerId: "usr-own-001",
      },
    ]);
    seedIfMissing("aquatracker_orders_db", ownerOrders);
    seedIfMissing("aquatracker_users_db", [
      { userId: "usr-stf-001", name: "Dani Cruz", email: "staff.demo@example.com", role: "staff", stationId: "drink-refill", status: "active" },
      { userId: "usr-stf-002", name: "Alex Rivera", email: "alex.rivera@example.com", role: "staff", stationId: "drink-refill", status: "active" },
    ]);
    seedIfMissing("aquatracker_inventory_db", {
      "drink-refill": { caps: 86, seals: 64, bottles: 42 },
    });
    seedIfMissing("aquatracker_pricing_db", {
      "drink-refill": {
        "5-gallon-slim": 35,
        "5-gallon-round": 35,
      },
    });
    seedIfMissing("aquatracker_promotions_db", [
      { id: "promo-free-delivery", stationId: "drink-refill", name: "Free Delivery Weekend", detail: "Free delivery on orders of 4+ gallons.", status: "Active", redemptions: 18 },
      { id: "promo-returning", stationId: "drink-refill", name: "Returning Customer Refill", detail: "10% off your next refill.", status: "Scheduled", redemptions: 7 },
    ]);
    seedIfMissing("aquatracker_notifications_db", [
      { id: "owner-note-1", stationId: "drink-refill", title: "Orders in progress", message: "Two orders are ready for fulfillment today.", type: "order", read: false, time: "Today" },
      { id: "owner-note-2", stationId: "drink-refill", title: "Weekly performance", message: "Orders are up 12% compared with last week.", type: "business", read: true, time: "Yesterday" },
    ]);
    seedIfMissing("aquatracker_station_subscriptions_db", [
      { id: "station-sub-1", stationId: "drink-refill", customerName: "Mia Santos", planName: "Monthly Essentials", gallons: 4, frequency: "Monthly", estimatedTotal: 126, status: "Active", nextRefill: "2026-10-03" },
      { id: "station-sub-2", stationId: "drink-refill", customerName: "Paolo Reyes", planName: "Family Refill Plan", gallons: 8, frequency: "Monthly", estimatedTotal: 238, status: "Active", nextRefill: "2026-10-05" },
    ]);
    seedIfMissing("aquatracker_staff_shifts_db", [
      { id: "shift-1", stationId: "drink-refill", staffId: "usr-stf-001", date: today, start: "08:00", end: "16:00", status: "Scheduled" },
      { id: "shift-2", stationId: "drink-refill", staffId: "usr-stf-001", date: today, start: "14:00", end: "21:00", status: "Scheduled" },
    ]);
    seedIfMissing("aquatracker_customer_requests_db", [
      { id: "REQ-1001", stationId: "drink-refill", customerName: "Mia Santos", subject: "Pickup time change", message: "Can I collect my refill after 6 PM?", status: "Open", createdAt: now },
      { id: "REQ-1002", stationId: "drink-refill", customerName: "Noah Garcia", subject: "Container return", message: "I have two empty containers to return.", status: "In progress", createdAt: now },
    ]);
    seedIfMissing("aquatracker_staff_approvals_db", [
      { id: "approval-1", stationId: "drink-refill", name: "Alex Rivera", email: "alex.rivera@example.com", status: "Pending" },
    ]);
  }

  const AuthModule = {
    initAuthStorage,
    seedDemoContent,
    getCurrentUser,
    setCurrentUser,
    login,
    register,
    logout,
    switchDemoRole,
    requireRole,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = AuthModule;
  } else {
    global.AquaAuth = AuthModule;
  }

  seedDemoContent();
})(typeof window !== "undefined" ? window : this);
