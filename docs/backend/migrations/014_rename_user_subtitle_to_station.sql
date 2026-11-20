-- 014 — rename USER.subtitle to USER.station.
--
-- `subtitle` held the display label under the account name (station name for
-- owners, a placeholder for staff, "Customer account" for customers). The name
-- `station` describes what it actually carries, and the old `station` column was
-- dropped in 012, so the name is free.
--
-- CHANGE COLUMN (not RENAME COLUMN) is used so the definition stays explicit:
-- varchar(190) NOT NULL DEFAULT '' utf8mb4_general_ci, same position as before.
-- Safe to re-run: the rename is guarded by an information_schema check.
-- Back up the database first.

SET @schema = DATABASE();

SET @has_subtitle = (SELECT COUNT(*) FROM information_schema.columns
                      WHERE table_schema = @schema AND table_name = 'user'
                        AND column_name = 'subtitle');
SET @has_station  = (SELECT COUNT(*) FROM information_schema.columns
                      WHERE table_schema = @schema AND table_name = 'user'
                        AND column_name = 'station');

SET @sql = IF(@has_subtitle > 0 AND @has_station = 0,
  'ALTER TABLE `user` CHANGE COLUMN `subtitle` `station` VARCHAR(190) NOT NULL DEFAULT '''' AFTER `created_at`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT COUNT(*) AS user_has_station
  FROM information_schema.columns
 WHERE table_schema = @schema AND table_name = 'user' AND column_name = 'station';
