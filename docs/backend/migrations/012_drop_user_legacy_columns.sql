-- 012 — drop the legacy columns from the singular `user` table.
--
-- Safe to re-run: every drop is guarded against databases that already lost
-- one or more of these columns. Back up the database before applying.

SET @schema = DATABASE();

-- name (display names live in full_name)
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns
                WHERE table_schema = @schema AND table_name = 'user' AND column_name = 'name') > 0,
  'ALTER TABLE `user` DROP COLUMN `name`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ix_users_station (only present on the old plural-derived schema)
SET @sql = IF((SELECT COUNT(*) FROM information_schema.statistics
                WHERE table_schema = @schema AND table_name = 'user' AND index_name = 'ix_users_station') > 0,
  'ALTER TABLE `user` DROP INDEX `ix_users_station`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- station (station names come from STATION via station_id)
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns
                WHERE table_schema = @schema AND table_name = 'user' AND column_name = 'station') > 0,
  'ALTER TABLE `user` DROP COLUMN `station`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- location (never populated, never returned by the API)
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns
                WHERE table_schema = @schema AND table_name = 'user' AND column_name = 'location') > 0,
  'ALTER TABLE `user` DROP COLUMN `location`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- reviewed_at (staff-approval audit timestamps; not read by the application)
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns
                WHERE table_schema = @schema AND table_name = 'user' AND column_name = 'reviewed_at') > 0,
  'ALTER TABLE `user` DROP COLUMN `reviewed_at`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
