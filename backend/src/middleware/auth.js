import { getSessionUser } from "../services/authStore.js";

export const sessionCookie = "aquatracker_session";

export function parseCookies(header = "") {
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => {
        const index = part.indexOf("=");
        const key = (index === -1 ? part : part.slice(0, index)).trim();
        if (!key) return [];
        const value = index === -1 ? "" : part.slice(index + 1).trim();
        try {
          return [key, decodeURIComponent(value)];
        } catch {
          return [key, ""];
        }
      })
      .filter((entry) => entry.length)
  );
}

export async function attachUser(req, _res, next) {
  try {
    const cookies = parseCookies(req.headers.cookie || "");
    const token = cookies[sessionCookie];
    req.user = token ? await getSessionUser(token) : null;
  } catch (err) {
    console.error("attachUser error:", err.message);
    req.user = null;
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) {
    if (req.path.startsWith("/api")) {
      return res.status(401).json({ error: "Authentication required." });
    }
    return res.redirect(`/auth/${req.params.role || "customer"}/login?error=required`);
  }
  if (req.params.role && req.user.role !== req.params.role) {
    if (req.path.startsWith("/api")) {
      return res.status(403).json({ error: "Access denied for this role." });
    }
    return res.redirect(`/dashboard/${req.user.role}`);
  }
  next();
}

export function setSessionCookie(res, token) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${sessionCookie}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${secure}`
  );
}

export function clearSessionCookie(res) {
  res.setHeader(
    "Set-Cookie",
    `${sessionCookie}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  );
}
