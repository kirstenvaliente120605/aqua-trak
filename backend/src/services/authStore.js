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
const DEFAULT_STAFF_PERMISSIONS = ["orders", "inventory", "requests"];
const ALLOWED_PERMISSIONS = new Set(DEFAULT_STAFF_PERMISSIONS);
const USER_SELECT = `
  SELECT u.id, u.email, u.role, u.full_name, u.subtitle, s.name AS station,
         u.station_id, u.permissions, u.status, u.email_verified, u.auth_version,
         u.created_at
  FROM users u
  LEFT JOIN stations s ON s.id = u.station_id`;
const USER_SELECT_WITH_PASSWORD = USER_SELECT.replace(
  "u.created_at",
  "u.created_at, u.password_hash AS passwordHash"
);

export const demoUsers = [
  { email: "customer.demo@example.com", password: "CustomerDemo123!", name: "Customer Demo", role: "customer", subtitle: "Customer account", status: "active" },
  { email: "owner.demo@example.com", password: "OwnerDemo123!", name: "Owner Demo", role: "owner", subtitle: "Station owner", stationId: "drink-refill", status: "active" },
  { email: "staff.demo@example.com", password: "StaffDemo123!", name: "Staff Demo", role: "staff", subtitle: "Station staff", stationId: "drink-refill", permissions: DEFAULT_STAFF_PERMISSIONS, status: "active" },
];

export function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString("hex")}`;
}

export function verifyPassword(password, stored) {
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

function parsePermissions(value, role) {
  const fallback = role === "staff" ? DEFAULT_STAFF_PERMISSIONS : [];
  if (!value) return [...fallback];
  if (Array.isArray(value)) {
    return [...new Set(value.filter((permission) => ALLOWED_PERMISSIONS.has(permission)))];
  }
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? [...new Set(parsed.filter((permission) => ALLOWED_PERMISSIONS.has(permission)))]
      : [...fallback];
  } catch {
    return [...fallback];
  }
}

function rowToUser(u) {
  if (!u) return null;
  const user = {
    id: u.id,
    email: u.email,
    role: u.role,
    name: u.full_name || "",
    subtitle: u.subtitle || "",
    station: u.station || "",
    stationId: u.station_id || "",
    permissions: parsePermissions(u.permissions, u.role),
    status: u.status || "active",
    emailVerified: u.email_verified === undefined ? true : Boolean(Number(u.email_verified)),
  };
  if (u.passwordHash || u.password_hash) {
    user.passwordHash = u.passwordHash || u.password_hash;
  }
  return user;
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
          "INSERT INTO users (id, email, password_hash, role, full_name, subtitle, station_id, permissions, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [id, demo.email.toLowerCase(), hash, demo.role, demo.name, demo.subtitle || "", demo.stationId || null, perms, "active"]
        );
      } else {
        await pool.execute(
          "UPDATE users SET password_hash = ?, status = 'active', full_name = ?, station_id = COALESCE(station_id, ?) WHERE email = ?",
          [hash, demo.name, demo.stationId || null, demo.email.toLowerCase()]
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
  const [rows] = await pool.execute(`${USER_SELECT} ORDER BY u.email`);
  return rows.map(rowToUser);
}

export async function listStaffApprovals(stationId) {
  const normalizedStationId = String(stationId || "").trim();
  if (!normalizedStationId) return [];
  const [rows] = await pool.execute(
    `${USER_SELECT}
     WHERE u.role = 'staff' AND u.status = 'pending' AND u.station_id = ?`,
    [normalizedStationId]
  );
  return rows.map(rowToUser);
}

export async function updateStaffApproval(id, stationId, decision) {
  if (!["approve", "reject"].includes(decision)) return null;
  const normalizedStationId = String(stationId || "").trim();
  if (!normalizedStationId) return null;
  const status = decision === "approve" ? "active" : "rejected";
  const [result] = await pool.execute(
    "UPDATE users SET status = ? WHERE id = ? AND role = 'staff' AND status = 'pending' AND station_id = ?",
    [status, id, normalizedStationId]
  );
  if (result.affectedRows === 0) return null;
  const [rows] = await pool.execute(`${USER_SELECT} WHERE u.id = ?`, [id]);
  return rowToUser(rows[0]);
}

export async function findUserByEmail(email) {
  const normalized = String(email || "").trim().toLowerCase();
  const [rows] = await pool.execute(
    `${USER_SELECT_WITH_PASSWORD} WHERE u.email = ?`,
    [normalized]
  );
  return rowToUser(rows[0]);
}

export async function createUser({ email, password, name, role, station = "" }) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return { error: "Please enter a valid email address." };
  if (!password || String(password).length < 8 || String(password).length > 128) return { error: "Password must be between 8 and 128 characters." };
  const trimmedName = String(name || "").trim();
  if (!trimmedName || trimmedName.length > 100 || !["customer", "owner", "staff"].includes(role)) return { error: "Please complete all required fields." };
  const existing = await findUserByEmail(normalized);
  if (existing) return { error: "An account with that email already exists." };

  let stationId = null;
  let stationName = "";
  if (role === "owner") {
    const stationNameInput = String(station || "").trim();
    if (!stationNameInput) return { error: "Station name is required for this role." };
    const [stations] = await pool.execute(
      "SELECT id, name FROM stations WHERE LOWER(name) = LOWER(?) LIMIT 1",
      [stationNameInput]
    );
    if (!stations[0]) return { error: "Choose a station that exists in the station catalogue." };
    stationId = stations[0].id;
    stationName = stations[0].name;
  } else if (role === "staff") {
    stationId = "drink-refill";
    const [stations] = await pool.execute(
      "SELECT id, name FROM stations WHERE id = ? LIMIT 1",
      [stationId]
    );
    if (!stations[0]) return { error: "The assigned station is unavailable. Contact the station owner." };
    stationName = stations[0].name;
  }

  const id = crypto.randomUUID();
  const hash = hashPassword(password);
  const subtitle = role === "owner" ? stationName : (role === "staff" ? "Station staff" : "Customer account");
  const permissions = role === "staff" ? JSON.stringify(["orders", "inventory", "requests"]) : null;
  const status = role === "staff" ? "pending" : "active";

  await pool.execute(
    "INSERT INTO users (id, email, password_hash, role, full_name, subtitle, station_id, permissions, status, email_verified, auth_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1)",
    [id, normalized, hash, role, trimmedName, subtitle, stationId, permissions, status]
  );

  const [rows] = await pool.execute(`${USER_SELECT} WHERE u.id = ?`, [id]);
  return { user: rowToUser(rows[0]) };
}

export async function updateUserProfile(id, changes) {
  const name = String(changes.name || "").trim();
  const email = String(changes.email || "").trim().toLowerCase();
  if (!name || name.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid name and email address." };
  const [accountRows] = await pool.execute("SELECT email FROM users WHERE id = ?", [id]);
  if (!accountRows[0]) return null;
  const [dup] = await pool.execute("SELECT id FROM users WHERE email = ? AND id != ?", [email, id]);
  if (dup.length) return { error: "That email address is already in use." };
  const emailChanged = String(accountRows[0].email).toLowerCase() !== email;
  await pool.execute(
    "UPDATE users SET full_name = ?, email = ?, email_verified = ?, auth_version = auth_version + ? WHERE id = ?",
    [name, email, emailChanged ? 0 : 1, emailChanged ? 1 : 0, id]
  );
  if (emailChanged) await pool.execute("DELETE FROM sessions WHERE user_id = ?", [id]);
  const [rows] = await pool.execute(`${USER_SELECT} WHERE u.id = ?`, [id]);
  return rowToUser(rows[0]);
}

export async function authenticate(email, password) {
  const user = await checkCredentials(email, password);
  if (!user || user.status !== "active" || !user.emailVerified) return null;
  return user;
}

export async function checkCredentials(email, password) {
  const user = await findUserByEmail(email);
  if (!user || !verifyPassword(password, user.passwordHash)) return null;
  return user;
}

export async function createSession(user) {
  if (!user || !user.id || !user.emailVerified) return null;
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
  const [users] = await pool.execute(`${USER_SELECT} WHERE u.id = ?`, [session.user_id]);
  const user = rowToUser(users[0]);
  return user?.emailVerified ? user : null;
}

export async function destroySession(token) {
  if (!token) return;
  await pool.execute("DELETE FROM sessions WHERE token = ?", [token]);
}

export { pool };
