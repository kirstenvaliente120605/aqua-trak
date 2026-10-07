import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getOrderForStation, listOrdersForStation, orderStatuses, updateOrderForStation } from "./commerceStore.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../");
const dataDir = path.join(root, "data");
const shiftsFile = path.join(dataDir, "staff-shifts.json");
const inventoryFile = path.join(dataDir, "staff-inventory.json");
const requestsFile = path.join(dataDir, "customer-requests.json");
const notificationsFile = path.join(dataDir, "staff-notifications.json");

const defaultInventory = [
  { id: "five-gallon", name: "5-gallon containers", quantity: 42, reorderAt: 15, unit: "containers" },
  { id: "sealed-caps", name: "Sealed caps", quantity: 86, reorderAt: 30, unit: "caps" },
  { id: "sanitizer", name: "Sanitizer solution", quantity: 8, reorderAt: 4, unit: "bottles" },
  { id: "delivery-crates", name: "Delivery crates", quantity: 12, reorderAt: 5, unit: "crates" },
];

function read(file, fallback) {
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, `${JSON.stringify(fallback, null, 2)}\n`, "utf8");
    return fallback;
  }
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}
function write(file, value) { fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }
function stationFor(user) { return user.stationId || "drink-refill"; }
function seedShifts(user) {
  const shifts = read(shiftsFile, []);
  const mine = shifts.filter((shift) => shift.staffId === user.id);
  if (mine.length) return shifts;
  shifts.push(
    { id: crypto.randomUUID(), staffId: user.id, stationId: stationFor(user), date: new Date().toISOString().slice(0, 10), start: "14:00", end: "21:00", status: "Scheduled", attendance: null },
    { id: crypto.randomUUID(), staffId: user.id, stationId: stationFor(user), date: new Date(Date.now() + 86400000).toISOString().slice(0, 10), start: "08:00", end: "16:00", status: "Scheduled", attendance: null },
  );
  write(shiftsFile, shifts);
  return shifts;
}

export function getStaffStation(user) { return stationFor(user); }
export function listStaffOrders(user, filters = {}) {
  let orders = listOrdersForStation(stationFor(user));
  const search = String(filters.search || "").trim().toLowerCase();
  if (filters.status && filters.status !== "all") orders = orders.filter((order) => order.status === filters.status);
  if (search) orders = orders.filter((order) => `${order.id} ${order.customerName} ${order.stationName}`.toLowerCase().includes(search));
  return orders;
}
export function getStaffOrder(user, id) { return getOrderForStation(id, stationFor(user)); }
export function updateStaffOrder(user, id, updates) {
  return updateOrderForStation(id, stationFor(user), updates);
}
export function listShifts(user) { return seedShifts(user).filter((shift) => shift.staffId === user.id && shift.stationId === stationFor(user)); }
export function updateAttendance(user, id, action) {
  const shifts = read(shiftsFile, []);
  const shift = shifts.find((item) => item.id === id && item.staffId === user.id && item.stationId === stationFor(user));
  if (!shift || !["check-in", "check-out"].includes(action)) return null;
  shift.attendance = shift.attendance || {};
  shift.attendance[action] = new Date().toISOString();
  shift.status = action === "check-in" ? "In progress" : "Completed";
  write(shiftsFile, shifts);
  return shift;
}
export function listInventory(user) {
  const inventory = read(inventoryFile, defaultInventory);
  return inventory.filter((item) => !item.stationId || item.stationId === stationFor(user));
}
export function reportInventory(user, details) {
  const inventory = read(inventoryFile, defaultInventory);
  const item = inventory.find((candidate) => candidate.id === details.itemId && (!candidate.stationId || candidate.stationId === stationFor(user)));
  if (!item) return null;
  const amount = Math.max(1, Math.min(1000, Number(details.amount) || 1));
  item.reports = item.reports || [];
  item.reports.push({ id: crypto.randomUUID(), type: ["return", "damage", "missing"].includes(details.type) ? details.type : "missing", amount, note: String(details.note || "").trim().slice(0, 500), staffId: user.id, createdAt: new Date().toISOString() });
  if (details.type === "damage" || details.type === "missing") item.quantity = Math.max(0, item.quantity - amount);
  if (details.type === "return") item.quantity += amount;
  write(inventoryFile, inventory);
  return item;
}
export function listCustomerRequests(user) {
  const requests = read(requestsFile, [
    { id: "REQ-1001", stationId: "drink-refill", customerName: "Mia Santos", subject: "Pickup time change", message: "Can I collect my refill after 6 PM?", status: "Open", createdAt: new Date().toISOString() },
    { id: "REQ-1002", stationId: "drink-refill", customerName: "Noah Garcia", subject: "Container return", message: "I have two empty containers to return.", status: "Open", createdAt: new Date().toISOString() },
  ]);
  return requests.filter((request) => request.stationId === stationFor(user));
}
export function updateCustomerRequest(user, id, status) {
  const requests = read(requestsFile, []);
  const request = requests.find((item) => item.id === id && item.stationId === stationFor(user));
  if (!request || !["Open", "In progress", "Resolved", "Closed"].includes(status)) return null;
  request.status = status;
  request.updatedAt = new Date().toISOString();
  write(requestsFile, requests);
  return request;
}
export function listNotifications(user) {
  const notifications = read(notificationsFile, [
    { id: "N-1", stationId: "drink-refill", title: "Inventory alert", message: "Check refill inventory before 4:00 PM.", read: false, createdAt: new Date().toISOString() },
    { id: "N-2", stationId: "drink-refill", title: "Shift reminder", message: "Your next shift starts at 2:00 PM.", read: false, createdAt: new Date().toISOString() },
  ]);
  return notifications.filter((notification) => notification.stationId === stationFor(user));
}
export function getStaffOverview(user) {
  const orders = listStaffOrders(user);
  const shifts = listShifts(user);
  const inventory = listInventory(user);
  const requests = listCustomerRequests(user);
  const today = new Date().toISOString().slice(0, 10);
  const currentShift = shifts.find((shift) => shift.date === today) || shifts[0] || null;
  const pendingOrders = orders.filter((order) => ["New", "Confirmed", "Preparing", "Ready for Pickup", "Out for Delivery"].includes(order.status));
  const completedTasks = orders.filter((order) => order.status === "Delivered").slice(0, 5).map((order) => ({ id: order.id, label: `Order ${order.id} delivered`, detail: `${order.customerName} · ${order.gallons} gallons`, completedAt: order.updatedAt || order.createdAt }));
  const inventoryAlerts = inventory.filter((item) => item.quantity <= item.reorderAt).map((item) => ({ id: item.id, label: `${item.name} is low`, detail: `${item.quantity} ${item.unit} remaining · reorder at ${item.reorderAt}` }));
  return {
    stationId: stationFor(user), stationName: user.station || "Assigned station",
    metrics: { assignedOrders: pendingOrders.length, ready: orders.filter((order) => order.status === "Ready for Pickup").length, openRequests: requests.filter((request) => request.status !== "Resolved" && request.status !== "Closed").length, lowStock: inventoryAlerts.length },
    orders: orders.slice(0, 5), pendingOrders: pendingOrders.slice(0, 5), completedTasks, inventoryAlerts, currentShift, nextShift: shifts[0] || null, notifications: listNotifications(user),
  };
}
export { orderStatuses };
