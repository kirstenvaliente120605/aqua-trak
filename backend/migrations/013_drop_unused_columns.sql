-- 013 — drop columns that are never read by the application.
--
-- Approved items: ORDER.promotion_id, CUSTOMER_REWARD.reason,
-- SUBSCRIPTION.start_date, REWARD.required_purchases, USER.remember_me,
-- CUSTOMER.default_address.
--
-- Safe to re-run: every drop is guarded. Back up the database first.

SET @schema = DATABASE();

-- ---------------------------------------------------------------------------
-- ORDER.promotion_id — always written as NULL and never read. The FK and its
-- index must go before the column.
-- ---------------------------------------------------------------------------
SET @sql = IF((SELECT COUNT(*) FROM information_schema.table_constraints
                WHERE constraint_schema = @schema AND table_name = 'order'
                  AND constraint_name = 'order_ibfk_3' AND constraint_type = 'FOREIGN KEY') > 0,
  'ALTER TABLE `order` DROP FOREIGN KEY `order_ibfk_3`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.statistics
                WHERE table_schema = @schema AND table_name = 'order' AND index_name = 'promotion_id') > 0,
  'ALTER TABLE `order` DROP INDEX `promotion_id`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns
                WHERE table_schema = @schema AND table_name = 'order' AND column_name = 'promotion_id') > 0,
  'ALTER TABLE `order` DROP COLUMN `promotion_id`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- CUSTOMER_REWARD.reason — written as 'Redeemed', never read.
-- ---------------------------------------------------------------------------
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns
                WHERE table_schema = @schema AND table_name = 'customer_reward' AND column_name = 'reason') > 0,
  'ALTER TABLE `customer_reward` DROP COLUMN `reason`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- SUBSCRIPTION.start_date — written as CURDATE(), never read.
-- ---------------------------------------------------------------------------
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns
                WHERE table_schema = @schema AND table_name = 'subscription' AND column_name = 'start_date') > 0,
  'ALTER TABLE `subscription` DROP COLUMN `start_date`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- REWARD.required_purchases — seeded as 0, never read or displayed.
-- ---------------------------------------------------------------------------
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns
                WHERE table_schema = @schema AND table_name = 'reward' AND column_name = 'required_purchases') > 0,
  'ALTER TABLE `reward` DROP COLUMN `required_purchases`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- USER.remember_me — written, never read; the feature is removed from the UI.
-- ---------------------------------------------------------------------------
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns
                WHERE table_schema = @schema AND table_name = 'user' AND column_name = 'remember_me') > 0,
  'ALTER TABLE `user` DROP COLUMN `remember_me`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- CUSTOMER.default_address — written by the removed profile-address endpoint,
-- never read back (checkout uses the submitted delivery address).
-- ---------------------------------------------------------------------------
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns
                WHERE table_schema = @schema AND table_name = 'customer' AND column_name = 'default_address') > 0,
  'ALTER TABLE `customer` DROP COLUMN `default_address`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
