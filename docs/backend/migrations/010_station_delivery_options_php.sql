-- PHP/ERD schema: older seed runs may have generated station IDs, so match
-- known catalogue entries by both ID and name.
-- Add the capability column only when absent; preserve existing owner choices.
SET @station_delivery_missing = NOT EXISTS (
  SELECT 1
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'station'
    AND column_name = 'delivery'
);

SET @station_delivery_sql = IF(
  @station_delivery_missing,
  'ALTER TABLE `station` ADD COLUMN `delivery` TINYINT(1) NOT NULL DEFAULT 0 AFTER `status`',
  'SELECT 1'
);
PREPARE station_delivery_stmt FROM @station_delivery_sql;
EXECUTE station_delivery_stmt;
DEALLOCATE PREPARE station_delivery_stmt;

-- Preserve existing owner choices; seed the known demo stations only when
-- the delivery column was newly introduced.
UPDATE `station`
SET `delivery` = CASE
  WHEN `id` IN ('drink-refill', 'waterpol', 'aquater', 'alka')
    OR `name` LIKE 'DRINK n%REFILL%'
    OR `name` = 'Waterpol Water Refilling Station'
    OR `name` LIKE 'Aqua%Ter SMN%'
    OR `name` = 'Alka Water Refilling Station'
  THEN 1
  ELSE 0
END
WHERE @station_delivery_missing;

SET @station_delivery_fee_missing = NOT EXISTS (
  SELECT 1
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'station'
    AND column_name = 'delivery_fee'
);

SET @station_delivery_sql = IF(
  @station_delivery_fee_missing,
  'ALTER TABLE `station` ADD COLUMN `delivery_fee` DECIMAL(10,2) NOT NULL DEFAULT 15.00',
  'SELECT 1'
);
PREPARE station_delivery_stmt FROM @station_delivery_sql;
EXECUTE station_delivery_stmt;
DEALLOCATE PREPARE station_delivery_stmt;

UPDATE `station`
SET `delivery_fee` = 0.00
WHERE `delivery` = 0;
