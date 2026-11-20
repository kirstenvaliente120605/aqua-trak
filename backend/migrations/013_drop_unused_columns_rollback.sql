-- Rollback for 013 — restore the six removed columns with their original
-- definitions. Re-created columns are empty; values written before the drop
-- (reward.required_purchases, customer.default_address, remember_me,
-- customer_reward.reason, subscription.start_date) are not recoverable.

ALTER TABLE `order` ADD COLUMN `promotion_id` CHAR(36) DEFAULT NULL;
ALTER TABLE `order` ADD KEY `promotion_id` (`promotion_id`);
ALTER TABLE `order` ADD CONSTRAINT `order_ibfk_3`
  FOREIGN KEY (`promotion_id`) REFERENCES `promotion` (`id`);

ALTER TABLE `customer_reward` ADD COLUMN `reason` VARCHAR(255) DEFAULT NULL;
ALTER TABLE `subscription` ADD COLUMN `start_date` DATE DEFAULT NULL;
ALTER TABLE `reward` ADD COLUMN `required_purchases` INT DEFAULT NULL;
ALTER TABLE `user` ADD COLUMN `remember_me` TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE `customer` ADD COLUMN `default_address` VARCHAR(255) DEFAULT NULL;
