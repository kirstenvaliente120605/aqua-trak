-- One-time migration for readable station IDs and owner names.
-- The owner_id column stays on each station row: one owner can own many
-- stations, while each station row points to exactly one owner.

SET FOREIGN_KEY_CHECKS = 0;

ALTER TABLE `station_owner`
  CHANGE COLUMN `business_name` `owner_name` VARCHAR(190) NOT NULL;

UPDATE `station_owner` so
JOIN `user` u ON u.`id` = so.`user_id`
SET so.`owner_name` = COALESCE(NULLIF(u.`full_name`, ''), NULLIF(u.`name`, ''), so.`owner_name`);

-- Move referencing columns through temporary IDs to avoid primary-key clashes.
UPDATE `order` SET `station_id` = CASE `station_id`
  WHEN 'aquater' THEN 'TMP_STN_001' WHEN 'drink-refill' THEN 'TMP_STN_002'
  WHEN 'pg-aquamaster' THEN 'TMP_STN_003' WHEN 'ph2o' THEN 'TMP_STN_004'
  WHEN 'station:0bc83e08-b813-4c07-9825-4f21' THEN 'TMP_STN_005'
  WHEN 'station:af497db4-6cee-487b-8b2f-3ed2' THEN 'TMP_STN_006'
  WHEN 'ultra-pure' THEN 'TMP_STN_007' WHEN 'waterpol' THEN 'TMP_STN_008'
  ELSE `station_id` END;
UPDATE `product` SET `station_id` = CASE `station_id`
  WHEN 'aquater' THEN 'TMP_STN_001' WHEN 'drink-refill' THEN 'TMP_STN_002'
  WHEN 'pg-aquamaster' THEN 'TMP_STN_003' WHEN 'ph2o' THEN 'TMP_STN_004'
  WHEN 'station:0bc83e08-b813-4c07-9825-4f21' THEN 'TMP_STN_005'
  WHEN 'station:af497db4-6cee-487b-8b2f-3ed2' THEN 'TMP_STN_006'
  WHEN 'ultra-pure' THEN 'TMP_STN_007' WHEN 'waterpol' THEN 'TMP_STN_008'
  ELSE `station_id` END;
UPDATE `staff` SET `station_id` = CASE `station_id`
  WHEN 'aquater' THEN 'TMP_STN_001' WHEN 'drink-refill' THEN 'TMP_STN_002'
  WHEN 'pg-aquamaster' THEN 'TMP_STN_003' WHEN 'ph2o' THEN 'TMP_STN_004'
  WHEN 'station:0bc83e08-b813-4c07-9825-4f21' THEN 'TMP_STN_005'
  WHEN 'station:af497db4-6cee-487b-8b2f-3ed2' THEN 'TMP_STN_006'
  WHEN 'ultra-pure' THEN 'TMP_STN_007' WHEN 'waterpol' THEN 'TMP_STN_008'
  ELSE `station_id` END;
UPDATE `subscription_plan` SET `station_id` = CASE `station_id`
  WHEN 'aquater' THEN 'TMP_STN_001' WHEN 'drink-refill' THEN 'TMP_STN_002'
  WHEN 'pg-aquamaster' THEN 'TMP_STN_003' WHEN 'ph2o' THEN 'TMP_STN_004'
  WHEN 'station:0bc83e08-b813-4c07-9825-4f21' THEN 'TMP_STN_005'
  WHEN 'station:af497db4-6cee-487b-8b2f-3ed2' THEN 'TMP_STN_006'
  WHEN 'ultra-pure' THEN 'TMP_STN_007' WHEN 'waterpol' THEN 'TMP_STN_008'
  ELSE `station_id` END;
UPDATE `user` SET `station_id` = CASE `station_id`
  WHEN 'aquater' THEN 'TMP_STN_001' WHEN 'drink-refill' THEN 'TMP_STN_002'
  WHEN 'pg-aquamaster' THEN 'TMP_STN_003' WHEN 'ph2o' THEN 'TMP_STN_004'
  WHEN 'station:0bc83e08-b813-4c07-9825-4f21' THEN 'TMP_STN_005'
  WHEN 'station:af497db4-6cee-487b-8b2f-3ed2' THEN 'TMP_STN_006'
  WHEN 'ultra-pure' THEN 'TMP_STN_007' WHEN 'waterpol' THEN 'TMP_STN_008'
  ELSE `station_id` END;

UPDATE `station` SET `id` = CASE `id`
  WHEN 'aquater' THEN 'TMP_STN_001' WHEN 'drink-refill' THEN 'TMP_STN_002'
  WHEN 'pg-aquamaster' THEN 'TMP_STN_003' WHEN 'ph2o' THEN 'TMP_STN_004'
  WHEN 'station:0bc83e08-b813-4c07-9825-4f21' THEN 'TMP_STN_005'
  WHEN 'station:af497db4-6cee-487b-8b2f-3ed2' THEN 'TMP_STN_006'
  WHEN 'ultra-pure' THEN 'TMP_STN_007' WHEN 'waterpol' THEN 'TMP_STN_008'
  ELSE `id` END;

UPDATE `order` SET `station_id` = CASE `station_id`
  WHEN 'TMP_STN_001' THEN 'STN_001' WHEN 'TMP_STN_002' THEN 'STN_002'
  WHEN 'TMP_STN_003' THEN 'STN_003' WHEN 'TMP_STN_004' THEN 'STN_004'
  WHEN 'TMP_STN_005' THEN 'STN_005' WHEN 'TMP_STN_006' THEN 'STN_006'
  WHEN 'TMP_STN_007' THEN 'STN_007' WHEN 'TMP_STN_008' THEN 'STN_008'
  ELSE `station_id` END;
UPDATE `product` SET `station_id` = CASE `station_id`
  WHEN 'TMP_STN_001' THEN 'STN_001' WHEN 'TMP_STN_002' THEN 'STN_002'
  WHEN 'TMP_STN_003' THEN 'STN_003' WHEN 'TMP_STN_004' THEN 'STN_004'
  WHEN 'TMP_STN_005' THEN 'STN_005' WHEN 'TMP_STN_006' THEN 'STN_006'
  WHEN 'TMP_STN_007' THEN 'STN_007' WHEN 'TMP_STN_008' THEN 'STN_008'
  ELSE `station_id` END;
UPDATE `staff` SET `station_id` = CASE `station_id`
  WHEN 'TMP_STN_001' THEN 'STN_001' WHEN 'TMP_STN_002' THEN 'STN_002'
  WHEN 'TMP_STN_003' THEN 'STN_003' WHEN 'TMP_STN_004' THEN 'STN_004'
  WHEN 'TMP_STN_005' THEN 'STN_005' WHEN 'TMP_STN_006' THEN 'STN_006'
  WHEN 'TMP_STN_007' THEN 'STN_007' WHEN 'TMP_STN_008' THEN 'STN_008'
  ELSE `station_id` END;
UPDATE `subscription_plan` SET `station_id` = CASE `station_id`
  WHEN 'TMP_STN_001' THEN 'STN_001' WHEN 'TMP_STN_002' THEN 'STN_002'
  WHEN 'TMP_STN_003' THEN 'STN_003' WHEN 'TMP_STN_004' THEN 'STN_004'
  WHEN 'TMP_STN_005' THEN 'STN_005' WHEN 'TMP_STN_006' THEN 'STN_006'
  WHEN 'TMP_STN_007' THEN 'STN_007' WHEN 'TMP_STN_008' THEN 'STN_008'
  ELSE `station_id` END;
UPDATE `user` SET `station_id` = CASE `station_id`
  WHEN 'TMP_STN_001' THEN 'STN_001' WHEN 'TMP_STN_002' THEN 'STN_002'
  WHEN 'TMP_STN_003' THEN 'STN_003' WHEN 'TMP_STN_004' THEN 'STN_004'
  WHEN 'TMP_STN_005' THEN 'STN_005' WHEN 'TMP_STN_006' THEN 'STN_006'
  WHEN 'TMP_STN_007' THEN 'STN_007' WHEN 'TMP_STN_008' THEN 'STN_008'
  ELSE `station_id` END;
UPDATE `station` SET `id` = CASE `id`
  WHEN 'TMP_STN_001' THEN 'STN_001' WHEN 'TMP_STN_002' THEN 'STN_002'
  WHEN 'TMP_STN_003' THEN 'STN_003' WHEN 'TMP_STN_004' THEN 'STN_004'
  WHEN 'TMP_STN_005' THEN 'STN_005' WHEN 'TMP_STN_006' THEN 'STN_006'
  WHEN 'TMP_STN_007' THEN 'STN_007' WHEN 'TMP_STN_008' THEN 'STN_008'
  ELSE `id` END;

CREATE TABLE IF NOT EXISTS `id_sequence` (
  `name` VARCHAR(32) NOT NULL,
  `value` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO `id_sequence` (`name`, `value`) VALUES ('stations', 8)
  ON DUPLICATE KEY UPDATE `value` = GREATEST(`value`, 8);

SET FOREIGN_KEY_CHECKS = 1;
