-- Express schema: `delivery` already stores the station capability.
-- Preserve the existing ₱15 delivery charge for enabled stations and use zero
-- for pickup-only stations.
ALTER TABLE `stations`
  ADD COLUMN `delivery_fee` DECIMAL(10,2) NOT NULL DEFAULT 15.00 AFTER `delivery`;

UPDATE `stations`
SET `delivery_fee` = 0.00
WHERE `delivery` = 0;
