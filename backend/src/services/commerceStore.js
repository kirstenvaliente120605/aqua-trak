import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../");
const dataDir = path.join(root, "data");
const ordersFile = path.join(dataDir, "orders.json");
const subscriptionsFile = path.join(dataDir, "subscriptions.json");

export const stationCatalog = [
  { id: "drink-refill", name: "DRINK n' REFILL Purified Water Refilling Station", area: "45 Sabellano St, Pagadian City", pricePerGallon: 35, delivery: true },
  { id: "ultra-pure", name: "Ultra Pure Water Refilling Station", area: "Purok Bakhaw A, Brgy. Kawit", pricePerGallon: 30, delivery: false },
  { id: "waterpol", name: "Waterpol Water Refilling Station", area: "Purok Pagang, Brgy. Kawit", pricePerGallon: 35, delivery: true },
  { id: "pg-aquamaster", name: "PG Aquamaster Water Refilling Station", area: "Purok Makugihon, Brgy. Bulatok", pricePerGallon: 30, delivery: false },
  { id: "aquater", name: "Aqua'Ter SMN Water Refilling Station", area: "Beside DXPR, San Jose District", pricePerGallon: 25, delivery: true },
  { id: "ph2o", name: "PH2O Water Refilling Station", area: "Warlito Pulmones St, Santiago District", pricePerGallon: 30, delivery: false },
  { id: "alka", name: "Alka Water Refilling Station", area: "Zone 11, Alta Tierra Subdivision, Tiguma", pricePerGallon: 35, delivery: true },
];

function read(file, fallback) {
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, `${JSON.stringify(fallback, null, 2)}\n`, "utf8");
    return fallback;
  }
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    console.error(`Unable to read ${file}:`, error);
    return fallback;
  }
}

function write(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function getStationCatalog() {
  return stationCatalog;
}

export function calculatePrice(stationId, gallons) {
  const station = stationCatalog.find((item) => item.id === stationId);
  const quantity = Number(gallons);
  if (!station || !Number.isInteger(quantity) || quantity < 1 || quantity > 100) return null;
  const discountRate = quantity >= 8 ? 0.15 : quantity >= 5 ? 0.1 : 0;
  const subtotal = station.pricePerGallon * quantity;
  const discount = Math.round(subtotal * discountRate * 100) / 100;
  return {
    station,
    gallons: quantity,
    unitPrice: station.pricePerGallon,
    subtotal,
    discountRate,
    discount,
    total: subtotal - discount,
  };
}

export function createOrder(user, details) {
  const pricing = calculatePrice(details.stationId, details.gallons);
  if (!pricing) return { error: "Choose a station and between 1 and 100 gallons." };
  const fulfillment = details.fulfillment === "delivery" ? "delivery" : "pickup";
  if (fulfillment === "delivery" && !pricing.station.delivery) return { error: "This station does not offer delivery." };
  const orders = read(ordersFile, []);
  const order = {
    id: `AT-${String(2000 + orders.length + 1).padStart(4, "0")}`,
    userId: user.id,
    customerName: user.name,
    stationId: pricing.station.id,
    stationName: pricing.station.name,
    gallons: pricing.gallons,
    fulfillment,
    status: "New order",
    ...pricing,
    createdAt: new Date().toISOString(),
  };
  orders.push(order);
  write(ordersFile, orders);
  return { order };
}

export function listOrders(userId) {
  return read(ordersFile, []).filter((order) => order.userId === userId).reverse();
}

export const orderStatuses = ["New", "Confirmed", "Preparing", "Ready for Pickup", "Out for Delivery", "Delivered", "Cancelled"];

export function listOrdersForStation(stationId) {
  return read(ordersFile, [])
    .filter((order) => order.stationId === stationId)
    .map((order) => ({ ...order, status: order.status === "New order" ? "New" : order.status }))
    .reverse();
}

export function getOrderForStation(orderId, stationId) {
  return listOrdersForStation(stationId).find((order) => order.id === orderId) || null;
}

export function updateOrderForStation(orderId, stationId, updates) {
  const orders = read(ordersFile, []);
  const order = orders.find((candidate) => candidate.id === orderId && candidate.stationId === stationId);
  if (!order) return null;
  if (updates.status && !orderStatuses.includes(updates.status)) return null;
  if (updates.status) order.status = updates.status;
  if (typeof updates.internalNote === "string") order.internalNote = updates.internalNote.trim().slice(0, 1000);
  order.updatedAt = new Date().toISOString();
  write(ordersFile, orders);
  return { ...order, status: order.status === "New order" ? "New" : order.status };
}

export function createSubscription(user, details) {
  const pricing = calculatePrice(details.stationId, details.gallons);
  if (!pricing) return { error: "Choose a station and between 1 and 100 gallons." };
  const frequency = ["weekly", "biweekly", "monthly"].includes(details.frequency) ? details.frequency : "monthly";
  const subscriptions = read(subscriptionsFile, []);
  const subscription = {
    id: `SUB-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    userId: user.id,
    customerName: user.name,
    stationId: pricing.station.id,
    stationName: pricing.station.name,
    gallons: pricing.gallons,
    frequency,
    unitPrice: pricing.unitPrice,
    discountRate: Math.max(pricing.discountRate, 0.1),
    estimatedTotal: Math.round(pricing.total * (1 - Math.max(pricing.discountRate, 0.1)) * 100) / 100,
    status: "Active",
    nextRefill: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
  };
  subscriptions.push(subscription);
  write(subscriptionsFile, subscriptions);
  return { subscription };
}

export function listSubscriptions(userId) {
  return read(subscriptionsFile, []).filter((subscription) => subscription.userId === userId).reverse();
}

export function cancelSubscription(userId, id) {
  const subscriptions = read(subscriptionsFile, []);
  const subscription = subscriptions.find((item) => item.id === id && item.userId === userId);
  if (!subscription) return null;
  subscription.status = "Cancelled";
  subscription.cancelledAt = new Date().toISOString();
  write(subscriptionsFile, subscriptions);
  return subscription;
}
