import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../db.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../");
const dataDir = path.join(root, "data");
const ordersFile = path.join(dataDir, "orders.json");
const subscriptionsFile = path.join(dataDir, "subscriptions.json");

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

export const stationCatalog = [
  { id: "alka", name: "Alka Water Refilling Station", area: "Zone 11, Alta Tierra Subdivision, Tiguma", address: "Zone 11, Alta Tierra Subdivision, Tiguma", phone: "", hours: "", coords: null, pricePerGallon: 35, delivery: true, rating: 0 },
  { id: "aquater", name: "Aqua'Ter SMN Water Refilling Station", area: "Beside DXPR, San Jose District", address: "Beside DXPR Radio, San Jose District, Pagadian City", phone: "0975 462 7620", hours: "Mon-Sun 6:30 AM-7:00 PM", coords: { lat: 7.8191, lng: 123.4412 }, pricePerGallon: 25, delivery: true, rating: 4.9 },
  { id: "drink-refill", name: "DRINK n' REFILL Purified Water Refilling Station", area: "45 Sabellano St, Pagadian City", address: "45 Sabellano St, San Jose District, Pagadian City", phone: "0918 962 5038", hours: "Mon-Sat 7:30 AM-5:00 PM", coords: { lat: 7.8269, lng: 123.4371 }, pricePerGallon: 35, delivery: true, rating: 4.9 },
  { id: "pg-aquamaster", name: "PG Aquamaster Water Refilling Station", area: "Purok Makugihon, Brgy. Bulatok", address: "Purok Makugihon, Brgy. Bulatok, Pagadian City", phone: "0951 312 5308", hours: "Mon-Sat 8:00 AM-5:00 PM", coords: { lat: 7.8198, lng: 123.4297 }, pricePerGallon: 30, delivery: false, rating: 4.6 },
  { id: "ph2o", name: "PH2O Water Refilling Station", area: "Warlito Pulmones St, Santiago District", address: "Warlito Pulmones St, Santiago District, Pagadian City", phone: "0985 337 4448", hours: "24/7 Automated Vendo & Counter", coords: { lat: 7.8362, lng: 123.4264 }, pricePerGallon: 30, delivery: false, rating: 4.8 },
  { id: "ultra-pure", name: "Ultra Pure Water Refilling Station", area: "Purok Bakhaw A, Brgy. Kawit", address: "Purok Bakhaw A, Brgy. Kawit, Pagadian City", phone: "0970 488 8866", hours: "Mon-Sun 8:00 AM-6:00 PM", coords: { lat: 7.8312, lng: 123.4437 }, pricePerGallon: 30, delivery: false, rating: 4.7 },
  { id: "waterpol", name: "Waterpol Water Refilling Station", area: "Purok Pagang, Brgy. Kawit", address: "Purok Pagang, Brgy. Kawit, Pagadian City", phone: "0927 251 4246", hours: "Mon-Sat 7:00 AM-6:30 PM", coords: { lat: 7.8347, lng: 123.4481 }, pricePerGallon: 35, delivery: true, rating: 4.8 },
];

export async function getStationCatalog() {
  try {
    const [rows] = await pool.execute("SELECT * FROM stations ORDER BY name ASC");
    if (rows && rows.length) {
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        area: String(row.area || ""),
        address: String(row.address || row.area || ""),
        phone: String(row.phone || ""),
        hours: String(row.hours || ""),
        coords:
          row.lat == null || row.lng == null
            ? null
            : { lat: Number(row.lat), lng: Number(row.lng) },
        pricePerGallon: Number(row.price_per_gallon || 30),
        delivery: Boolean(row.delivery),
        rating: Number(row.rating || 0),
      }));
    }
  } catch (err) {
    console.error("Error reading stations from MySQL:", err.message);
  }
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
  const nextNum = 2000 + orders.length + 1;
  const orderId = `AT-${String(nextNum).padStart(4, "0")}`;
  const now = new Date();
  
  const order = {
    id: orderId,
    userId: user.id,
    customerName: user.name || "Customer",
    station: pricing.station,
    stationId: pricing.station.id,
    stationName: pricing.station.name,
    gallons: pricing.gallons,
    fulfillment,
    status: "New order",
    unitPrice: pricing.unitPrice,
    subtotal: pricing.subtotal,
    discountRate: pricing.discountRate,
    discount: pricing.discount,
    total: pricing.total,
    createdAt: now.toISOString(),
  };
  orders.push(order);
  write(ordersFile, orders);

  // Sync asynchronously to MySQL
  (async () => {
    try {
      await pool.execute(
        `INSERT INTO orders (id, user_id, customer_name, station_id, station_name, gallons, fulfillment, status, unit_price, subtotal, discount_rate, discount, total, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          order.id,
          order.userId,
          order.customerName,
          order.stationId,
          order.stationName,
          order.gallons,
          order.fulfillment,
          order.status,
          order.unitPrice,
          order.subtotal,
          order.discountRate,
          order.discount,
          order.total,
          now,
        ]
      );
    } catch (e) {
      // Ignore if user FK or schema differs in local environment
    }
  })();

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

  // Sync to MySQL
  (async () => {
    try {
      await pool.execute(
        "UPDATE orders SET status = ?, internal_note = ?, updated_at = NOW() WHERE id = ?",
        [order.status, order.internalNote || null, order.id]
      );
    } catch {
      // Ignored
    }
  })();

  return { ...order, status: order.status === "New order" ? "New" : order.status };
}

export function createSubscription(user, details) {
  const pricing = calculatePrice(details.stationId, details.gallons);
  if (!pricing) return { error: "Choose a station and between 1 and 100 gallons." };
  const frequency = ["weekly", "biweekly", "monthly"].includes(details.frequency) ? details.frequency : "monthly";
  const subscriptions = read(subscriptionsFile, []);
  const now = new Date();
  const nextRefill = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const subscription = {
    id: `SUB-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    userId: user.id,
    customerName: user.name || "Customer",
    stationId: pricing.station.id,
    stationName: pricing.station.name,
    gallons: pricing.gallons,
    frequency,
    unitPrice: pricing.unitPrice,
    discountRate: Math.max(pricing.discountRate, 0.1),
    estimatedTotal: Math.round(pricing.total * (1 - Math.max(pricing.discountRate, 0.1)) * 100) / 100,
    status: "Active",
    nextRefill: nextRefill.toISOString(),
    createdAt: now.toISOString(),
  };
  subscriptions.push(subscription);
  write(subscriptionsFile, subscriptions);

  // Sync to MySQL
  (async () => {
    try {
      await pool.execute(
        `INSERT INTO subscriptions (id, user_id, customer_name, station_id, station_name, gallons, frequency, unit_price, discount_rate, estimated_total, status, next_refill, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          subscription.id,
          subscription.userId,
          subscription.customerName,
          subscription.stationId,
          subscription.stationName,
          subscription.gallons,
          subscription.frequency,
          subscription.unitPrice,
          subscription.discountRate,
          subscription.estimatedTotal,
          subscription.status,
          nextRefill,
          now,
        ]
      );
    } catch {
      // Ignored
    }
  })();

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

  (async () => {
    try {
      await pool.execute(
        "UPDATE subscriptions SET status = 'Cancelled', cancelled_at = NOW() WHERE id = ? AND user_id = ?",
        [id, userId]
      );
    } catch {
      // Ignored
    }
  })();

  return subscription;
}
