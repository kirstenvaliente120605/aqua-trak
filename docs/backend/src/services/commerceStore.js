import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../db.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../");
const dataDir = path.join(root, "data");
const ordersFile = path.join(dataDir, "orders.json");
const subscriptionsFile = path.join(dataDir, "subscriptions.json");
const UNAVAILABLE_STATION_STATUSES = new Set([
  "closed", "inactive", "disabled", "maintenance", "paused", "suspended", "pending", "deleted", "archived", "0", "false",
]);

function isStationAvailable(status) {
  return !UNAVAILABLE_STATION_STATUSES.has(String(status ?? "").trim().toLowerCase());
}

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
  { id: "alka", name: "Alka Water Refilling Station", area: "Zone 11, Alta Tierra Subdivision, Tiguma", address: "Zone 11, Alta Tierra Subdivision, Tiguma, Pagadian City", hours: "", coords: { lat: 7.840580, lng: 123.463360 }, pricePerGallon: 35, delivery: true, rating: 0 },
  { id: "aquater", name: "Aqua'Ter SMN Water Refilling Station", area: "Beside DXPR, San Jose District", address: "Beside DXPR Radio, San Jose District, Pagadian City", hours: "Mon-Sun 6:30 AM-7:00 PM", coords: { lat: 7.81910000, lng: 123.44120000 }, pricePerGallon: 25, delivery: true, rating: 4.9 },
  { id: "drink-refill", name: "DRINK n' REFILL Purified Water Refilling Station", area: "45 Sabellano St, Pagadian City", address: "45 Sabellano St, San Jose District, Pagadian City", hours: "Mon-Sat 7:30 AM-5:00 PM", coords: { lat: 7.827330, lng: 123.444185 }, pricePerGallon: 35, delivery: true, rating: 4.9 },
  { id: "pg-aquamaster", name: "PG Aquamaster Water Refilling Station", area: "Purok Makugihon, Brgy. Bulatok", address: "Purok Makugihon, Brgy. Bulatok, Pagadian City", hours: "Mon-Sat 8:00 AM-5:00 PM", coords: { lat: 7.81980000, lng: 123.42970000 }, pricePerGallon: 30, delivery: false, rating: 4.6 },
  { id: "ph2o", name: "PH2O Water Refilling Station", area: "Warlito Pulmones St, Santiago District", address: "Warlito Pulmones St, Santiago District, Pagadian City", hours: "24/7 Automated Vendo & Counter", coords: { lat: 7.83620000, lng: 123.42640000 }, pricePerGallon: 30, delivery: false, rating: 4.8 },
  { id: "ultra-pure", name: "Ultra Pure Water Refilling Station", area: "Purok Bakhaw A, Brgy. Kawit", address: "Purok Bakhaw A, Brgy. Kawit, Pagadian City", hours: "Mon-Sun 8:00 AM-6:00 PM", coords: { lat: 7.83120000, lng: 123.44370000 }, pricePerGallon: 30, delivery: false, rating: 4.7 },
  { id: "waterpol", name: "Waterpol Water Refilling Station", area: "Purok Pagang, Brgy. Kawit", address: "Purok Pagang, Brgy. Kawit, Pagadian City", hours: "Mon-Sat 7:00 AM-6:30 PM", coords: { lat: 7.83470000, lng: 123.44810000 }, pricePerGallon: 35, delivery: true, rating: 4.8 },
];

export async function getStationCatalog() {
  try {
    const [rows] = await pool.execute("SELECT id, name, area, address, hours, lat, lng, price_per_gallon, delivery, delivery_fee, rating, status FROM stations ORDER BY name ASC");
    if (rows && rows.length) {
      return rows.map((row) => ({
        deliveryAvailable: Boolean(row.delivery),
        id: row.id,
        name: row.name,
        area: String(row.area || ""),
        address: String(row.address || row.area || ""),
        hours: String(row.hours || ""),
        coords:
          row.lat == null || row.lng == null
            ? null
            : { lat: Number(row.lat), lng: Number(row.lng) },
        pricePerGallon: Number(row.price_per_gallon),
        delivery: Boolean(row.delivery),
        deliveryFee: row.delivery ? Number(row.delivery_fee) : 0,
        rating: Number(row.rating || 0),
        status: String(row.status || "open").toLowerCase(),
        isAvailable: isStationAvailable(row.status),
      }));
    }
  } catch (err) {
    console.error("Error reading stations from MySQL:", err.message);
  }
  return stationCatalog.map((station) => ({
    ...station,
    deliveryAvailable: station.delivery,
    deliveryFee: station.delivery ? 15 : 0,
    // The built-in catalog is the app's local/demo source of truth when MySQL
    // is not configured. Keep these listed stations orderable in that mode.
    status: "open",
    isAvailable: true,
  }));
}

export function calculatePrice(stationId, gallons, catalog = stationCatalog) {
  const station = catalog.find((item) => item.id === stationId);
  const quantity = Number(gallons);
  const unitPrice = Number(station?.pricePerGallon);
  if (
    !station ||
    (station.status !== undefined && !isStationAvailable(station.status)) ||
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > 100 ||
    !Number.isFinite(unitPrice) ||
    unitPrice <= 0
  ) return null;
  const discountRate = quantity >= 8 ? 0.15 : quantity >= 5 ? 0.1 : 0;
  const subtotal = unitPrice * quantity;
  const discount = Math.round(subtotal * discountRate * 100) / 100;
  return {
    station,
    gallons: quantity,
    unitPrice,
    subtotal,
    discountRate,
    discount,
    total: subtotal - discount,
  };
}

export async function createOrder(user, details = {}) {
  const stations = await getStationCatalog();
  const itemInput = Array.isArray(details.items)
    ? details.items
    : Array.isArray(details.containers)
      ? details.containers
      : null;
  let gallons = Number(details.gallons);
  let orderItems;

  if (itemInput) {
    if (itemInput.length === 0) return { error: "Add at least one item to the order." };
    orderItems = [];
    for (const item of itemInput) {
      const type = String(item?.type || "5-gal-slim");
      const count = Number(item?.count ?? item?.qty);
      if (!["5-gal-slim", "5-gal-round"].includes(type) || !Number.isInteger(count) || count < 1 || count > 100) {
        return { error: "Each order item needs a valid container and quantity." };
      }
      orderItems.push({ type, count });
    }
    gallons = orderItems.reduce((sum, item) => sum + item.count, 0);
  } else {
    if (!Number.isInteger(gallons) || gallons < 1 || gallons > 100) {
      return { error: "Choose a station and between 1 and 100 gallons." };
    }
    orderItems = [{ type: "5-gal-slim", count: gallons }];
  }

  if (gallons > 100) return { error: "Choose between 1 and 100 gallons." };
  if (details.applyPointsVoucher === true) {
    return { error: "AquaPoints vouchers are unavailable because this backend has no customer points balance." };
  }

  const station = stations.find((item) => item.id === details.stationId);
  if (!station) return { error: "Choose an available station." };
  if (!isStationAvailable(station.status)) return { error: "This station is currently closed or unavailable." };

  const pricing = calculatePrice(details.stationId, gallons, stations);
  if (!pricing) return { error: "Choose a station and between 1 and 100 gallons." };
  const fulfillment = details.fulfillment === "delivery" ? "delivery" : "pickup";
  if (fulfillment === "delivery" && !pricing.station.delivery) return { error: "This station does not offer delivery." };

  const hasWizardItems = itemInput !== null;
  const bottleExchange = details.bottleExchange === "new" ? "new" : "swap";
  const depositFee = hasWizardItems && bottleExchange === "new" ? 160 * gallons : 0;
  const deliveryFee = hasWizardItems && fulfillment === "delivery"
    ? Number(pricing.station.deliveryFee ?? 15)
    : 0;
  const discount = pricing.discount;
  const total = Math.max(
    0,
    pricing.subtotal - discount + depositFee + deliveryFee
  );
  const itemLabels = {
    "5-gal-slim": "5-Gallon Slim",
    "5-gal-round": "5-Gallon Round",
  };
  const items = orderItems.map((item) => ({
    ...item,
    label: itemLabels[item.type],
    unitPrice: pricing.unitPrice,
  }));
  const now = new Date();
  const paymentMethod =
    fulfillment === "pickup" ? "pay_at_counter" : "Cash on Delivery";
  const orders = read(ordersFile, []);
  const nextNum = 2000 + orders.length + 1;
  const orderId = `AT-${String(nextNum).padStart(4, "0")}`;

  const order = {
    id: orderId,
    userId: user.id,
    customerName: user.name || "Customer",
    station: pricing.station,
    stationId: pricing.station.id,
    stationName: pricing.station.name,
    stationAddress: pricing.station.address,
    items,
    containers: items,
    gallons: pricing.gallons,
    gallonsTotal: pricing.gallons,
    fulfillment,
    fulfillmentType: fulfillment,
    deliveryAddress: String(details.deliveryAddress || ""),
    landmark: String(details.landmark || ""),
    notes: String(details.notes || ""),
    paymentMethod,
    paymentStatus: fulfillment === "pickup" ? "unpaid" : "paid",
    bottleExchange,
    depositFee,
    deliveryFee: depositFee + deliveryFee,
    status: "New order",
    unitPrice: pricing.unitPrice,
    subtotal: pricing.subtotal,
    discountRate: pricing.discountRate,
    discount,
    total,
    pointsEarned: gallons * 10,
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
