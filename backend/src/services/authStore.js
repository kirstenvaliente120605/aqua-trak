import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../");
const dataDir = path.join(root, "data");
const usersFile = path.join(dataDir, "users.json");
const sessionsFile = path.join(dataDir, "sessions.json");
const sessionTtlMs = Number(process.env.SESSION_TTL_MS) || 1000 * 60 * 60 * 24 * 7;

const demoUsers = [
  { email: "customer.demo@example.com", password: "CustomerDemo123!", name: "Customer Demo", role: "customer", subtitle: "Customer account", status: "active" },
  { email: "owner.demo@example.com", password: "OwnerDemo123!", name: "Owner Demo", role: "owner", subtitle: "ClearSpring Water Hub", station: "ClearSpring Water Hub", status: "active" },
  { email: "staff.demo@example.com", password: "StaffDemo123!", name: "Staff Demo", role: "staff", subtitle: "Station staff", station: "ClearSpring Water Hub", stationId: "drink-refill", permissions: ["orders", "inventory", "requests"], status: "active" },
];

function ensureStore() {
  fs.mkdirSync(dataDir, { recursive: true });
  const users = fs.existsSync(usersFile) ? readJsonFile(usersFile, []) : [];
  let changed = false;
  for (const demo of demoUsers) {
    const existing = users.find((user) => user.email === demo.email);
    if (!existing) {
      users.push(toStoredUser(demo));
      changed = true;
      continue;
    }
    const expectedSubtitle = demo.subtitle;
    if (existing.role !== demo.role || existing.name !== demo.name || existing.subtitle !== expectedSubtitle || existing.station !== (demo.station || "") || existing.stationId !== (demo.stationId || "") || !Array.isArray(existing.permissions) || existing.status !== "active") {
      Object.assign(existing, { name: demo.name, role: demo.role, subtitle: expectedSubtitle, station: demo.station || "", stationId: demo.stationId || existing.stationId || "", permissions: demo.permissions || existing.permissions || [], status: "active" });
      changed = true;
    }
    if (!verifyPassword(demo.password, existing.passwordHash)) {
      existing.passwordHash = hashPassword(demo.password);
      changed = true;
    }
  }
  if (changed || !fs.existsSync(usersFile)) writeJson(usersFile, users);
  if (!fs.existsSync(sessionsFile)) writeJson(sessionsFile, {});
}

function readJsonFile(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    console.error(`Unable to read ${file}:`, error);
    return fallback;
  }
}

function readJson(file, fallback) {
  ensureStore();
  return readJsonFile(file, fallback);
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString("hex")}`;
}

function verifyPassword(password, stored) {
  const [salt, digest] = String(stored).split(":");
  if (!salt || !digest) return false;
  try {
    const actual = crypto.scryptSync(password, salt, 64).toString("hex");
    const expected = Buffer.from(digest, "hex");
    const actualBuffer = Buffer.from(actual, "hex");
    return expected.length === actualBuffer.length && crypto.timingSafeEqual(actualBuffer, expected);
  } catch {
    return false;
  }
}

function toStoredUser(user) {
  return {
    id: crypto.randomUUID(),
    email: user.email.toLowerCase(),
    passwordHash: hashPassword(user.password),
    name: user.name,
    role: user.role,
    subtitle: user.subtitle,
    station: user.station || "",
    stationId: user.stationId || "",
    permissions: user.permissions || (user.role === "staff" ? ["orders", "inventory", "requests"] : []),
    phone: user.phone || "",
    location: user.location || "",
    status: user.status || "active",
    createdAt: new Date().toISOString(),
  };
}

export function listUsers() {
  return readJson(usersFile, []).map(({ passwordHash, ...user }) => user);
}

export function listStaffApprovals(station) {
  const normalizedStation = String(station || "").trim().toLowerCase();
  return listUsers().filter((user) => user.role === "staff" && user.status === "pending" && user.station.toLowerCase() === normalizedStation);
}

export function updateStaffApproval(id, station, decision) {
  ensureStore();
  const users = readJson(usersFile, []);
  const user = users.find((candidate) => candidate.id === id);
  const normalizedStation = String(station || "").trim().toLowerCase();
  if (!user || user.role !== "staff" || user.status !== "pending" || user.station.toLowerCase() !== normalizedStation) return null;
  if (!["approve", "reject"].includes(decision)) return null;
  user.status = decision === "approve" ? "active" : "rejected";
  user.reviewedAt = new Date().toISOString();
  writeJson(usersFile, users);
  return { ...user, passwordHash: undefined };
}

export function findUserByEmail(email) {
  const normalized = String(email || "").trim().toLowerCase();
  return readJson(usersFile, []).find((user) => user.email === normalized) || null;
}

export function createUser({ email, password, name, role, station = "" }) {
  ensureStore();
  const users = readJson(usersFile, []);
  const normalized = String(email || "").trim().toLowerCase();
  const trimmedName = String(name || "").trim();
  const trimmedStation = String(station || "").trim();
  if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return { error: "Please enter a valid email address." };
  }
  if (!password || String(password).length < 8) {
    return { error: "Password must be at least 8 characters." };
  }
  if (!trimmedName || trimmedName.length > 100 || !["customer", "owner", "staff"].includes(role)) {
    return { error: "Please complete all required fields." };
  }
  if (findUserByEmail(normalized)) return { error: "An account with that email already exists." };
  if (role !== "customer" && !trimmedStation) return { error: "Station name is required for this role." };
  const user = toStoredUser({ email: normalized, password, name: trimmedName, role, station: trimmedStation, stationId: role === "staff" ? "drink-refill" : "", status: role === "staff" ? "pending" : "active", subtitle: role === "owner" ? trimmedStation || "Station owner" : role === "staff" ? "Station staff" : "Customer account" });
  users.push(user);
  writeJson(usersFile, users);
  return { user };
}

export function updateUserProfile(id, changes) {
  ensureStore();
  const users = readJson(usersFile, []);
  const user = users.find((candidate) => candidate.id === id);
  if (!user) return null;
  const name = String(changes.name || "").trim();
  const email = String(changes.email || "").trim().toLowerCase();
  if (!name || name.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid name and email address." };
  const duplicate = users.find((candidate) => candidate.id !== id && candidate.email === email);
  if (duplicate) return { error: "That email address is already in use." };
  Object.assign(user, { name, email, phone: String(changes.phone || "").trim().slice(0, 40), location: String(changes.location || "").trim().slice(0, 120) });
  writeJson(usersFile, users);
  const { passwordHash, ...safeUser } = user;
  return safeUser;
}

export function authenticate(email, password) {
  const user = findUserByEmail(email);
  if (!user || user.status !== "active" || !verifyPassword(password, user.passwordHash)) return null;
  return user;
}

export function createSession(user) {
  const sessions = readJson(sessionsFile, {});
  const token = crypto.randomBytes(32).toString("hex");
  sessions[token] = { userId: user.id, expiresAt: Date.now() + sessionTtlMs };
  writeJson(sessionsFile, sessions);
  return token;
}

export function getSessionUser(token) {
  if (!token) return null;
  const sessions = readJson(sessionsFile, {});
  const session = sessions[token];
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    delete sessions[token];
    writeJson(sessionsFile, sessions);
    return null;
  }
  return readJson(usersFile, []).find((user) => user.id === session.userId) || null;
}

export function destroySession(token) {
  const sessions = readJson(sessionsFile, {});
  if (token && sessions[token]) {
    delete sessions[token];
    writeJson(sessionsFile, sessions);
  }
}

ensureStore();
