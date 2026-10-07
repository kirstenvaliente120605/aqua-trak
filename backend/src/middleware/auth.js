import { getSessionUser } from "../services/authStore.js";

export const sessionCookie = "aquatracker_session";

export function parseCookies(header = "") {
  return Object.fromEntries(header.split(";").map((part) => {
    const index = part.indexOf("=");
    const key = (index === -1 ? part : part.slice(0, index)).trim();
    if (!key) return [];
    const value = index === -1 ? "" : part.slice(index + 1).trim();
    try {
      return [key, decodeURIComponent(value)];
    } catch {
      return [key, ""];
    }
  }).filter((entry) => entry.length));
}

export function attachUser(req, _res, next) {
  req.user = getSessionUser(parseCookies(req.headers.cookie || "")[sessionCookie]);
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.redirect(`/auth/${req.params.role || "customer"}/login?error=required`);
  if (req.params.role && req.user.role !== req.params.role) return res.redirect(`/dashboard/${req.user.role}`);
  next();
}

export function setSessionCookie(res, token) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${sessionCookie}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${secure}`);
}

export function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${sessionCookie}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}
