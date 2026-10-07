/**
 * AquaTracker — Owner-Specific Logic (owner.js)
 *
 * Handles business management: pricing, staff, and station settings.
 */

(function (global) {
  "use strict";

  const STORE_KEYS = global.AquaCommon.STORE_KEYS;

  async function updateStationProfile(stationId, data) {
    /* BACKEND INTEGRATION STUB: PATCH /api/stations/:id */
    const stations = JSON.parse(localStorage.getItem(STORE_KEYS.STATIONS) || "[]");
    const idx = stations.findIndex(s => s.id === stationId);
    if (idx !== -1) {
      stations[idx] = { ...stations[idx], ...data };
      localStorage.setItem(STORE_KEYS.STATIONS, JSON.stringify(stations));
    }
    return { success: true };
  }

  async function updatePricing(stationId, product, price) {
    /* BACKEND INTEGRATION STUB: POST /api/pricing */
    const pricing = JSON.parse(localStorage.getItem(STORE_KEYS.PRICING) || "{}");
    if (!pricing[stationId]) pricing[stationId] = {};
    pricing[stationId][product] = parseFloat(price);
    localStorage.setItem(STORE_KEYS.PRICING, JSON.stringify(pricing));
    return { success: true };
  }

  async function addStaffMember(user) {
    /* BACKEND INTEGRATION STUB: POST /api/staff */
    const users = JSON.parse(localStorage.getItem(STORE_KEYS.USERS) || "[]");
    users.push({ ...user, role: 'staff', userId: 'usr-stf-' + Date.now() });
    localStorage.setItem(STORE_KEYS.USERS, JSON.stringify(users));
    return { success: true };
  }

  async function removeStaffMember(userId) {
    /* BACKEND INTEGRATION STUB: DELETE /api/staff/:id */
    const users = JSON.parse(localStorage.getItem(STORE_KEYS.USERS) || "[]");
    const filtered = users.filter(u => u.userId !== userId);
    localStorage.setItem(STORE_KEYS.USERS, JSON.stringify(filtered));
    return { success: true };
  }

  async function fetchBusinessStats(stationId) {
    const orders = await global.AquaCommon.fetchOrders(stationId);
    const revenue = orders.reduce((sum, o) => sum + (o.total || 0), 0);
    return {
      revenue,
      orderVolume: orders.length,
      ordersToday: orders.filter(o => o.createdAt.startsWith(new Date().toISOString().split('T')[0])).length,
      customerCount: [...new Set(orders.map(o => o.userId))].length
    };
  }

  const AquaOwner = {
    updateStationProfile,
    updatePricing,
    addStaffMember,
    removeStaffMember,
    fetchBusinessStats,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = AquaOwner;
  } else {
    global.AquaOwner = AquaOwner;
  }
})(typeof window !== "undefined" ? window : this);
