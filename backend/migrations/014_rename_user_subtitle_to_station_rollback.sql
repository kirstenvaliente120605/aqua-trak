-- Rollback for 014 — rename USER.station back to USER.subtitle.
--
-- Values and the column definition are preserved; only the name and position
-- change back. Safe to re-run, guarded like the forward migration.

SET @schema = DATABASE();

SET @has_station  = (SELECT COUNT(*) FROM information_schema.columns
                      WHERE table_schema = @schema AND table_name = 'user'
                        AND column_name = 'station');
SET @has_subtitle = (SELECT COUNT(*) FROM information_schema.columns
                      WHERE table_schema = @schema AND table_name = 'user'
                        AND column_name = 'subtitle');

SET @sql = IF(@has_station > 0 AND @has_subtitle = 0,
  'ALTER TABLE `user` CHANGE COLUMN `station` `subtitle` VARCHAR(190) NOT NULL DEFAULT '''' AFTER `created_at`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT COUNT(*) AS user_has_subtitle
  FROM information_schema.columns
 WHERE table_schema = @schema AND table_name = 'user' AND column_name = 'subtitle';
