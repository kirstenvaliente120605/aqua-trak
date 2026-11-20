-- Rollback for 015 — put permissions back on USER.
--
-- STAFF.permissions is copied to USER.permissions for the accounts that have a
-- STAFF row, then the STAFF column is dropped. Safe to re-run, guarded the same
-- way as the forward migration.

SET @schema = DATABASE();

-- 1. USER.permissions
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns
                WHERE table_schema = @schema AND table_name = 'user'
                  AND column_name = 'permissions') = 0,
  'ALTER TABLE `user` ADD COLUMN `permissions` TEXT NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. Copy the values back from STAFF.
SET @has_staff_permissions = (SELECT COUNT(*) FROM information_schema.columns
                               WHERE table_schema = @schema AND table_name = 'staff'
                                 AND column_name = 'permissions');

SET @sql = IF(@has_staff_permissions > 0,
  'UPDATE `user` u JOIN `staff` st ON st.user_id = u.id
      SET u.permissions = st.permissions
    WHERE st.permissions IS NOT NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Pending staff have no STAFF row yet, so their set comes from the same
-- role default the approval flow writes later.
UPDATE `user` SET `permissions` = '["orders","inventory","requests"]'
 WHERE `role` = 'staff'
   AND NOT EXISTS (SELECT 1 FROM `staff` st WHERE st.user_id = `user`.`id`)
   AND (`permissions` IS NULL OR JSON_VALID(`permissions`) IS NOT TRUE);

UPDATE `user` SET `permissions` = '[]'
 WHERE `permissions` IS NULL OR JSON_VALID(`permissions`) IS NOT TRUE;

-- 3. Drop STAFF.permissions.
SET @sql = IF(@has_staff_permissions > 0,
  'ALTER TABLE `staff` DROP COLUMN `permissions`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT COUNT(*) AS user_permissions_rows
  FROM `user` WHERE `permissions` IS NOT NULL;
