/**
 * Owner data facade for the temporary localStorage prototype layer.
 * Replace these reads/writes with permanent backend calls during migration.
 */

(function (global) {
  "use strict";

  const keys = global.AquaCommon.STORE_KEYS;
  const common = global.AquaCommon;
  const stationId = "drink-refill";

  function currentOrders() {
    return common.read(keys.ORDERS, []).filter(order => order.stationId === stationId);
  }

  async function fetchBusinessStats() {
    const orders = currentOrders();
    return {
      revenue: orders.reduce((sum, order) => sum + Number(order.total || 0), 0),
      orderVolume: orders.length,
      ordersToday: orders.filter(order => order.createdAt?.slice(0, 10) === new Date().toISOString().slice(0, 10)).length,
      customerCount: new Set(orders.map(order => order.userId || order.customerName)).size,
    };
  }

  async function fetchOrders() {
    return currentOrders();
  }

  async function fetchPricing() {
    return common.read(keys.PRICING, {})[stationId];
  }

  async function updatePricing(pricingData) {
    const pricing = common.read(keys.PRICING, {});
    pricing[stationId] = pricingData;
    common.write(keys.PRICING, pricing);
    return { success: true };
  }

  async function fetchCustomers() {
    const customers = new Map();
    currentOrders().forEach(order => {
      const id = order.userId || order.customerName;
      const customer = customers.get(id) || { id, name: order.customerName || "Customer", totalSpent: 0, orderCount: 0, lastOrder: order.createdAt };
      customer.totalSpent += Number(order.total || 0);
      customer.orderCount += 1;
      if (order.createdAt > customer.lastOrder) customer.lastOrder = order.createdAt;
      customers.set(id, customer);
    });
    return [...customers.values()];
  }

  async function fetchSettings() {
    return common.read(keys.STATIONS, []).find(station => station.id === stationId);
  }

  async function updateSettings(settingsData) {
    const stations = common.read(keys.STATIONS, []);
    const index = stations.findIndex(station => station.id === stationId);
    if (index === -1) throw new Error("Prototype station record is missing.");
    stations[index] = { ...stations[index], ...settingsData };
    common.write(keys.STATIONS, stations);
    return { success: true };
  }

  async function fetchStaffApprovals() {
    return common.read(keys.APPROVALS, []).filter(item => item.stationId === stationId && item.status === "Pending");
  }

  async function fetchStaff() {
    return common.read(keys.USERS, []).filter(user => user.stationId === stationId);
  }

  async function decideStaffApproval(id, decision) {
    if (!["approve", "reject"].includes(decision)) throw new Error("Invalid approval decision.");
    const approvals = common.read(keys.APPROVALS, []);
    const item = approvals.find(approval => approval.id === id && approval.stationId === stationId);
    if (!item) throw new Error("Staff approval not found.");
    item.status = decision === "approve" ? "Approved" : "Rejected";
    common.write(keys.APPROVALS, approvals);
    return { approval: item };
  }

  async function fetchSubscriptions() {
    return common.read(keys.SUBSCRIPTIONS, []).filter(item => item.stationId === stationId);
  }

  async function fetchPromotions() {
    return common.read(keys.PROMOTIONS, []).filter(item => item.stationId === stationId);
  }

  async function fetchCustomersRequests() {
    return common.read(keys.REQUESTS, []).filter(item => item.stationId === stationId);
  }

  const AquaOwner = {
    fetchBusinessStats,
    fetchOrders,
    fetchPricing,
    updatePricing,
    fetchCustomers,
    fetchSettings,
    updateSettings,
    fetchStaffApprovals,
    fetchStaff,
    decideStaffApproval,
    fetchSubscriptions,
    fetchPromotions,
    fetchCustomersRequests,
  };

  global.AquaOwner = AquaOwner;

  // Bridge AquaCommon for compatibility with owner-dashboard.js
  global.AquaCommon = {
    ...global.AquaCommon,
    fetchOrders: global.AquaCommon.fetchOrders
  };

})(typeof window !== "undefined" ? window : this);
