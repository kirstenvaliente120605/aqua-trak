/**
 * AquaTracker - Staff-specific logic backed by the ERD API.
 */

(function (global) {
  "use strict";

  const common = global.AquaCommon;

  async function updateOrderStatus(orderId, newStatus) {
    const data = await common.api(`/api/staff/orders/${encodeURIComponent(orderId)}`, {
      method: "PATCH",
      body: JSON.stringify({ status: newStatus }),
    });
    return data.order;
  }

  async function updateInventory(stationId, item, amount) {
    const data = await common.api("/api/staff/inventory/report", {
      method: "POST",
      body: JSON.stringify({ item, amount: Number(amount) || 0 }),
    });
    return { success: true, item: data.item };
  }

  async function fetchInventory(stationId) {
    const data = await common.api("/api/staff/inventory");
    const map = data.map || {};
    return {
      caps: Number(map.caps || 0),
      seals: Number(map.seals || 0),
      bottles: Number(map.bottles || 0),
    };
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
