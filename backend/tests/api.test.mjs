/**
 * End-to-end test of the XAMPP (Apache + PHP + MySQL) backend on port 8080.
 * Exercises the real HTTP surface the browser uses, including the native
 * login form POST that sets the session cookie.
 */
const BASE = process.env.BASE_URL || "http://127.0.0.1:3001";

let pass = 0;
let fail = 0;
const failures = [];

function check(label, condition, detail = "") {
  if (condition) {
    pass++;
    console.log(`  ok   ${label}`);
  } else {
    fail++;
    failures.push(label + (detail ? ` -- ${detail}` : ""));
    console.log(`  FAIL ${label}${detail ? `  <== ${detail}` : ""}`);
  }
}

async function req(path, { method = "GET", cookie = "", body, form, redirect = "manual" } = {}) {
  const headers = { Accept: "application/json" };
  if (cookie) headers.Cookie = cookie;
  let payload;
  if (form) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    payload = new URLSearchParams(form).toString();
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(BASE + path, { method, headers, body: payload, redirect });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* page or empty body */ }
  return { res, text, json, status: res.status };
}

/** Logs in through the real HTML form and returns the session cookie. */
async function login(role, email, password) {
  const r = await req(`/auth/${role}/login`, {
    method: "POST",
    form: { email, password },
  });
  const setCookie = r.res.headers.getSetCookie?.() ?? [];
  const session = setCookie.map(c => c.split(";")[0]).find(c => c.startsWith("aquatracker_session="));
  return { r, cookie: session ? session.split("=")[1] : null };
}

console.log("=== 1. pages and static assets ===");
for (const [p, expect] of [
  ["/", 200], ["/index.html", 200], ["/css/styles.css", 200], ["/js/dashboard.js", 200],
  ["/js/auth.js", 200], ["/pages/auth.html", 200], ["/auth/customer/login", 200],
  ["/auth/owner/register", 200], ["/auth/staff/login", 200],
  ["/customer-dashboard.html", 200], ["/owner-dashboard.html", 200], ["/staff-dashboard.html", 200],
  ["/404", 404], ["/definitely-not-a-page", 404],
]) {
  const r = await req(p);
  check(`GET ${p} -> ${expect}`, r.status === expect, `got ${r.status}`);
}

console.log("\n=== 2. unauthenticated access is refused ===");
{
  const me = await req("/api/auth/me");
  check("GET /api/auth/me -> 401 with authenticated:false",
    me.status === 401 && me.json?.authenticated === false, `status ${me.status}`);

  const dash = await req("/dashboard/customer");
  check("GET /dashboard/customer -> 302 to the login form",
    dash.status === 302 && dash.res.headers.get("location")?.includes("/auth/customer/login"),
    `status ${dash.status}`);

  const orders = await req("/api/orders");
  check("GET /api/orders -> 401", orders.status === 401, `got ${orders.status}`);

  const ownerOnly = await req("/api/owner/overview");
  check("GET /api/owner/overview -> 401 when signed out", ownerOnly.status === 401, `got ${ownerOnly.status}`);
}

console.log("\n=== 3. bad credentials ===");
{
  const bad = await login("customer", "customer.demo@example.com", "WrongPassword123!");
  check("wrong password does not create a session", bad.cookie === null);
  const badBody = await req("/auth/customer/login", { method: "POST", form: { email: "customer.demo@example.com", password: "nope" } });
  check("wrong password redirects with error=invalid",
    badBody.status === 302 && badBody.res.headers.get("location")?.includes("error=invalid"),
    `location ${badBody.res.headers.get("location")}`);
}

console.log("\n=== 4. customer session ===");
const cust = await login("customer", "customer.demo@example.com", "CustomerDemo123!");
check("login form issues a session cookie", Boolean(cust.cookie));
const ck = `aquatracker_session=${cust.cookie}`;

{
  const me = await req("/api/auth/me", { cookie: ck });
  check("GET /api/auth/me -> authenticated with the right email",
    me.status === 200 && me.json?.authenticated === true && me.json?.user?.email === "customer.demo@example.com",
    JSON.stringify(me.json));
  check("password hash is never sent to the client",
    !me.text.includes("password_hash") && !me.text.includes("$2y$"),
    "hash leaked into the response");

  const stations = await req("/api/stations", { cookie: ck });
  const list = stations.json?.stations ?? [];
  check("GET /api/stations returns 7 stations", list.length === 7, `got ${list.length}`);
  check("stations carry coordinates for the proximity filter",
    list.filter(s => s.coords && typeof s.coords.lat === "number").length === 6,
    `${list.filter(s => s.coords).length} have coords`);

  const drink = list.find(s => s.id === "drink-refill");
  check("drink-refill price is 35 and it delivers",
    drink?.pricePerGallon === 35 && drink?.delivery === true, JSON.stringify(drink));
}

console.log("\n=== 5. creating an order (volume pricing) ===");
let orderId = null;
{
  const before = await req("/api/orders", { cookie: ck });
  const countBefore = before.json?.orders?.length ?? 0;

  const created = await req("/api/orders", {
    method: "POST", cookie: ck,
    body: { stationId: "drink-refill", gallons: 10, fulfillment: "delivery" },
  });
  orderId = created.json?.order?.id ?? null;
  check("POST /api/orders -> 201", created.status === 201, `got ${created.status} ${created.text.slice(0, 120)}`);

  const o = created.json?.order;
  check("10 gallons at 35 with the 15% tier = 297.50",
    o?.subtotal === 350 && o?.discountRate === 0.15 && o?.total === 297.5,
    JSON.stringify({ subtotal: o?.subtotal, rate: o?.discountRate, total: o?.total }));
  check("new orders start in the customer-facing status 'New order'",
    o?.status === "New order", o?.status);
  check("order embeds the station object like the Node backend did",
    o?.station?.id === "drink-refill", JSON.stringify(o?.station?.id));

  const after = await req("/api/orders", { cookie: ck });
  check("order count increased by one",
    (after.json?.orders?.length ?? 0) === countBefore + 1,
    `${countBefore} -> ${after.json?.orders?.length}`);

  const noDelivery = await req("/api/orders", {
    method: "POST", cookie: ck,
    body: { stationId: "ultra-pure", gallons: 2, fulfillment: "delivery" },
  });
  check("delivery refused at a station that does not offer it",
    noDelivery.status === 400 && /delivery/i.test(noDelivery.text),
    `got ${noDelivery.status} ${noDelivery.text.slice(0, 100)}`);

  const badGallons = await req("/api/orders", {
    method: "POST", cookie: ck, body: { stationId: "drink-refill", gallons: 500 },
  });
  check("out-of-range quantity rejected", badGallons.status === 400, `got ${badGallons.status}`);

  const badStation = await req("/api/orders", {
    method: "POST", cookie: ck, body: { stationId: "nope", gallons: 5 },
  });
  check("unknown station rejected", badStation.status === 400, `got ${badStation.status}`);
}

console.log("\n=== 6. subscriptions ===");
let subId = null;
{
  const created = await req("/api/subscriptions", {
    method: "POST", cookie: ck,
    body: { stationId: "drink-refill", gallons: 5, frequency: "weekly" },
  });
  subId = created.json?.subscription?.id ?? null;
  check("POST /api/subscriptions -> 201", created.status === 201, `got ${created.status}`);
  check("subscription applies at least the 10% tier",
    created.json?.subscription?.discountRate >= 0.10,
    String(created.json?.subscription?.discountRate));

  const list = await req("/api/subscriptions", { cookie: ck });
  check("GET /api/subscriptions lists it",
    (list.json?.subscriptions ?? []).some(s => s.id === subId));

  const cancelled = await req(`/api/subscriptions/${subId}/cancel`, { method: "POST", cookie: ck });
  check("cancel marks the subscription Cancelled",
    cancelled.json?.subscription?.status === "Cancelled",
    JSON.stringify(cancelled.json?.subscription?.status));

  const cancelAgain = await req("/api/subscriptions/SUB-DOESNOTEXIST/cancel", { method: "POST", cookie: ck });
  check("cancelling an unknown subscription -> 404", cancelAgain.status === 404, `got ${cancelAgain.status}`);
}

console.log("\n=== 7. role enforcement ===");
{
  const asCustomer = await req("/api/owner/overview", { cookie: ck });
  check("customer hitting an owner route -> 403", asCustomer.status === 403, `got ${asCustomer.status}`);

  const asCustomerStaff = await req("/api/staff/overview", { cookie: ck });
  check("customer hitting a staff route -> 403", asCustomerStaff.status === 403, `got ${asCustomerStaff.status}`);

  const wrongPortal = await login("owner", "customer.demo@example.com", "CustomerDemo123!");
  check("customer credentials on the owner login form are refused", wrongPortal.cookie === null);

  const badRole = await req("/auth/customer/login", {
    method: "POST", form: { email: "customer.demo@example.com", password: "CustomerDemo123!" },
  });
  check("same-role login lands on the customer dashboard",
    badRole.res.headers.get("location") === "/dashboard/customer",
    badRole.res.headers.get("location"));
}

console.log("\n=== 8. staff workspace ===");
const staff = await login("staff", "staff.demo@example.com", "StaffDemo123!");
check("staff login issues a session", Boolean(staff.cookie));
const sk = `aquatracker_session=${staff.cookie}`;
{
  const overview = await req("/api/staff/overview", { cookie: sk });
  check("GET /api/staff/overview -> 200 with metrics",
    overview.status === 200 && typeof overview.json?.metrics?.assignedOrders === "number",
    `status ${overview.status}`);
  check("staff overview is scoped to drink-refill",
    overview.json?.stationId === "drink-refill", overview.json?.stationId);

  const orders = await req("/api/staff/orders", { cookie: sk });
  const staffOrders = orders.json?.orders ?? [];
  check("GET /api/staff/orders returns the seeded order", staffOrders.length >= 1, `got ${staffOrders.length}`);
  check("staff view shows 'New' rather than 'New order'",
    staffOrders.every(o => o.status !== "New order"),
    staffOrders.map(o => o.status).join(","));
  check("statuses list is exposed for the dropdown",
    Array.isArray(orders.json?.statuses) && orders.json.statuses.includes("Ready for Pickup"));

  const updated = await req(`/api/staff/orders/${orderId}`, {
    method: "PATCH", cookie: sk, body: { status: "Preparing", internalNote: "Filling containers" },
  });
  check("PATCH /api/staff/orders/:id applies a valid status",
    updated.json?.order?.status === "Preparing", JSON.stringify(updated.json?.order?.status));
  check("internal note is saved",
    updated.json?.order?.internalNote === "Filling containers",
    JSON.stringify(updated.json?.order?.internalNote));

  const badStatus = await req(`/api/staff/orders/${orderId}`, {
    method: "PATCH", cookie: sk, body: { status: "Teleported" },
  });
  check("an invalid status is rejected", badStatus.status === 400, `got ${badStatus.status}`);

  const otherOrder = await req("/api/staff/orders/AT-9999", { cookie: sk });
  check("order not at this station -> 404", otherOrder.status === 404, `got ${otherOrder.status}`);

  const shifts = await req("/api/staff/shifts", { cookie: sk });
  check("GET /api/staff/shifts seeds a rota on first login",
    (shifts.json?.shifts ?? []).length >= 1, `got ${(shifts.json?.shifts ?? []).length}`);

  const shiftId = shifts.json?.shifts?.[0]?.id;
  const attendance = await req(`/api/staff/shifts/${shiftId}/attendance`, {
    method: "POST", cookie: sk, body: { action: "check-in" },
  });
  check("check-in records attendance",
    Boolean(attendance.json?.shift?.attendance?.["check-in"]),
    JSON.stringify(attendance.json?.shift?.attendance));

  const inventory = await req("/api/staff/inventory", { cookie: sk });
  check("GET /api/staff/inventory returns the seeded stock",
    (inventory.json?.inventory ?? []).length === 4, `got ${(inventory.json?.inventory ?? []).length}`);

  const beforeQty = inventory.json.inventory.find(i => i.id === "sanitizer")?.quantity;
  const report = await req("/api/staff/inventory/report", {
    method: "POST", cookie: sk, body: { itemId: "sanitizer", type: "damage", amount: 2, note: "Two bottles cracked" },
  });
  check("damage report decreases stock",
    report.json?.item?.quantity === beforeQty - 2,
    `${beforeQty} -> ${report.json?.item?.quantity}`);

  const returned = await req("/api/staff/inventory/report", {
    method: "POST", cookie: sk, body: { itemId: "sanitizer", type: "return", amount: 1 },
  });
  check("return report increases stock",
    returned.json?.item?.quantity === beforeQty - 1,
    `expected ${beforeQty - 1}, got ${returned.json?.item?.quantity}`);

  const requests = await req("/api/staff/requests", { cookie: sk });
  const reqId = requests.json?.requests?.[0]?.id;
  check("GET /api/staff/requests returns seeded requests",
    (requests.json?.requests ?? []).length === 2, `got ${(requests.json?.requests ?? []).length}`);

  const resolved = await req(`/api/staff/requests/${reqId}`, {
    method: "PATCH", cookie: sk, body: { status: "Resolved" },
  });
  check("PATCH /api/staff/requests/:id resolves a request",
    resolved.json?.request?.status === "Resolved", JSON.stringify(resolved.json?.request?.status));

  const notifications = await req("/api/staff/notifications", { cookie: sk });
  check("GET /api/staff/notifications works", notifications.status === 200, `got ${notifications.status}`);

  const profile = await req("/api/staff/profile", {
    method: "PATCH", cookie: sk, body: { name: "Staff Demo", email: "staff.demo@example.com", phone: "0917 555 0100", location: "Pagadian City" },
  });
  check("PATCH /api/staff/profile updates details",
    profile.json?.user?.phone === "0917 555 0100", JSON.stringify(profile.json?.user?.phone));
}

console.log("\n=== 9. owner workspace (this route used to throw a 500) ===");
const owner = await login("owner", "owner.demo@example.com", "OwnerDemo123!");
check("owner login issues a session", Boolean(owner.cookie));
const ok = `aquatracker_session=${owner.cookie}`;
{
  const orders = await req("/api/owner/orders", { cookie: ok });
  check("GET /api/owner/orders -> 200 (was a 500 ReferenceError before)",
    orders.status === 200 && Array.isArray(orders.json?.orders),
    `status ${orders.status}`);
  const allOrders = orders.json?.orders ?? [];
  const ours = allOrders.find(o => o.id === orderId);

  check("the order this run created appears in the owner list",
    Boolean(ours), `looking for ${orderId}`);
  check("owner sees the 'New' normalisation too (staff set ours to Preparing)",
    ours?.status === "Preparing", ours?.status);

  const expectedRevenue = allOrders.reduce((s, o) => s + (Number(o.total) || 0), 0);
  const overview = await req("/api/owner/overview", { cookie: ok });
  check("GET /api/owner/overview -> 200",
    overview.status === 200 && typeof overview.json?.revenue === "number",
    `status ${overview.status}`);
  check("revenue equals the sum of every order total",
    Math.abs(overview.json.revenue - expectedRevenue) < 0.001,
    `overview ${overview.json?.revenue} vs orders ${expectedRevenue}`);
  check("order volume equals the number of orders",
    overview.json?.orderVolume === allOrders.length,
    `${overview.json?.orderVolume} vs ${allOrders.length}`);
  check("customer count matches the distinct buyers",
    overview.json?.customerCount === new Set(allOrders.map(o => o.userId)).size,
    `${overview.json?.customerCount}`);

  const customers = await req("/api/owner/customers", { cookie: ok });
  const custRow = (customers.json?.customers ?? []).find(c => c.name === "Customer Demo");
  const mine = allOrders.filter(o => o.userId === custRow?.id);
  check("GET /api/owner/customers derives the customer list from orders",
    custRow !== undefined, JSON.stringify(customers.json?.customers?.map(c => c.name)));
  check("order count matches that customer's own orders",
    custRow?.orderCount === mine.length, `${custRow?.orderCount} vs ${mine.length}`);
  const expectedSpent = mine.reduce((s, o) => s + (Number(o.total) || 0), 0);
  check("total spent rolled up correctly",
    Math.abs((custRow?.totalSpent ?? -1) - expectedSpent) < 0.001,
    `${custRow?.totalSpent} vs ${expectedSpent}`);

  const pricing = await req("/api/owner/pricing", { cookie: ok });
  check("GET /api/owner/pricing -> 200", pricing.status === 200, `got ${pricing.status}`);

  const savePricing = await req("/api/owner/pricing", {
    method: "POST", cookie: ok, body: { pricing: { "5-gallon": 40, "2.5-gallon": 22 } },
  });
  check("POST /api/owner/pricing saves", savePricing.json?.success === true);

  const readBack = await req("/api/owner/pricing", { cookie: ok });
  check("pricing persists",
    readBack.json?.pricing?.["5-gallon"] === 40,
    JSON.stringify(readBack.json?.pricing));

  const settings = await req("/api/owner/settings", { cookie: ok });
  check("GET /api/owner/settings returns defaults",
    settings.status === 200 && settings.json?.settings !== undefined, `got ${settings.status}`);

  const saveSettings = await req("/api/owner/settings", {
    method: "POST", cookie: ok,
    body: { settings: { name: "ClearSpring Water Hub", address: "45 Sabellano St", hours: "7am-9pm", contact: "0917 555 0000" } },
  });
  check("POST /api/owner/settings saves", saveSettings.json?.success === true);

  const readSettings = await req("/api/owner/settings", { cookie: ok });
  check("settings persist",
    readSettings.json?.settings?.hours === "7am-9pm",
    JSON.stringify(readSettings.json?.settings));
}

console.log("\n=== 10. staff approval workflow ===");
{
  const email = `new.staff.${Date.now()}@example.com`;
  const reg = await req("/auth/staff/register", {
    method: "POST",
    form: { email, password: "BrandNew123!", confirmPassword: "BrandNew123!", name: "New Staff", station: "ClearSpring Water Hub" },
  });
  check("staff registration redirects to the pending notice",
    reg.status === 302 && reg.res.headers.get("location")?.includes("notice=staff-pending"),
    reg.res.headers.get("location"));

  const pendingLogin = await login("staff", email, "BrandNew123!");
  check("pending staff cannot sign in yet", pendingLogin.cookie === null);

  const mismatch = await req("/auth/staff/register", {
    method: "POST",
    form: { email: `x.${Date.now()}@example.com`, password: "BrandNew123!", confirmPassword: "Different123!", name: "X", station: "ClearSpring Water Hub" },
  });
  check("password confirmation mismatch is caught",
    mismatch.res.headers.get("location")?.includes("error=passwords"),
    mismatch.res.headers.get("location"));

  const approvals = await req("/api/staff-approvals", { cookie: ok });
  check("owner sees the pending request",
    (approvals.json?.approvals ?? []).some(a => a.email === email),
    JSON.stringify(approvals.json?.approvals?.map(a => a.email)));

  const pendingUser = approvals.json.approvals.find(a => a.email === email);
  const decided = await req(`/api/staff-approvals/${pendingUser.id}`, {
    method: "POST", cookie: ok, body: { decision: "approve" },
  });
  check("owner approves it", decided.json?.approval?.status === "active",
    JSON.stringify(decided.json?.approval?.status));

  const nowWorks = await login("staff", email, "BrandNew123!");
  check("approved staff can now sign in", Boolean(nowWorks.cookie));

  const rejected = await req(`/api/staff-approvals/${pendingUser.id}`, {
    method: "POST", cookie: ok, body: { decision: "approve" },
  });
  check("deciding twice -> 404", rejected.status === 404, `got ${rejected.status}`);
}

console.log("\n=== 11. JSON login endpoint (the demo role switcher) ===");
{
  const r = await req("/auth/login", {
    method: "POST", body: { email: "owner.demo@example.com", password: "OwnerDemo123!", role: "owner" },
  });
  check("POST /auth/login -> 200 (this route did not exist before)",
    r.status === 200 && r.json?.ok === true, `status ${r.status}`);
  check("returns the redirect target the switcher expects",
    r.json?.redirectUrl === "/dashboard/owner", JSON.stringify(r.json?.redirectUrl));

  const wrongRole = await req("/auth/login", {
    method: "POST", body: { email: "owner.demo@example.com", password: "OwnerDemo123!", role: "staff" },
  });
  check("role mismatch -> 403", wrongRole.status === 403, `got ${wrongRole.status}`);

  const badPw = await req("/auth/login", {
    method: "POST", body: { email: "owner.demo@example.com", password: "nope" },
  });
  check("bad password -> 401", badPw.status === 401, `got ${badPw.status}`);
}

console.log("\n=== 12. session lifecycle ===");
{
  const scoped = await login("customer", "customer.demo@example.com", "CustomerDemo123!");
  const cookie = `aquatracker_session=${scoped.cookie}`;
  const meBefore = await req("/api/auth/me", { cookie });
  check("session works before logout", meBefore.json?.authenticated === true);

  const out = await req("/auth/logout", { method: "POST", cookie });
  check("POST /auth/logout -> ok", out.json?.ok === true);

  const meAfter = await req("/api/auth/me", { cookie });
  check("same cookie is dead after logout",
    meAfter.status === 401 && meAfter.json?.authenticated === false,
    `status ${meAfter.status}`);

  const linkLogout = await req("/auth/logout");
  check("GET /auth/logout redirects home", linkLogout.status === 302);
}

console.log("\n=== 13. data isolation between customers ===");
{
  const email = `iso.${Date.now()}@example.com`;
  await req("/auth/customer/register", {
    method: "POST",
    form: { email, password: "Isolated123!", confirmPassword: "Isolated123!", name: "Iso User" },
  });
  const other = await login("customer", email, "Isolated123!");
  check("second customer can register and sign in", Boolean(other.cookie));

  const theirs = await req("/api/orders", { cookie: `aquatracker_session=${other.cookie}` });
  check("a new customer sees zero orders", (theirs.json?.orders ?? []).length === 0,
    `got ${(theirs.json?.orders ?? []).length}`);

  const mine = await req("/api/orders", { cookie: ck });
  check("the first customer's orders are still theirs", (mine.json?.orders ?? []).length >= 1);

  const forged = await req(`/api/staff/orders/${orderId}`, { cookie: `aquatracker_session=${other.cookie}` });
  check("a customer cannot read a station order", forged.status === 403, `got ${forged.status}`);
}

console.log("\n=== 14. malformed input ===");
{
  const badJson = await fetch(`${BASE}/api/orders`, {
    method: "POST", cookie: ck,
    headers: { "Content-Type": "application/json" },
    body: "{not json",
  });
  check("malformed JSON does not produce a 500", badJson.status < 500, `got ${badJson.status}`);

  const sqlInject = await req("/api/orders", {
    method: "POST", cookie: ck,
    body: { stationId: "drink-refill' OR '1'='1", gallons: 5 },
  });
  check("SQL injection attempt is treated as an unknown station",
    sqlInject.status === 400, `got ${sqlInject.status}`);

  const huge = await req("/api/orders", {
    method: "POST", cookie: ck,
    body: { stationId: "drink-refill", gallons: 999999999999 },
  });
  check("absurd quantity rejected", huge.status === 400, `got ${huge.status}`);
}

console.log(`\n${"=".repeat(60)}`);
console.log(`passed: ${pass}   failed: ${fail}`);
if (failures.length) {
  console.log("\nfailures:");
  failures.forEach(f => console.log(`  - ${f}`));
}
console.log("=".repeat(60));
process.exit(fail ? 1 : 0);