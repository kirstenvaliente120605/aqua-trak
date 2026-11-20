import { Router } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  clearSessionCookie,
  parseCookies,
  requireAuth,
  sessionCookie,
  setSessionCookie,
} from "../middleware/auth.js";
import {
  authenticate,
  checkCredentials,
  createSession,
  createUser,
  destroySession,
  findUserByEmail,
  listStaffApprovals,
  updateStaffApproval,
  updateUserProfile,
} from "../services/authStore.js";
import {
  issueOtp,
  useResetToken,
  verifyEmailAddress,
  verifyOtp,
} from "../services/otpService.js";
import {
  cancelSubscription,
  createOrder,
  createSubscription,
  getStationCatalog,
  listOrders,
  listOrdersForStation,
  listSubscriptions,
} from "../services/commerceStore.js";
import {
  getStaffOverview,
  getStaffStation,
  listCustomerRequests,
  listInventory,
  listNotifications,
  listShifts,
  listStaffOrders,
  orderStatuses,
  reportInventory,
  updateAttendance,
  updateCustomerRequest,
  updateStaffOrder,
} from "../services/staffStore.js";
import {
  getOwnerOverview,
  getStationPricing,
  updateStationPricing,
  getStationSettings,
  updateStationSettings,
  getStationCustomers,
} from "../services/ownerStore.js";

export const router = Router();
const root = path.dirname(fileURLToPath(import.meta.url));
const frontendPages = path.resolve(root, "../../../frontend/pages");

const roles = new Set(["customer", "owner", "staff"]);
const validEmail = email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
const otpError = (res, code) => {
  const [status, message] = {
    OTP_COOLDOWN: [429, "Please wait before requesting another code."],
    OTP_RATE_LIMITED: [429, "Too many requests. Please try again later."],
    OTP_EXPIRED: [400, "This code has expired. Request a new code."],
    OTP_TOO_MANY_ATTEMPTS: [429, "Too many incorrect attempts. Request a new code."],
    OTP_DELIVERY_FAILED: [503, "We could not send a code right now. Please try again later."],
  }[code] || [400, "That code is incorrect or no longer valid."];
  return res.status(status).json({ error: message, code });
};
const sections = {
  customer: new Set([
    "find-stations",
    "order-water",
    "my-subscriptions",
    "orders-history",
    "rewards",
    "profile",
  ]),
  owner: new Set([
    "orders",
    "subscriptions",
    "customers",
    "staff-approvals",
    "promotions",
    "pricing",
    "station-settings",
    "profile",
  ]),
  staff: new Set([
    "my-shifts",
    "station-orders",
    "inventory",
    "customer-requests",
    "profile",
  ]),
};

const sendPage =
  (file, status = 200) =>
  (_req, res) => {
    res.status(status).sendFile(path.resolve(frontendPages, file));
  };

router.get("/", sendPage("index.html"));
router.get("/client/index.html", (_req, res) => res.redirect("/"));

// Universal logout handler (GET and POST)
const handleLogout = async (req, res) => {
  const token = parseCookies(req.headers.cookie || "")[sessionCookie];
  if (token) {
    await destroySession(token);
  }
  clearSessionCookie(res);
  if (req.headers.accept?.includes("application/json")) {
    return res.json({ success: true, message: "Logged out successfully" });
  }
  return res.redirect("/");
};
router.get("/auth/logout", handleLogout);
router.post("/auth/logout", handleLogout);

// AJAX JSON login endpoint
router.post("/auth/login", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const { role } = req.body;
  if (!validEmail(email) || !password) {
    return res.status(400).json({ error: "Enter a valid email address and password.", code: "INVALID_INPUT" });
  }
  const candidate = await checkCredentials(email, password);
  if (!candidate) {
    return res.status(401).json({ error: "Invalid email or password." });
  }
  if (role && !roles.has(role)) {
    return res.status(400).json({ error: "Choose a valid account role.", code: "INVALID_INPUT" });
  }
  if (role && candidate.role !== role) {
    return res.status(403).json({ error: `Account is registered as ${candidate.role}, not ${role}.` });
  }
  if (!candidate.emailVerified) {
    return res.status(403).json({ error: "Verify your email address before signing in.", code: "EMAIL_NOT_VERIFIED" });
  }
  if (candidate.status !== "active") {
    return res.status(403).json({ error: "Your staff account is waiting for owner approval.", code: "STAFF_PENDING" });
  }
  const user = await authenticate(email, password);
  const token = await createSession(user);
  setSessionCookie(res, token);
  return res.json({
    success: true,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      subtitle: user.subtitle,
      station: user.station,
      stationId: user.stationId,
      permissions: user.permissions,
      emailVerified: user.emailVerified,
    },
    redirectUrl: `/dashboard/${user.role}`,
  });
});

router.post("/auth/signup", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const role = String(req.body.role || "customer");
  if (!validEmail(email) || !roles.has(role)) {
    return res.status(400).json({ error: "Enter a valid email and account type.", code: "INVALID_INPUT" });
  }
  if (password.length < 8 || password.length > 128) {
    return res.status(400).json({ error: "Password must be between 8 and 128 characters.", code: "INVALID_INPUT" });
  }
  if (req.body.confirmPassword !== undefined && password !== String(req.body.confirmPassword)) {
    return res.status(400).json({ error: "Passwords must match.", code: "INVALID_INPUT" });
  }
  let created;
  try {
    created = await createUser({
      email,
      password,
      name: req.body.name,
      role,
      station: role === "owner" ? req.body.station : "",
    });
  } catch (error) {
    console.error("Account registration failed:", error);
    return res.status(500).json({
      error: "Account creation could not be completed. Check the server database setup and try again.",
      code: "SIGNUP_FAILED",
    });
  }
  if (created.error) return res.status(400).json({ error: created.error, code: "SIGNUP_INVALID" });
  let result;
  try {
    result = await issueOtp(email, created.user.id, "verify_email", req.ip);
  } catch (error) {
    console.error("Account created but verification setup failed:", error);
    return res.status(503).json({
      error: "Your account was created, but verification could not be started. Please try again later.",
      code: "OTP_DELIVERY_FAILED",
      email,
    });
  }
  if (!result.ok) {
    return res.status(result.code === "OTP_RATE_LIMITED" ? 429 : 503).json({
      error: result.code === "OTP_RATE_LIMITED"
        ? "Too many verification requests. Please try again later."
        : "Your account was created, but we could not send a code. Please try again later.",
      code: result.code,
      email,
    });
  }
  return res.status(201).json({ ok: true, message: "A verification code has been sent to your email.", email });
});

router.post("/auth/verify-email", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const otp = String(req.body.otp || "");
  if (!validEmail(email) || !/^\d{6}$/.test(otp)) {
    return res.status(400).json({ error: "Enter a valid email and six-digit code.", code: "INVALID_INPUT" });
  }
  const result = await verifyOtp(email, otp, "verify_email", req.ip);
  if (!result.ok) return otpError(res, result.code);
  const user = await verifyEmailAddress(result.userId);
  if (!user || user.email !== email) {
    return res.status(400).json({ error: "This verification code is no longer valid.", code: "OTP_INVALID" });
  }
  const { passwordHash, ...publicUser } = user;
  if (user.status !== "active") {
    return res.json({
      success: true,
      user: publicUser,
      notice: "Your staff account is waiting for owner approval.",
      redirectUrl: "/auth/staff/login?notice=staff-pending",
    });
  }
  const token = await createSession(user);
  setSessionCookie(res, token);
  return res.json({ success: true, user: publicUser, redirectUrl: `/dashboard/${user.role}` });
});

router.post("/auth/resend-otp", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const purpose = String(req.body.purpose || "");
  if (!validEmail(email) || !["verify_email", "reset_password"].includes(purpose)) {
    return res.status(400).json({ error: "Enter a valid email and code purpose.", code: "INVALID_INPUT" });
  }
  const user = await findUserByEmail(email);
  const canSend = user && !(purpose === "verify_email" && user.emailVerified);
  await issueOtp(email, canSend ? user.id : null, purpose, req.ip);
  return res.json({ ok: true, message: "If the account can receive a code, one will be sent shortly." });
});

router.post("/auth/forgot-password", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  if (!validEmail(email)) {
    return res.status(400).json({ error: "Enter a valid email address.", code: "INVALID_INPUT" });
  }
  const user = await findUserByEmail(email);
  await issueOtp(email, user?.id || null, "reset_password", req.ip);
  return res.json({ ok: true, message: "If an account exists for that email, a reset code will be sent shortly." });
});

router.post("/auth/verify-reset-otp", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const otp = String(req.body.otp || "");
  if (!validEmail(email) || !/^\d{6}$/.test(otp)) {
    return res.status(400).json({ error: "Enter a valid email and six-digit code.", code: "INVALID_INPUT" });
  }
  const result = await verifyOtp(email, otp, "reset_password", req.ip);
  if (!result.ok) return otpError(res, result.code);
  return res.json({ ok: true, resetToken: result.resetToken });
});

router.post("/auth/reset-password", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const resetToken = String(req.body.resetToken || "");
  const newPassword = String(req.body.newPassword || "");
  if (!validEmail(email) || !/^[a-f0-9]{64}$/i.test(resetToken)) {
    return res.status(400).json({ error: "The password reset session is invalid. Request a new code.", code: "RESET_TOKEN_INVALID" });
  }
  if (newPassword.length < 8 || newPassword.length > 128) {
    return res.status(400).json({ error: "Password must be between 8 and 128 characters.", code: "INVALID_INPUT" });
  }
  const reset = await useResetToken(email, resetToken, newPassword);
  if (!reset) {
    return res.status(400).json({ error: "The password reset session expired or was already used. Request a new code.", code: "RESET_TOKEN_INVALID" });
  }
  return res.json({ ok: true, message: "Your password has been reset. Sign in with your new password." });
});

router.get("/api/auth/me", (req, res) => {
  if (!req.user) return res.status(401).json({ authenticated: false });
  const { passwordHash, ...user } = req.user;
  return res.json({ authenticated: true, user });
});

router.get("/api/staff-approvals", requireAuth, async (req, res) => {
  if (req.user.role !== "owner")
    return res.status(403).json({ error: "Owner access required." });
  const approvals = await listStaffApprovals(req.user.stationId);
  return res.json({ approvals });
});

router.post("/api/staff-approvals/:id", requireAuth, async (req, res) => {
  if (req.user.role !== "owner")
    return res.status(403).json({ error: "Owner access required." });
  const updated = await updateStaffApproval(
    req.params.id,
    req.user.stationId,
    req.body.decision
  );
  if (!updated)
    return res.status(404).json({ error: "Approval request not found." });
  return res.json({ approval: updated });
});

router.get("/api/stations", requireAuth, async (req, res) => {
  if (req.user.role !== "customer")
    return res.status(403).json({ error: "Customer access required." });
  const stations = await getStationCatalog();
  return res.json({ stations });
});

router.get("/api/orders", requireAuth, (req, res) => {
  if (req.user.role !== "customer")
    return res.status(403).json({ error: "Customer access required." });
  return res.json({ orders: listOrders(req.user.id) });
});

router.post("/api/orders", requireAuth, async (req, res) => {
  if (req.user.role !== "customer")
    return res.status(403).json({ error: "Customer access required." });
  const result = await createOrder(req.user, req.body);
  if (result.error) return res.status(400).json({ error: result.error });
  return res.status(201).json(result);
});

router.get("/api/subscriptions", requireAuth, (req, res) => {
  if (req.user.role !== "customer")
    return res.status(403).json({ error: "Customer access required." });
  return res.json({ subscriptions: listSubscriptions(req.user.id) });
});

router.post("/api/subscriptions", requireAuth, (req, res) => {
  if (req.user.role !== "customer")
    return res.status(403).json({ error: "Customer access required." });
  const result = createSubscription(req.user, req.body);
  if (result.error) return res.status(400).json({ error: result.error });
  return res.status(201).json(result);
});

router.post("/api/subscriptions/:id/cancel", requireAuth, (req, res) => {
  if (req.user.role !== "customer")
    return res.status(403).json({ error: "Customer access required." });
  const subscription = cancelSubscription(req.user.id, req.params.id);
  if (!subscription)
    return res.status(404).json({ error: "Subscription not found." });
  return res.json({ subscription });
});

const requireStaff = (req, res, next) =>
  req.user?.role === "staff"
    ? next()
    : res.status(403).json({ error: "Staff access required." });

const requireOwner = (req, res, next) =>
  req.user?.role === "owner"
    ? next()
    : res.status(403).json({ error: "Owner access required." });

router.get("/api/staff/overview", requireAuth, requireStaff, (req, res) =>
  res.json(getStaffOverview(req.user))
);
router.get("/api/staff/orders", requireAuth, requireStaff, (req, res) =>
  res.json({
    stationId: getStaffStation(req.user),
    statuses: orderStatuses,
    orders: listStaffOrders(req.user, req.query),
  })
);
router.get("/api/staff/orders/:id", requireAuth, requireStaff, (req, res) => {
  const order = listStaffOrders(req.user).find(
    item => item.id === req.params.id
  );
  return order
    ? res.json({ order })
    : res
        .status(404)
        .json({ error: "Order not found for your assigned station." });
});
router.patch("/api/staff/orders/:id", requireAuth, requireStaff, (req, res) => {
  const updated = updateStaffOrder(req.user, req.params.id, {
    status: req.body.status,
    internalNote: req.body.internalNote,
  });
  return updated
    ? res.json({ order: updated })
    : res.status(400).json({
        error:
          "Order is not assigned to your station or the update is invalid.",
      });
});
router.get("/api/staff/shifts", requireAuth, requireStaff, (req, res) =>
  res.json({ shifts: listShifts(req.user) })
);
router.post(
  "/api/staff/shifts/:id/attendance",
  requireAuth,
  requireStaff,
  (req, res) => {
    const shift = updateAttendance(req.user, req.params.id, req.body.action);
    return shift
      ? res.json({ shift })
      : res.status(400).json({
          error: "Attendance action is not available for this shift.",
        });
  }
);
router.get("/api/staff/inventory", requireAuth, requireStaff, (req, res) =>
  res.json({ inventory: listInventory(req.user) })
);
router.post(
  "/api/staff/inventory/report",
  requireAuth,
  requireStaff,
  (req, res) => {
    const item = reportInventory(req.user, req.body);
    return item
      ? res.status(201).json({ item })
      : res.status(400).json({
          error: "Inventory item not found for your assigned station.",
        });
  }
);
router.get("/api/staff/requests", requireAuth, requireStaff, (req, res) =>
  res.json({ requests: listCustomerRequests(req.user) })
);
router.patch(
  "/api/staff/requests/:id",
  requireAuth,
  requireStaff,
  (req, res) => {
    const request = updateCustomerRequest(
      req.user,
      req.params.id,
      req.body.status
    );
    return request
      ? res.json({ request })
      : res.status(400).json({ error: "Request update is invalid." });
  }
);
router.get("/api/staff/notifications", requireAuth, requireStaff, (req, res) =>
  res.json({ notifications: listNotifications(req.user) })
);
router.patch("/api/staff/profile", requireAuth, requireStaff, async (req, res) => {
  const result = await updateUserProfile(req.user.id, req.body);
  return result?.error
    ? res.status(400).json(result)
    : result
      ? res.json({ user: result })
      : res.status(404).json({ error: "Staff profile not found." });
});

router.get("/auth/:role/:mode", (req, res) => {
  if (
    !roles.has(req.params.role) ||
    !["login", "register"].includes(req.params.mode)
  )
    return res.redirect("/404");
  return sendPage("auth.html")(req, res);
});

for (const path of ["/auth/verify-email", "/auth/forgot-password", "/auth/reset-otp", "/auth/reset-password"]) {
  router.get(path, sendPage("otp.html"));
}

router.post("/auth/:role/:mode", async (req, res) => {
  if (
    !roles.has(req.params.role) ||
    !["login", "register"].includes(req.params.mode)
  )
    return res.redirect("/404");
  const role = req.params.role;
  if (
    req.body.password !== req.body.confirmPassword &&
    req.params.mode === "register"
  ) {
    return res.redirect(`/auth/${role}/register?error=passwords`);
  }
  if (req.params.mode === "register") {
    const result = await createUser({
      email: req.body.email,
      password: req.body.password,
      name: req.body.name,
      role,
      station: role === "owner" ? req.body.station : "",
    });
    if (result.error)
      return res.redirect(
        `/auth/${role}/register?error=${encodeURIComponent(result.error)}`
      );
    const otp = await issueOtp(result.user.email, result.user.id, "verify_email", req.ip);
    const delivery = !otp.ok ? "&delivery=failed" : "";
    return res.redirect(`/auth/${role}/login?error=email_not_verified&email=${encodeURIComponent(result.user.email)}${delivery}`);
  }
  const credentials = await checkCredentials(req.body.email, req.body.password);
  if (credentials && !credentials.emailVerified) {
    return res.redirect(`/auth/${role}/login?error=email_not_verified&email=${encodeURIComponent(credentials.email)}`);
  }
  const pendingUser = await findUserByEmail(req.body.email);
  if (pendingUser?.role === role && pendingUser.status === "pending")
    return res.redirect(`/auth/${role}/login?notice=staff-pending`);
  const user = await authenticate(req.body.email, req.body.password);
  if (!user) return res.redirect(`/auth/${role}/login?error=invalid`);
  if (user.role !== role) return res.redirect(`/auth/${role}/login?error=role`);
  const token = await createSession(user);
  setSessionCookie(res, token);
  return res.redirect(`/dashboard/${user.role}`);
});

// HTML dashboard entry paths
router.get("/customer-dashboard.html", sendPage("customer-dashboard.html"));
router.get("/owner-dashboard.html", sendPage("owner-dashboard.html"));
router.get("/staff-dashboard.html", sendPage("staff-dashboard.html"));

router.get("/pages/customer-dashboard.html", sendPage("customer-dashboard.html"));
router.get("/pages/owner-dashboard.html", sendPage("owner-dashboard.html"));
router.get("/pages/staff-dashboard.html", sendPage("staff-dashboard.html"));

// Role-protected dashboard routes
router.get("/dashboard/customer", requireAuth, (req, res) => {
  if (req.user.role !== "customer") return res.redirect(`/dashboard/${req.user.role}`);
  return res.sendFile(path.resolve(frontendPages, "customer-dashboard.html"));
});

router.get("/dashboard/owner", requireAuth, (req, res) => {
  if (req.user.role !== "owner") return res.redirect(`/dashboard/${req.user.role}`);
  return res.sendFile(path.resolve(frontendPages, "owner-dashboard.html"));
});

router.get("/dashboard/staff", requireAuth, (req, res) => {
  if (req.user.role !== "staff") return res.redirect(`/dashboard/${req.user.role}`);
  return res.sendFile(path.resolve(frontendPages, "staff-dashboard.html"));
});

router.get("/dashboard/:role/profile", requireAuth, (req, res) => {
  const role = req.params.role;
  if (!roles.has(role)) return res.redirect(`/dashboard/${req.user.role}`);
  if (req.user.role !== role) return res.redirect(`/dashboard/${req.user.role}`);
  return res.sendFile(path.resolve(frontendPages, `${role}-dashboard.html`));
});

router.get("/dashboard/:role/:section", requireAuth, (req, res) => {
  const role = req.params.role;
  if (!roles.has(role) || !sections[role]?.has(req.params.section)) {
    return res.redirect(`/dashboard/${req.user.role}`);
  }
  if (req.user.role !== role) return res.redirect(`/dashboard/${req.user.role}`);
  return res.sendFile(path.resolve(frontendPages, `${role}-dashboard.html`));
});

router.get("/dashboard/:role", requireAuth, (req, res) => {
  const role = req.params.role;
  if (!roles.has(role)) return res.redirect(`/dashboard/${req.user.role}`);
  if (req.user.role !== role) return res.redirect(`/dashboard/${req.user.role}`);
  return res.sendFile(path.resolve(frontendPages, `${role}-dashboard.html`));
});

router.get("/404", sendPage("not-found.html", 404));

// Owner-Scoped API Routes
router.get("/api/owner/overview", requireAuth, requireOwner, (req, res) => {
  const stationId = req.user.stationId || "drink-refill";
  res.json(getOwnerOverview(stationId));
});

router.get("/api/owner/orders", requireAuth, requireOwner, (req, res) => {
  const stationId = req.user.stationId || "drink-refill";
  res.json({ orders: listOrdersForStation(stationId) });
});

router.get("/api/owner/pricing", requireAuth, requireOwner, (req, res) => {
  const stationId = req.user.stationId || "drink-refill";
  res.json({ pricing: getStationPricing(stationId) });
});

router.post("/api/owner/pricing", requireAuth, requireOwner, (req, res) => {
  const stationId = req.user.stationId || "drink-refill";
  const result = updateStationPricing(stationId, req.body.pricing);
  res.json(result);
});

router.get("/api/owner/customers", requireAuth, requireOwner, (req, res) => {
  const stationId = req.user.stationId || "drink-refill";
  res.json({ customers: getStationCustomers(stationId) });
});

router.get("/api/owner/settings", requireAuth, requireOwner, (req, res) => {
  const stationId = req.user.stationId || "drink-refill";
  res.json({ settings: getStationSettings(stationId) });
});

router.post("/api/owner/settings", requireAuth, requireOwner, (req, res) => {
  const stationId = req.user.stationId || "drink-refill";
  const result = updateStationSettings(stationId, req.body.settings);
  res.json(result);
});
