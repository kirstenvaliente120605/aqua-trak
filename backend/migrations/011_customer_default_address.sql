-- The PHP signup flow creates a customer profile with an empty default address.
-- Older ERD databases may lack this column even though the current schema has it.
SET @default_address_missing = NOT EXISTS (
  SELECT 1
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'customer'
    AND column_name = 'default_address'
);

SET @customer_address_sql = IF(
  @default_address_missing,
  'ALTER TABLE `customer` ADD COLUMN `default_address` VARCHAR(255) NULL DEFAULT NULL AFTER `user_id`',
  'SELECT 1'
);
PREPARE customer_address_stmt FROM @customer_address_sql;
EXECUTE customer_address_stmt;
DEALLOCATE PREPARE customer_address_stmt;
