/**
 * AquaTracker shared prototype data.
 * These localStorage records are temporary demo data; replace this module
 * with backend-backed data access during the data migration. Authentication
 * remains server-authoritative and is intentionally not stored here.
 */

(function (global) {
  "use strict";

  const STORE_KEYS = {
    STATIONS: "aquatracker_business_stations_db",
    ORDERS: "aquatracker_orders_db",
    USERS: "aquatracker_users_db",
    INVENTORY: "aquatracker_inventory_db",
    PRICING: "aquatracker_pricing_db",
    PROMOTIONS: "aquatracker_promotions_db",
    NOTIFICATIONS: "aquatracker_notifications_db",
    SUBSCRIPTIONS: "aquatracker_station_subscriptions_db",
    SHIFTS: "aquatracker_staff_shifts_db",
    REQUESTS: "aquatracker_customer_requests_db",
    APPROVALS: "aquatracker_staff_approvals_db",
  };

  const DEFAULT_STATIONS = [
    {
      id: "drink-refill",
      name: "ClearSpring Water Hub",
      address: "45 Sabellano St, San Jose District, Pagadian City",
      phone: "0918 962 5038",
      contact: "0918 962 5038",
      hours: "Mon–Sat 7:30 AM–5:00 PM",
      ownerId: "usr-own-001",
    },
    {
      id: "ultra-pure",
      name: "Ultra Pure Water Refilling Station",
      address: "Purok Bakhaw A, Brgy. Kawit, Pagadian City",
      phone: "0970 488 8866",
      hours: "Mon–Sun 8:00 AM–6:00 PM",
      ownerId: "usr-own-002",
    },
  ];

  const DEFAULT_ORDERS = [
    { id: "AT-1048", userId: "usr-cust-001", customerName: "Mia Santos", stationId: "drink-refill", stationName: "ClearSpring Water Hub", gallons: 2, fulfillment: "delivery", status: "Ready for Pickup", total: 70, createdAt: "2026-09-24T10:15:00.000Z" },
    { id: "AT-1047", userId: "usr-cust-002", customerName: "Noah Garcia", stationId: "drink-refill", stationName: "ClearSpring Water Hub", gallons: 1, fulfillment: "pickup", status: "Preparing", total: 35, createdAt: "2026-09-25T08:30:00.000Z" },
    { id: "AT-1046", userId: "usr-cust-003", customerName: "Lia Mendoza", stationId: "drink-refill", stationName: "ClearSpring Water Hub", gallons: 4, fulfillment: "delivery", status: "Delivered", total: 126, createdAt: "2026-09-23T14:00:00.000Z" },
  ];

  function seed(key, value) {
    if (localStorage.getItem(key) === null) {
      localStorage.setItem(key, JSON.stringify(value));
    }
  }

  function initStore() {
    if (typeof localStorage === "undefined") return;
    seed(STORE_KEYS.STATIONS, DEFAULT_STATIONS);
    seed(STORE_KEYS.ORDERS, DEFAULT_ORDERS);
    seed(STORE_KEYS.USERS, [
      { userId: "usr-stf-001", name: "Dani Cruz", email: "staff.demo@example.com", role: "staff", stationId: "drink-refill", status: "active" },
    ]);
    seed(STORE_KEYS.INVENTORY, {
      "drink-refill": { caps: 86, seals: 64, bottles: 42 },
    });
    seed(STORE_KEYS.PRICING, {
      "drink-refill": { "5-gallon-slim": 35, "5-gallon-round": 35 },
    });
    seed(STORE_KEYS.PROMOTIONS, [
      { id: "promo-free-delivery", stationId: "drink-refill", name: "Free delivery weekend", detail: "Free delivery on orders of 4+ gallons", status: "Active", redemptions: 18 },
      { id: "promo-returning", stationId: "drink-refill", name: "Returning customer refill", detail: "10% off your next refill", status: "Scheduled", redemptions: 7 },
    ]);
    seed(STORE_KEYS.NOTIFICATIONS, [
      { id: "owner-note-1", stationId: "drink-refill", title: "Order ready for pickup", message: "Order AT-1048 is ready at the station counter.", type: "order", read: false, time: "Today" },
      { id: "owner-note-2", stationId: "drink-refill", title: "Weekly performance", message: "Orders are up 12% compared with last week.", type: "business", read: true, time: "Yesterday" },
    ]);
    seed(STORE_KEYS.SUBSCRIPTIONS, [
      { id: "station-sub-1", stationId: "drink-refill", customerName: "Mia Santos", planName: "Monthly essentials", gallons: 4, frequency: "Monthly", estimatedTotal: 126, status: "Active", nextRefill: "2026-10-03" },
      { id: "station-sub-2", stationId: "drink-refill", customerName: "Paolo Reyes", planName: "Family refill plan", gallons: 8, frequency: "Monthly", estimatedTotal: 238, status: "Active", nextRefill: "2026-10-05" },
    ]);
    seed(STORE_KEYS.SHIFTS, [
      { id: "shift-1", stationId: "drink-refill", staffId: "usr-stf-001", date: "2026-09-26", start: "14:00", end: "21:00", status: "Scheduled" },
      { id: "shift-2", stationId: "drink-refill", staffId: "usr-stf-001", date: "2026-09-27", start: "08:00", end: "16:00", status: "Scheduled" },
    ]);
    seed(STORE_KEYS.REQUESTS, [
      { id: "REQ-1001", stationId: "drink-refill", customerName: "Mia Santos", subject: "Pickup time change", message: "Can I collect my refill after 6 PM?", status: "Open" },
      { id: "REQ-1002", stationId: "drink-refill", customerName: "Noah Garcia", subject: "Container return", message: "I have two empty containers to return.", status: "In progress" },
    ]);
    seed(STORE_KEYS.APPROVALS, [
      { id: "approval-1", stationId: "drink-refill", name: "Alex Rivera", email: "alex.rivera@example.com", status: "Pending" },
    ]);
  }

  function read(key, fallback) {
    initStore();
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  }

  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
    return value;
  }

  async function fetchStations() {
    return read(STORE_KEYS.STATIONS, []);
  }

  async function fetchOrders(stationId = null, userId = null) {
    let orders = read(STORE_KEYS.ORDERS, []);
    if (stationId) orders = orders.filter(order => order.stationId === stationId);
    if (userId) orders = orders.filter(order => order.userId === userId);
    return orders;
  }

  async function pushNotification(notif) {
    const notifs = read(STORE_KEYS.NOTIFICATIONS, []);
    const newNotif = {
      id: "notif-" + Date.now(),
      title: notif.title,
      message: notif.message,
      type: notif.type || "info",
      time: "Just now",
      read: false,
      stationId: notif.stationId || "drink-refill",
    };
    notifs.unshift(newNotif);
    write(STORE_KEYS.NOTIFICATIONS, notifs);
    return newNotif;
  }

  const AquaCommon = {
    initStore,
    fetchStations,
    fetchOrders,
    pushNotification,
    read,
    write,
    STORE_KEYS,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = AquaCommon;
  } else {
    global.AquaCommon = AquaCommon;
  }
})(typeof window !== "undefined" ? window : this);
