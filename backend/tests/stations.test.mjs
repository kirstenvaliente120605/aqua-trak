/**
 * Verifies that the live GET /api/stations payload from the XAMPP backend is
 * shape-compatible with the frontend's own nearest-station ranking.
 *
 * distanceKm() and getNearestStations() are copied verbatim from
 * frontend/js/location.js and frontend/js/dashboard.js respectively, so this
 * fails if the PHP backend ever changes the station JSON contract.
 */
const BASE = process.env.BASE_URL || "http://127.0.0.1:3001";

// --- verbatim from frontend/js/location.js -----------------------------------
function isValidPoint(point) {
  return Boolean(
    point &&
      Number.isFinite(Number(point.lat)) &&
      Number.isFinite(Number(point.lng))
  );
}

function distanceKm(from, to) {
  if (!isValidPoint(from) || !isValidPoint(to)) return null;

  const R = 6371;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(Number(to.lat) - Number(from.lat));
  const dLng = toRad(Number(to.lng) - Number(from.lng));
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(Number(from.lat))) *
      Math.cos(toRad(Number(to.lat))) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// --- verbatim from frontend/js/dashboard.js ----------------------------------
function getNearestStations(stations, point, radiusKm) {
  if (!Array.isArray(stations) || !stations.length) return [];
  const measure = distanceKm;
  if (!measure || !point) return [];

  const radius = Number(radiusKm);
  const limit = Number.isFinite(radius) && radius > 0 ? radius : Infinity;

  return stations
    .map((station) => {
      const km = measure(point, station && station.coords);
      return km === null ? null : { ...station, distanceKm: km };
    })
    .filter(Boolean)
    .filter((station) => station.distanceKm <= limit)
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

// --- harness ----------------------------------------------------------------
let pass = 0, fail = 0;
const failures = [];
function check(label, cond, detail = "") {
  if (cond) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; failures.push(label + (detail ? ` -- ${detail}` : "")); console.log(`  FAIL ${label}${detail ? `  <== ${detail}` : ""}`); }
}

// Pagadian City centre, as used by the frontend fixtures.
const origin = { lat: 7.8269, lng: 123.4371 };

// sign in
const login = await fetch(`${BASE}/auth/customer/login`, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ email: "customer.demo@example.com", password: "CustomerDemo123!" }).toString(),
  redirect: "manual",
});
const cookie = (login.headers.getSetCookie?.() ?? [])
  .map(c => c.split(";")[0])
  .find(c => c.startsWith("aquatracker_session="));

console.log("=== live /api/stations vs the frontend ranking code ===");
check("signed in for the request", Boolean(cookie));

const res = await fetch(`${BASE}/api/stations`, { headers: { Cookie: cookie } });
check("GET /api/stations -> 200", res.status === 200, `got ${res.status}`);
const stations = (await res.json()).stations ?? [];
check("7 stations returned", stations.length === 7, `got ${stations.length}`);

console.log("\n-- station id / coords / price / delivery --");
for (const s of stations) {
  const c = s.coords;
  const coordTxt = isValidPoint(c)
    ? `${Number(c.lat).toFixed(4)}, ${Number(c.lng).toFixed(4)}`
    : "(none)";
  console.log(`  ${String(s.id).padEnd(15)} ${coordTxt.padEnd(24)} ₱${s.pricePerGallon}  delivery=${s.delivery}`);
}

console.log("\n-- contract checks --");
check("every station has an id, a name and an area",
  stations.every(s => s.id && s.name && s.area));
check("every station has an address (alka's repeats its area by design)",
  stations.every(s => typeof s.address === "string" && s.address.length > 0),
  stations.filter(s => !s.address).map(s => s.id).join(",") || "none blank");
check("every station has a numeric pricePerGallon",
  stations.every(s => Number.isFinite(s.pricePerGallon)));
check("delivery is a real boolean, not 0/1",
  stations.every(s => typeof s.delivery === "boolean"));
check("the 6 stations with frontend fixtures carry a real rating",
  stations.filter(s => s.id !== "alka").every(s => s.rating >= 4 && s.rating <= 5),
  stations.filter(s => s.id !== "alka").map(s => `${s.id}=${s.rating}`).join(" "));
check("'alka' is unrated (0) because no fixture exists for it",
  stations.find(s => s.id === "alka")?.rating === 0);
check("coords are objects on every station (null/absent when unknown)",
  stations.every(s => s.coords === null || s.coords === undefined || typeof s.coords === "object"));
check("exactly 6 stations carry usable coordinates",
  stations.filter(s => isValidPoint(s.coords)).length === 6,
  `${stations.filter(s => isValidPoint(s.coords)).length}`);
check("the one without coords is 'alka'",
  stations.filter(s => !isValidPoint(s.coords)).map(s => s.id).join(",") === "alka",
  stations.filter(s => !isValidPoint(s.coords)).map(s => s.id).join(","));
check("the backend sends coords: null, never {lat: null} (which would read as 0,0)",
  stations.every(s => s.coords === null || (s.coords.lat !== null && s.coords.lng !== null)));

console.log("\n-- getNearestStations(stations, origin) with no radius --");
const all = getNearestStations(stations, origin);
check("ranks 6 stations, dropping the one without coords", all.length === 6, `got ${all.length}`);
check("never returns the coord-less station", !all.some(s => s.id === "alka"));
check("results are sorted nearest first",
  all.every((s, i) => i === 0 || all[i - 1].distanceKm <= s.distanceKm),
  all.map(s => s.distanceKm.toFixed(3)).join(" > "));
check("each result carries a live distanceKm",
  all.every(s => Number.isFinite(s.distanceKm) && s.distanceKm >= 0));
check("all 6 stations fall within the 2.62km cluster the fixtures describe",
  all.every(s => s.distanceKm <= 2.62),
  `max was ${Math.max(...all.map(s => s.distanceKm)).toFixed(3)}km`);

console.log("\n  ranking:");
for (const s of all) {
  console.log(`    ${s.distanceKm.toFixed(2)} km  ${s.name}`);
}

console.log("\n-- with a 1km radius (the 'close by' case) --");
const near = getNearestStations(stations, origin, 1);
console.log(`    ${near.length} within 1km: ${near.map(s => `${s.id} (${s.distanceKm.toFixed(2)}km)`).join(", ") || "(none)"}`);
check("radius filter keeps only stations inside the limit",
  near.every(s => s.distanceKm <= 1));
check("radius filter returned fewer than the unfiltered list", near.length < all.length);

console.log("\n-- degenerate inputs are handled, not thrown on --");
check("null origin -> empty array, no throw",
  JSON.stringify(getNearestStations(stations, null)) === "[]");
check("empty station list -> empty array",
  JSON.stringify(getNearestStations([], origin)) === "[]");
check("a radius of 0 is treated as unlimited rather than matching nothing",
  getNearestStations(stations, origin, 0).length === 6);
check("a station whose coords are strings still ranks",
  getNearestStations([{ id: "str", coords: { lat: "7.8269", lng: "123.4371" } }], origin).length === 1);
check("a station with no coords key at all is skipped, not crashed on",
  getNearestStations([{ id: "bare" }], origin).length === 0);
check("a station with coords: null (what alka gets) is skipped",
  getNearestStations([{ id: "alka", coords: null }], origin).length === 0);
check("all stations coord-less -> empty result, no throw",
  getNearestStations(stations.filter(s => !isValidPoint(s.coords)), origin).length === 0);

// Known frontend looseness, asserted so it is documented rather than discovered.
// isValidPoint() tests Number.isFinite(Number(p.lat)), and Number(null) === 0,
// so a literal {lat: null} is read as a valid point at (0,0) - Null Island,
// roughly 7,800km from Pagadian. It cannot throw and it cannot win a "nearest"
// contest once any radius is applied; the backend never sends that shape.
const nullIsland = getNearestStations([{ id: "null-island", coords: { lat: null, lng: null } }], origin);
console.log(`\n  note: {lat:null} is NOT skipped by the current isValidPoint (reads as 0,0):`);
console.log(`        ${nullIsland.length ? `${nullIsland[0].distanceKm.toFixed(0)}km away` : "skipped"}`);
check("a {lat:null} station is still excluded by any sane radius",
  getNearestStations([{ id: "null-island", coords: { lat: null, lng: null } }], origin, 5).length === 0);

console.log(`\n${"=".repeat(60)}`);
console.log(`passed: ${pass}   failed: ${fail}`);
if (failures.length) { console.log("\nfailures:"); failures.forEach(f => console.log(`  - ${f}`)); }
console.log("=".repeat(60));
process.exit(fail ? 1 : 0);