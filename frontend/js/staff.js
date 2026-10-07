/**
 * AquaTracker — Staff-Specific Logic (staff.js)
 *
 * Handles operational fulfillment and inventory control.
 */

(function (global) {
  "use strict";

  const STORE_KEYS = global.AquaCommon.STORE_KEYS;

  async function updateOrderStatus(orderId, newStatus) {
    /* BACKEND INTEGRATION STUB: PATCH /api/orders/:id/status */
    const orders = JSON.parse(localStorage.getItem(STORE_KEYS.ORDERS) || "[]");
    const idx = orders.findIndex(o => o.id === orderId);
    if (idx !== -1) {
      orders[idx].status = newStatus;
      orders[idx].updatedAt = new Date().toISOString();
      localStorage.setItem(STORE_KEYS.ORDERS, JSON.stringify(orders));
    }
    return { success: true };
  }

  async function updateInventory(stationId, item, amount) {
    /* BACKEND INTEGRATION STUB: POST /api/inventory/update */
    const inv = JSON.parse(localStorage.getItem(STORE_KEYS.INVENTORY) || "{}");
    if (!inv[stationId]) inv[stationId] = { caps: 0, seals: 0, bottles: 0 };
    inv[stationId][item] += parseInt(amount);
    localStorage.setItem(STORE_KEYS.INVENTORY, JSON.stringify(inv));
    return { success: true, current: inv[stationId] };
  }

  async function fetchInventory(stationId) {
    const inv = JSON.parse(localStorage.getItem(STORE_KEYS.INVENTORY) || "{}");
    return inv[stationId] || { caps: 0, seals: 0, bottles: 0 };
  }

  const AquaStaff = {
    updateOrderStatus,
    updateInventory,
    fetchInventory,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = AquaStaff;
  } else {
    global.AquaStaff = AquaStaff;
  }
})(typeof window !== "undefined" ? window : this);
