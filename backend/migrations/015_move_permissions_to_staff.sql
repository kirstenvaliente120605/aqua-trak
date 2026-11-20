-- 015 — move account permissions from USER to STAFF.
--
-- Permissions describe what a station staff member may do, so they belong on
-- the STAFF row (which already carries the station and the approving owner)
-- rather than on the login account. Owners and customers carry no permission
-- list: the frontend falls back to the role defaults in roles.js.
--
-- Order matters: add + backfill strictly before the old column is dropped, so a
-- failure halfway leaves the data reachable. Safe to re-run: every step is
-- guarded. Back up the database first.

SET @schema = DATABASE();

-- 1. STAFF.permissions
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns
                WHERE table_schema = @schema AND table_name = 'staff'
                  AND column_name = 'permissions') = 0,
  'ALTER TABLE `staff` ADD COLUMN `permissions` TEXT NULL AFTER `status`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. Backfill from USER.permissions while that column still exists.
SET @has_user_permissions = (SELECT COUNT(*) FROM information_schema.columns
                              WHERE table_schema = @schema AND table_name = 'user'
                                AND column_name = 'permissions');

SET @sql = IF(@has_user_permissions > 0,
  'UPDATE `staff` st JOIN `user` u ON u.id = st.user_id
      SET st.permissions = u.permissions
    WHERE st.permissions IS NULL AND u.permissions IS NOT NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. Every STAFF row keeps a JSON array, never NULL or malformed text.
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns
                WHERE table_schema = @schema AND table_name = 'staff'
                  AND column_name = 'permissions') > 0,
  'UPDATE `staff` SET `permissions` = ''[]''
    WHERE `permissions` IS NULL OR JSON_VALID(`permissions`) IS NOT TRUE',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 4. Drop the old column now that STAFF owns the data.
SET @sql = IF(@has_user_permissions > 0,
  'ALTER TABLE `user` DROP COLUMN `permissions`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT COUNT(*) AS staff_rows_with_permissions
  FROM `staff` WHERE `permissions` IS NOT NULL;
SELECT COUNT(*) AS user_still_has_permissions
  FROM information_schema.columns
 WHERE table_schema = @schema AND table_name = 'user' AND column_name = 'permissions';
