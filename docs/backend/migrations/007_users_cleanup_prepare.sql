-- Phase 1: preserve legacy values and normalize user data before removing
-- columns. Review the audit SELECTs before applying 008_users_cleanup_finalize.sql.

ALTER TABLE `users`
  ADD COLUMN `full_name` VARCHAR(100) NOT NULL DEFAULT '' AFTER `auth_version`;

UPDATE `users`
SET `full_name` = TRIM(`name`)
WHERE TRIM(`full_name`) = '' AND TRIM(`name`) <> '';

-- Strip the display prefix only when the cleaned value is a real station ID.
UPDATE `users` u
JOIN `stations` s
  ON s.`id` = TRIM(SUBSTRING(TRIM(u.`station_id`), 5))
SET u.`station_id` = s.`id`
WHERE LOWER(LEFT(TRIM(u.`station_id`), 4)) = 'stn ';

-- Map legacy station names to IDs where the match is exact (case-insensitive).
UPDATE `users` u
JOIN `stations` s
  ON LOWER(TRIM(s.`name`)) = LOWER(TRIM(u.`station`))
SET u.`station_id` = s.`id`
WHERE (u.`station_id` IS NULL OR TRIM(u.`station_id`) = ''
       OR NOT EXISTS (
         SELECT 1 FROM `stations` assigned WHERE assigned.`id` = u.`station_id`
       ))
  AND TRIM(u.`station`) <> '';

UPDATE `users` u
JOIN `stations` s
  ON s.`id` = TRIM(SUBSTRING(TRIM(u.`station`), 5))
SET u.`station_id` = s.`id`
WHERE LOWER(LEFT(TRIM(u.`station`), 4)) = 'stn '
  AND (u.`station_id` IS NULL OR TRIM(u.`station_id`) = ''
       OR NOT EXISTS (
         SELECT 1 FROM `stations` assigned WHERE assigned.`id` = u.`station_id`
       ));

-- These demo assignments are known to use the drink-refill station.
UPDATE `users` u
JOIN `stations` s ON s.`id` = 'drink-refill'
SET u.`station_id` = s.`id`
WHERE u.`email` IN ('owner.demo@example.com', 'staff.demo@example.com')
  AND (u.`station_id` IS NULL OR TRIM(u.`station_id`) = ''
       OR NOT EXISTS (
         SELECT 1 FROM `stations` assigned WHERE assigned.`id` = u.`station_id`
       ));

ALTER TABLE `users`
  MODIFY COLUMN `station_id` VARCHAR(64) NULL DEFAULT NULL;

UPDATE `users`
SET `station_id` = NULL
WHERE TRIM(COALESCE(`station_id`, '')) = '';

-- The active application currently grants these three permissions to staff;
-- all non-staff accounts have no permissions.
UPDATE `users`
SET `permissions` = CASE
  WHEN `role` = 'staff' THEN '["orders","inventory","requests"]'
  ELSE NULL
END;

-- All three result sets must be empty before running the finalization
-- migration. Manually map unresolved users to a real stations.id first.
SELECT `id`, `email`, `role`, `station`, `station_id`
FROM `users`
WHERE `role` IN ('owner', 'staff')
  AND (`station_id` IS NULL OR NOT EXISTS (
    SELECT 1 FROM `stations` s WHERE s.`id` = `users`.`station_id`
  ));

SELECT `id`, `email`, `station_id`
FROM `users`
WHERE `station_id` IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM `stations` s WHERE s.`id` = `users`.`station_id`
  );

SELECT `id`, `email`, `role`
FROM `users`
WHERE TRIM(`full_name`) = '';
