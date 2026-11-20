-- 014 (data) — align USER.station_id and USER.station with STATION.
--
-- Rules applied:
--   * Every owner points at one primary station (their own station row), and
--     USER.station carries that station's name. Multi-station owners keep their
--     other stations in STATION; only the primary id is stored here.
--   * Staff keep the station they already belong to; USER.station gets the
--     station name instead of the old "Station staff" placeholder.
--   * Unassigned staff are marked with the column's own unassigned value.
--     USER.station_id is `varchar(64) NOT NULL DEFAULT ''`, so NULL is not
--     allowed and '' is the single unassigned marker everywhere (signup,
--     seeders and the approval claim).
--   * Only one pending account was pre-assigned by the old signup flow
--     (USR_003 Kim Dela Cruz, status pending, no STAFF row). Clearing it makes
--     it claimable by an owner like any other applicant.
--
-- Names are copied from STATION.name, never hardcoded. Every statement is
-- guarded so a re-run affects 0 rows. Run 014_rename_user_subtitle_to_station.sql
-- first. Expect 12 rows changed in total: 1 + 7 + 4.

START TRANSACTION;

-- 1. Pending legacy applicant becomes a claimable, station-less applicant.
UPDATE `user`
   SET `station_id` = '', `station` = ''
 WHERE `id` = 'USR_003' AND `role` = 'staff' AND `status` = 'pending'
   AND (`station_id` <> '' OR `station` <> '');

-- 2. Owner primary station + station name.
UPDATE `user` u JOIN `station` s ON s.id = 'STN_006'
   SET u.station_id = s.id, u.station = s.name
 WHERE u.id = 'USR_007' AND (u.station_id <> s.id OR u.station <> s.name);

UPDATE `user` u JOIN `station` s ON s.id = 'STN_002'
   SET u.station_id = s.id, u.station = s.name
 WHERE u.id = 'USR_010' AND (u.station_id <> s.id OR u.station <> s.name);

UPDATE `user` u JOIN `station` s ON s.id = 'STN_009'
   SET u.station_id = s.id, u.station = s.name
 WHERE u.id = 'USR_012' AND (u.station_id <> s.id OR u.station <> s.name);

UPDATE `user` u JOIN `station` s ON s.id = 'STN_010'
   SET u.station_id = s.id, u.station = s.name
 WHERE u.id = 'USR_013' AND (u.station_id <> s.id OR u.station <> s.name);

UPDATE `user` u JOIN `station` s ON s.id = 'STN_011'
   SET u.station_id = s.id, u.station = s.name
 WHERE u.id = 'USR_014' AND (u.station_id <> s.id OR u.station <> s.name);

UPDATE `user` u JOIN `station` s ON s.id = 'STN_012'
   SET u.station_id = s.id, u.station = s.name
 WHERE u.id = 'USR_023' AND (u.station_id <> s.id OR u.station <> s.name);

UPDATE `user` u JOIN `station` s ON s.id = 'STN_005'
   SET u.station_id = s.id, u.station = s.name
 WHERE u.id = 'USR_008' AND (u.station_id <> s.id OR u.station <> s.name);

-- 3. Staff display name follows the station they already belong to.
UPDATE `user` u JOIN `station` s ON s.id = u.station_id
   SET u.station = s.name
 WHERE u.role = 'staff' AND u.station_id <> '' AND u.station <> s.name;

SELECT ROW_COUNT() AS staff_station_names_updated;

COMMIT;
