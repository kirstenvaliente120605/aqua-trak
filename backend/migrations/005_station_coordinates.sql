-- Coordinates for the live ERD station table (station), plus Alka if missing.
-- Existing six catalog pins are approximate fixtures. Four legacy rows have no
-- address, so their unique city-level pins are approximate and must be checked.
-- Alka's pin comes from the public listing linked in station-coords-report.json.
UPDATE station SET lat = 7.819100, lng = 123.441200 WHERE id = 'STN_001';
UPDATE station SET lat = 7.828000, lng = 123.438000 WHERE id = 'STN_010';
UPDATE station SET lat = 7.829000, lng = 123.439000 WHERE id = 'STN_005';
UPDATE station SET lat = 7.830000, lng = 123.440000 WHERE id = 'STN_006';
UPDATE station SET lat = 7.832000, lng = 123.442000 WHERE id = 'STN_009';
UPDATE station SET lat = 7.827330, lng = 123.444185 WHERE id = 'STN_002';
UPDATE station SET lat = 7.833000, lng = 123.445000 WHERE id = 'STN_011';
UPDATE station SET lat = 7.819800, lng = 123.429700 WHERE id = 'STN_003';
UPDATE station SET lat = 7.836200, lng = 123.426400 WHERE id = 'STN_004';
UPDATE station SET lat = 7.831200, lng = 123.443700 WHERE id = 'STN_007';
UPDATE station SET lat = 7.834700, lng = 123.448100 WHERE id = 'STN_008';

INSERT INTO station (id, owner_id, name, address, lat, lng, status)
SELECT 'STN_ALKA', 'OWN_002', 'Alka Water Refilling Station',
       'Zone 11, Alta Tierra Subdivision, Tiguma, Pagadian City',
       7.840580, 123.463360, 'open'
WHERE NOT EXISTS (
  SELECT 1 FROM station WHERE name = 'Alka Water Refilling Station'
);
UPDATE station SET lat = 7.840580, lng = 123.463360
WHERE name = 'Alka Water Refilling Station';
