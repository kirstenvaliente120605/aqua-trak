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
  createSession,
  createUser,
  destroySession,
  findUserByEmail,
  listStaffApprovals,
  updateStaffApproval,
  updateUserProfile,
} from "../services/authStore.js";
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
  const { email, password, role } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }
  const user = await authenticate(email, password);
  if (!user) {
    return res.status(401).json({ error: "Invalid email or password." });
  }
  if (role && user.role !== role) {
    return res.status(403).json({ error: `Account is registered as ${user.role}, not ${role}.` });
  }
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
      phone: user.phone,
      location: user.location,
    },
    redirectUrl: `/dashboard/${user.role}`,
  });
});

router.get("/api/auth/me", (req, res) => {
  if (!req.user) return res.status(401).json({ authenticated: false });
  const { passwordHash, ...user } = req.user;
  return res.json({ authenticated: true, user });
});

router.get("/api/staff-approvals", requireAuth, async (req, res) => {
  if (req.user.role !== "owner")
    return res.status(403).json({ error: "Owner access required." });
  const approvals = await listStaffApprovals(req.user.station);
  return res.json({ approvals });
});

router.post("/api/staff-approvals/:id", requireAuth, async (req, res) => {
  if (req.user.role !== "owner")
    return res.status(403).json({ error: "Owner access required." });
  const updated = await updateStaffApproval(
    req.params.id,
    req.user.station,
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

router.post("/api/orders", requireAuth, (req, res) => {
  if (req.user.role !== "customer")
    return res.status(403).json({ error: "Customer access required." });
  const result = createOrder(req.user, req.body);
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
      station: req.body.station,
    });
    if (result.error)
      return res.redirect(
        `/auth/${role}/register?error=${encodeURIComponent(result.error)}`
      );
    if (role === "staff")
      return res.redirect("/auth/staff/login?notice=staff-pending");
    const token = await createSession(result.user);
    setSessionCookie(res, token);
    return res.redirect(`/dashboard/${role}`);
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
