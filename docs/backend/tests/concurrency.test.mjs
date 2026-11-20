/**
 * Concurrency / stability check.
 *
 * XAMPP's MariaDB deadlocked inside InnoDB and killed itself under exactly this
 * kind of pressure: many overlapping sign-ins, each inserting a session row and
 * triggering the expired-session cleanup DELETE, all contending on the same
 * users/sessions tables. This hammers the same path and then verifies the server
 * is still healthy.
 */
const BASE = process.env.BASE_URL || "http://127.0.0.1:3001";
const WORKERS = 8;
const ROUNDS = 6;

let pass = 0, fail = 0;
const failures = [];
const check = (label, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; failures.push(`${label}${detail ? ` -- ${detail}` : ""}`); console.log(`  FAIL ${label}${detail ? `  <== ${detail}` : ""}`); }
};

async function call(path, { method = "GET", cookie = "", form, body } = {}) {
  const headers = { Accept: "application/json" };
  if (cookie) headers.Cookie = cookie;
  let payload;
  if (form) { headers["Content-Type"] = "application/x-www-form-urlencoded"; payload = new URLSearchParams(form).toString(); }
  else if (body !== undefined) { headers["Content-Type"] = "application/json"; payload = JSON.stringify(body); }
  const res = await fetch(BASE + path, { method, headers, body: payload, redirect: "manual" });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* page */ }
  return { status: res.status, json, text };
}

async function signIn(email, password) {
  const r = await fetch(`${BASE}/auth/customer/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ email, password }).toString(),
    redirect: "manual",
  });
  const c = (r.headers.getSetCookie?.() ?? []).map(x => x.split(";")[0]).find(x => x.startsWith("aquatracker_session="));
  return c ? c.split("=")[1] : null;
}

console.log(`=== ${WORKERS} concurrent workers x ${ROUNDS} rounds ===`);
console.log("each round: sign in -> read stations -> place an order -> list orders -> sign out\n");

const accounts = Array.from({ length: WORKERS }, (_, i) => ({
  email: `load.${i}.${Date.now()}@example.com`,
  password: "LoadTest123!",
}));

// Register every worker up front so the timed section is pure contention.
for (const a of accounts) {
  await call("/auth/customer/register", {
    method: "POST",
    form: { email: a.email, password: a.password, confirmPassword: a.password, name: "Load User" },
  });
}
console.log(`  registered ${accounts.length} accounts; starting timed run\n`);

const started = Date.now();
let logins = 0, orders = 0, failuresDuringRun = 0;
const errorTexts = new Set();

async function worker(account) {
  for (let round = 1; round <= ROUNDS; round++) {
    try {
      const token = await signIn(account.email, account.password);
      if (!token) { failuresDuringRun++; errorTexts.add("sign-in returned no cookie"); continue; }
      logins++;
      const ck = `aquatracker_session=${token}`;

      const st = await call("/api/stations", { cookie: ck });
      if (st.status !== 200) { failuresDuringRun++; errorTexts.add(`GET /api/stations -> ${st.status}`); }

      const created = await call("/api/orders", {
        method: "POST", cookie: ck,
        body: { stationId: "drink-refill", gallons: 2, fulfillment: "pickup" },
      });
      if (created.status === 201) orders++;
      else {
        failuresDuringRun++;
        errorTexts.add(`POST /api/orders -> ${created.status} :: ${created.text.replace(/\s+/g, " ").slice(0, 400)}`);
      }

      const list = await call("/api/orders", { cookie: ck });
      if (list.status !== 200) { failuresDuringRun++; errorTexts.add(`GET /api/orders -> ${list.status}`); }

      await call("/auth/logout", { method: "POST", cookie: ck });
    } catch (e) {
      failuresDuringRun++;
      errorTexts.add(`threw: ${e.message}`);
    }
  }
}

await Promise.all(accounts.map(worker));

const elapsed = ((Date.now() - started) / 1000).toFixed(1);
const expected = WORKERS * ROUNDS;
console.log(`  finished in ${elapsed}s`);
console.log(`  sign-ins ${logins}/${expected}, orders placed ${orders}, errors ${failuresDuringRun}\n`);

check("every sign-in succeeded under concurrency", logins === expected, `${logins}/${expected}`);
check("every order was created", orders === expected, `${orders}/${expected}`);
check("no request errors during the run", failuresDuringRun === 0, [...errorTexts].slice(0, 4).join(" | "));

console.log("\n=== server still healthy afterwards? ===");
{
  const me = await call("/api/auth/me");
  check("signed-out /api/auth/me still answers 401", me.status === 401, `got ${me.status}`);

  const t0 = Date.now();
  const token = await signIn("customer.demo@example.com", "CustomerDemo123!");
  const ms = Date.now() - t0;
  check("a fresh sign-in still works after the load", Boolean(token));
  check("and it is fast (no lock pile-up)", ms < 5000, `took ${ms}ms`);

  const stations = await call("/api/stations", { cookie: `aquatracker_session=${token}` });
  check("stations still readable", stations.status === 200 && stations.json?.stations?.length === 7,
    `status ${stations.status}, ${stations.json?.stations?.length} stations`);

  const orders = await call("/api/orders", { cookie: `aquatracker_session=${token}` });
  check("orders still readable", orders.status === 200, `got ${orders.status}`);
}

console.log(`\n${"=".repeat(60)}`);
console.log(`passed: ${pass}   failed: ${fail}`);
if (failures.length) { console.log("\nfailures:"); failures.forEach(f => console.log(`  - ${f}`)); }
console.log("=".repeat(60));
process.exit(fail ? 1 : 0);