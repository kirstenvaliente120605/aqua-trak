import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listOrdersForStation } from "./commerceStore.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../");
const dataDir = path.join(root, "data");
const pricingFile = path.join(dataDir, "pricing.json");
const settingsFile = path.join(dataDir, "settings.json");

function readJson(file, fallback) {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify(fallback, null, 2));
    return fallback;
  }
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

export function getOwnerOverview(stationId) {
  const orders = listOrdersForStation(stationId);
  const revenue = orders.reduce((sum, o) => sum + (o.total || 0), 0);
  const today = new Date().toISOString().slice(0, 10);
  const ordersToday = orders.filter(o => o.createdAt?.startsWith(today)).length;
  
  // Unique customers
  const customers = new Set(orders.map(o => o.userId));

  return {
    revenue,
    orderVolume: orders.length,
    ordersToday,
    customerCount: customers.size,
  };
}

export function getStationPricing(stationId) {
  const pricing = readJson(pricingFile, {});
  return pricing[stationId] || {};
}

export function updateStationPricing(stationId, pricingData) {
  const pricing = readJson(pricingFile, {});
  pricing[stationId] = pricingData;
  writeJson(pricingFile, pricing);
  return { success: true };
}

export function getStationSettings(stationId) {
  const settings = readJson(settingsFile, {});
  return settings[stationId] || {
    name: "Unknown Station",
    address: "Unknown Address",
    hours: "Not set",
    contact: "Not set"
  };
}

export function updateStationSettings(stationId, settingsData) {
  const settings = readJson(settingsFile, {});
  settings[stationId] = { ...settings[stationId], ...settingsData };
  writeJson(settingsFile, settings);
  return { success: true };
}

export function getStationCustomers(stationId) {
  const orders = listOrdersForStation(stationId);
  const customerMap = {};
  
  orders.forEach(o => {
    if (!customerMap[o.userId]) {
      customerMap[o.userId] = {
        id: o.userId,
        name: o.customerName,
        totalSpent: 0,
        orderCount: 0,
        lastOrder: o.createdAt
      };
    }
    customerMap[o.userId].totalSpent += o.total;
    customerMap[o.userId].orderCount += 1;
    if (new Date(o.createdAt) > new Date(customerMap[o.userId].lastOrder)) {
      customerMap[o.userId].lastOrder = o.createdAt;
    }
  });
  
  return Object.values(customerMap);
}
