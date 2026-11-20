import { pool } from "../backend/src/db.js";

try {
  const [stations] = await pool.execute("SELECT id, name, lat, lng FROM station ORDER BY id");
  if (!stations.length) throw new Error("No station records found in the live station table");

  const issues = [];
  const seen = new Map();
  for (const station of stations) {
    const lat = Number(station.lat);
    const lng = Number(station.lng);
    if (station.lat == null || station.lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      issues.push(`${station.id} (${station.name}): missing or non-numeric coordinates`);
      continue;
    }
    if (lat === 0 || lng === 0) issues.push(`${station.id} (${station.name}): zero coordinate`);
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) issues.push(`${station.id}: out of range (${lat}, ${lng})`);
    const key = `${lat.toFixed(6)},${lng.toFixed(6)}`;
    if (seen.has(key)) issues.push(`${station.id} duplicates coordinates with ${seen.get(key)} (${key})`);
    else seen.set(key, station.id);
  }

  console.log(`Validated ${stations.length} live station records.`);
  if (issues.length) {
    for (const issue of issues) console.error(`FAIL ${issue}`);
    process.exitCode = 1;
  } else console.log("All live station coordinates are numeric, non-zero, in range, and non-duplicated.");
} finally {
  await pool.end();
}
