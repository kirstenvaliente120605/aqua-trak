import crypto from "node:crypto";
import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASS || "",
  database: process.env.DB_NAME || "aquatracker",
  waitForConnections: true,
  connectionLimit: 10,
});

const sessionTtlMs = Number(process.env.SESSION_TTL_MS) || 1000 * 60 * 60 * 24 * 7;

export const demoUsers = [
  { email: "customer.demo@example.com", password: "CustomerDemo123!", name: "Customer Demo", role: "customer", subtitle: "Customer account", status: "active" },
  { email: "owner.demo@example.com", password: "OwnerDemo123!", name: "Owner Demo", role: "owner", subtitle: "ClearSpring Water Hub", station: "ClearSpring Water Hub", status: "active" },
  { email: "staff.demo@example.com", password: "StaffDemo123!", name: "Staff Demo", role: "staff", subtitle: "Station staff", station: "ClearSpring Water Hub", stationId: "drink-refill", permissions: ["orders", "inventory", "requests"], status: "active" },
];

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

function safeJsonParse(value, fallback = []) {
  if (!value) return fallback;
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function rowToUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    name: u.name || u.full_name || "",
    subtitle: u.subtitle || "",
    station: u.station || "",
    stationId: u.station_id || "",
    permissions: safeJsonParse(u.permissions, u.role === "staff" ? ["orders", "inventory", "requests"] : []),
    phone: u.phone || "",
    location: u.location || "",
    status: u.status || "active",
    passwordHash: u.passwordHash || u.password_hash,
  };
}

export async function ensureDemoUsers() {
  try {
    for (const demo of demoUsers) {
      const existing = await findUserByEmail(demo.email);
      const hash = hashPassword(demo.password);
      const perms = demo.permissions ? JSON.stringify(demo.permissions) : null;
      if (!existing) {
        const id = crypto.randomUUID();
        await pool.execute(
          "INSERT INTO user (id, email, password_hash, role, full_name, name, subtitle, station, station_id, permissions, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [id, demo.email.toLowerCase(), hash, demo.role, demo.name, demo.name, demo.subtitle || "", demo.station || "", demo.stationId || "", perms, "active"]
        );
      } else {
        await pool.execute(
          "UPDATE users SET password_hash = ?, status = 'active', full_name = ?, name = ? WHERE email = ?",
          [hash, demo.name, demo.name, demo.email.toLowerCase()]
        );
      }
    }
  } catch (err) {
    console.error("Failed to seed demo users in MySQL:", err.message);
  }
}

// Auto-seed on load
ensureDemoUsers();

export async function listUsers() {
  const [rows] = await pool.execute("SELECT id, email, role, full_name, name, subtitle, station, station_id, permissions, phone, location, status FROM user");
  return rows.map(rowToUser);
}

export async function listStaffApprovals(station) {
  const normalizedStation = String(station || "").trim();
  const query = normalizedStation
    ? "SELECT id, email, role, full_name, name, subtitle, station, station_id, permissions, status FROM user WHERE role = 'staff' AND status = 'pending' AND station = ?"
    : "SELECT id, email, role, full_name, name, subtitle, station, station_id, permissions, status FROM user WHERE role = 'staff' AND status = 'pending'";
  const params = normalizedStation ? [normalizedStation] : [];
  const [rows] = await pool.execute(query, params);
  return rows.map(rowToUser);
}

export async function updateStaffApproval(id, station, decision) {
  if (!["approve", "reject"].includes(decision)) return null;
  const status = decision === "approve" ? "active" : "rejected";
  const normalizedStation = String(station || "").trim();
  const query = normalizedStation
    ? "UPDATE users SET status = ? WHERE id = ? AND role = 'staff' AND status = 'pending' AND station = ?"
    : "UPDATE users SET status = ? WHERE id = ? AND role = 'staff' AND status = 'pending'";
  const params = normalizedStation ? [status, id, normalizedStation] : [status, id];
  const [result] = await pool.execute(query, params);
  if (result.affectedRows === 0) return null;
  const [rows] = await pool.execute("SELECT id, email, role, full_name, name, subtitle, station, station_id, permissions, status FROM user WHERE id = ?", [id]);
  return rowToUser(rows[0]);
}

export async function findUserByEmail(email) {
  const normalized = String(email || "").trim().toLowerCase();
  const [rows] = await pool.execute(
    "SELECT id, email, role, full_name, name, subtitle, station, station_id, permissions, status, phone, location, password_hash as passwordHash FROM user WHERE email = ?",
    [normalized]
  );
  return rowToUser(rows[0]);
}

export async function createUser({ email, password, name, role, station = "" }) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return { error: "Please enter a valid email address." };
  if (!password || String(password).length < 8) return { error: "Password must be at least 8 characters." };
  const trimmedName = String(name || "").trim();
  if (!trimmedName || trimmedName.length > 100 || !["customer", "owner", "staff"].includes(role)) return { error: "Please complete all required fields." };
  const existing = await findUserByEmail(normalized);
  if (existing) return { error: "An account with that email already exists." };

  const id = crypto.randomUUID();
  const hash = hashPassword(password);
  const stationTrim = String(station || "").trim();
  const subtitle = role === "owner" ? stationTrim : (role === "staff" ? "Station staff" : "Customer account");
  const stationId = role === "staff" ? "drink-refill" : "";
  const permissions = role === "staff" ? JSON.stringify(["orders", "inventory", "requests"]) : null;
  const status = role === "staff" ? "pending" : "active";

  await pool.execute(
    "INSERT INTO user (id, email, password_hash, role, full_name, name, subtitle, station, station_id, permissions, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [id, normalized, hash, role, trimmedName, trimmedName, subtitle, stationTrim, stationId, permissions, status]
  );

  const [rows] = await pool.execute(
    "SELECT id, email, role, full_name, name, subtitle, station, station_id, permissions, status FROM user WHERE id = ?",
    [id]
  );
  return { user: rowToUser(rows[0]) };
}

export async function updateUserProfile(id, changes) {
  const name = String(changes.name || "").trim();
  const email = String(changes.email || "").trim().toLowerCase();
  if (!name || name.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid name and email address." };
  const [dup] = await pool.execute("SELECT id FROM user WHERE email = ? AND id != ?", [email, id]);
  if (dup.length) return { error: "That email address is already in use." };
  await pool.execute(
    "UPDATE users SET full_name = ?, name = ?, email = ?, phone = ?, location = ? WHERE id = ?",
    [name, name, email, String(changes.phone || "").trim().slice(0, 40), String(changes.location || "").trim().slice(0, 120), id]
  );
  const [rows] = await pool.execute("SELECT id, email, role, full_name, name, subtitle, station, station_id, permissions, phone, location, status FROM user WHERE id = ?", [id]);
  return rowToUser(rows[0]);
}

export async function authenticate(email, password) {
  const user = await findUserByEmail(email);
  if (!user || user.status !== "active" || !verifyPassword(password, user.passwordHash)) return null;
  return user;
}

export async function createSession(user) {
  if (!user || !user.id) return null;
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + sessionTtlMs);
  await pool.execute("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)", [token, user.id, expiresAt]);
  return token;
}

export async function getSessionUser(token) {
  if (!token) return null;
  const [rows] = await pool.execute("SELECT token, user_id, expires_at FROM sessions WHERE token = ?", [token]);
  const session = rows[0];
  if (!session) return null;
  if (new Date(session.expires_at) <= new Date()) {
    await pool.execute("DELETE FROM sessions WHERE token = ?", [token]);
    return null;
  }
  const [users] = await pool.execute(
    "SELECT id, email, role, full_name, name, subtitle, station, station_id, permissions, status, phone, location FROM user WHERE id = ?",
    [session.user_id]
  );
  return rowToUser(users[0]);
}

export async function destroySession(token) {
  if (!token) return;
  await pool.execute("DELETE FROM sessions WHERE token = ?", [token]);
}

export { pool };
