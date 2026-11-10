/**
 * Owner data facade backed by the PHP/ERD API.
 *
 * Customer requests have no ERD table, so that read-only demo inbox remains in
 * localStorage. Every other section reads and writes shared database rows.
 */

(function (global) {
  "use strict";

  const keys = global.AquaCommon.STORE_KEYS;
  const common = global.AquaCommon;
  let stationId = null;
  const stationStorageKey = "aquatracker_owner_station_id";
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

  function stationPath(path) {
    if (!stationId) return path;
    return `${path}${path.includes("?") ? "&" : "?"}stationId=${encodeURIComponent(stationId)}`;
  }

  function renderStationSelect(stations) {
    const select = document.getElementById("owner-station-select");
    if (!select) return;
    select.innerHTML = stations.map(station =>
      `<option value="${escapeHtml(station.id)}">${escapeHtml(station.name)}</option>`
    ).join("");
    select.value = stationId || "";
    select.hidden = stations.length < 2;
  }

  async function initializeStations() {
    const data = await common.api("/api/owner/stations");
    const stations = Array.isArray(data.stations) ? data.stations : [];
    ownerStations = stations;
    const storedId = localStorage.getItem(stationStorageKey);
    stationId = stations.some(item => item.id === storedId)
      ? storedId
      : (stations.some(item => item.id === stationId) ? stationId : (stations[0]?.id || null));
    if (stationId) localStorage.setItem(stationStorageKey, stationId);
    renderStationSelect(stations);
    return stations;
  }

  function selectStation(id) {
    stationId = id || null;
    if (stationId) localStorage.setItem(stationStorageKey, stationId);
    renderStationSelect(ownerStations);
  }

  let ownerStations = [];

  function setOwner(user) {
    stationId = localStorage.getItem(stationStorageKey) || user.stationId || null;

    if (!stationId) {
      const stations = common.read(keys.STATIONS, []);
      const station = stations.find(item =>
        (user.userId && item.ownerId === user.userId) ||
        (user.station && item.name === user.station)
      );
      stationId = station ? station.id : null;
    }
  }

  function localRequests() {
    return common.read(keys.REQUESTS, []).filter(item => item.stationId === stationId);
  }

  async function fetchBusinessStats() {
    return common.api(stationPath("/api/owner/overview"));
  }

  async function fetchStations() {
    const data = await common.api("/api/owner/stations");
    ownerStations = Array.isArray(data.stations) ? data.stations : [];
    renderStationSelect(ownerStations);
    return ownerStations;
  }

  async function addStation(stationData) {
    const data = await common.api("/api/owner/stations", {
      method: "POST",
      body: JSON.stringify(stationData),
    });
    await fetchStations();
    if (data.station?.id) selectStation(data.station.id);
    return data.station;
  }

  async function fetchOrders() {
    const data = await common.api(stationPath("/api/owner/orders"));
    return Array.isArray(data.orders) ? data.orders : [];
  }

  async function updateOrderStatus(orderId, newStatus) {
    const data = await common.api(stationPath(`/api/owner/orders/${encodeURIComponent(orderId)}`), {
      method: "PATCH",
      body: JSON.stringify({ status: newStatus }),
    });
    return data.order;
  }

  async function fetchInventory() {
    const data = await common.api(stationPath("/api/owner/inventory"));
    return data.inventory || {};
  }

  async function fetchPricing() {
    const data = await common.api(stationPath("/api/owner/pricing"));
    return data.pricing || {};
  }

  async function updatePricing(pricingData) {
    const data = await common.api(stationPath("/api/owner/pricing"), {
      method: "POST",
      body: JSON.stringify({ pricing: pricingData }),
    });
    return data;
  }

  async function fetchCustomers() {
    const data = await common.api(stationPath("/api/owner/customers"));
    return Array.isArray(data.customers) ? data.customers : [];
  }

  async function fetchSettings() {
    const data = await common.api(stationPath("/api/owner/settings"));
    return data.settings || {};
  }

  async function updateSettings(settingsData) {
    const data = await common.api(stationPath("/api/owner/settings"), {
      method: "POST",
      body: JSON.stringify({ settings: settingsData }),
    });
    return data.settings;
  }

  async function fetchStaffApprovals() {
    const data = await common.api(stationPath("/api/staff-approvals"));
    return Array.isArray(data.approvals) ? data.approvals : [];
  }

  async function fetchStaff() {
    const data = await common.api(stationPath("/api/owner/staff"));
    return Array.isArray(data.staff) ? data.staff : [];
  }

  async function decideStaffApproval(id, decision) {
    if (!["approve", "reject"].includes(decision)) {
      throw new Error("Invalid approval decision.");
    }
    return common.api(stationPath(`/api/staff-approvals/${encodeURIComponent(id)}`), {
      method: "POST",
      body: JSON.stringify({ decision }),
    });
  }

  async function fetchSubscriptions() {
    const data = await common.api(stationPath("/api/owner/subscriptions"));
    return Array.isArray(data.subscriptions) ? data.subscriptions : [];
  }

  async function fetchPromotions() {
    const data = await common.api(stationPath("/api/owner/promotions"));
    return Array.isArray(data.promotions) ? data.promotions : [];
  }

  async function createPromotion(promotionData) {
    const data = await common.api(stationPath("/api/owner/promotions"), {
      method: "POST",
      body: JSON.stringify(promotionData),
    });
    return data.promotion;
  }

  async function fetchCustomersRequests() {
    return localRequests();
  }

  const AquaOwner = {
    setOwner,
    initializeStations,
    fetchStations,
    addStation,
    selectStation,
    getSelectedStationId: () => stationId,
    fetchBusinessStats,
    fetchOrders,
    updateOrderStatus,
    fetchInventory,
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
    createPromotion,
    fetchCustomersRequests,
  };

  global.AquaOwner = AquaOwner;

  // Keep AquaCommon available for owner-dashboard.js compatibility.
  global.AquaCommon = {
    ...global.AquaCommon,
    fetchOrders: global.AquaCommon.fetchOrders,
  };
})(typeof window !== "undefined" ? window : this);

