SET FOREIGN_KEY_CHECKS=0;

DROP TABLE IF EXISTS `ORDER_ITEM`;
DROP TABLE IF EXISTS `ORDER`;
DROP TABLE IF EXISTS `SUBSCRIPTION`;
DROP TABLE IF EXISTS `PRICING`;
DROP TABLE IF EXISTS `STAFF`;
DROP TABLE IF EXISTS `PRODUCT`;
DROP TABLE IF EXISTS `CUSTOMER_REWARD`;
DROP TABLE IF EXISTS `NOTIFICATION`;
DROP TABLE IF EXISTS `PROMOTION`;
DROP TABLE IF EXISTS `REWARD`;
DROP TABLE IF EXISTS `SUBSCRIPTION_PLAN`;
DROP TABLE IF EXISTS `STATION`;
DROP TABLE IF EXISTS `CUSTOMER`;
DROP TABLE IF EXISTS `STATION_OWNER`;
DROP TABLE IF EXISTS `USER`;

CREATE TABLE `USER` (
  `id` CHAR(36) PRIMARY KEY,
  `email` VARCHAR(190) UNIQUE NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `email_verified` TINYINT(1) NOT NULL DEFAULT 1,
  `auth_version` INT UNSIGNED NOT NULL DEFAULT 1,
  `role` VARCHAR(50),
  `full_name` VARCHAR(100),
  `phone` VARCHAR(40),
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE `email_otps` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `email` VARCHAR(190) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `code_hash` VARCHAR(255) NOT NULL,
  `purpose` ENUM('verify_email','reset_password') NOT NULL,
  `expires_at` DATETIME NOT NULL,
  `attempts` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `used_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  KEY `ix_email_otps_email_purpose` (`email`,`purpose`,`id`),
  KEY `ix_email_otps_expiry` (`expires_at`),
  CONSTRAINT `fk_email_otps_user` FOREIGN KEY (`user_id`) REFERENCES `USER` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE `otp_rate_limits` (
  `scope` VARCHAR(8) NOT NULL,
  `key_hash` CHAR(64) NOT NULL,
  `action` VARCHAR(32) NOT NULL,
  `window_started_at` DATETIME NOT NULL,
  `request_count` INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (`scope`,`key_hash`,`action`)
) ENGINE=InnoDB;

CREATE TABLE `password_reset_tokens` (
  `token_hash` CHAR(64) NOT NULL,
  `email` VARCHAR(190) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `expires_at` DATETIME NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `used_at` DATETIME NULL,
  PRIMARY KEY (`token_hash`),
  KEY `ix_password_reset_tokens_user` (`user_id`),
  KEY `ix_password_reset_tokens_expiry` (`expires_at`),
  CONSTRAINT `fk_password_reset_tokens_user` FOREIGN KEY (`user_id`) REFERENCES `USER` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE `STATION_OWNER` (
  `id` CHAR(36) PRIMARY KEY,
  `user_id` CHAR(36),
  `business_name` VARCHAR(190),
  FOREIGN KEY (`user_id`) REFERENCES `USER`(`id`)
) ENGINE=InnoDB;

CREATE TABLE `CUSTOMER` (
  `id` CHAR(36) PRIMARY KEY,
  `user_id` CHAR(36),
  `aqua_points` INT DEFAULT 0,
  FOREIGN KEY (`user_id`) REFERENCES `USER`(`id`)
) ENGINE=InnoDB;

CREATE TABLE `STATION` (
  `id` CHAR(36) PRIMARY KEY,
  `owner_id` CHAR(36),
  `name` VARCHAR(190),
  `address` VARCHAR(255),
  `lat` DECIMAL(10,7),
  `lng` DECIMAL(10,7),
  `operating_hours` JSON,
  `status` VARCHAR(50),
  `delivery` TINYINT(1) NOT NULL DEFAULT 0,
  `delivery_fee` DECIMAL(10,2) NOT NULL DEFAULT 15.00,
  FOREIGN KEY (`owner_id`) REFERENCES `STATION_OWNER`(`id`)
) ENGINE=InnoDB;

CREATE TABLE `REWARD` (
  `id` CHAR(36) PRIMARY KEY,
  `owner_id` CHAR(36),
  `name` VARCHAR(190),
  `reward_description` TEXT,
  `status` VARCHAR(50),
  `code` VARCHAR(100) NULL,
  `points_cost` INT NULL,
  `category` VARCHAR(50) NULL,
  FOREIGN KEY (`owner_id`) REFERENCES `STATION_OWNER`(`id`)
) ENGINE=InnoDB;

CREATE TABLE `PROMOTION` (
  `id` CHAR(36) PRIMARY KEY,
  `owner_id` CHAR(36),
  `code` VARCHAR(100) UNIQUE,
  `type` VARCHAR(50),
  `value` DECIMAL(10,2),
  `expires_at` DATE,
  FOREIGN KEY (`owner_id`) REFERENCES `STATION_OWNER`(`id`)
) ENGINE=InnoDB;

CREATE TABLE `NOTIFICATION` (
  `id` CHAR(36) PRIMARY KEY,
  `user_id` CHAR(36),
  `title` VARCHAR(190),
  `body` TEXT,
  `read` TINYINT(1) DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `USER`(`id`)
) ENGINE=InnoDB;

CREATE TABLE `CUSTOMER_REWARD` (
  `id` CHAR(36) PRIMARY KEY,
  `customer_id` CHAR(36),
  `reward_id` CHAR(36),
  `points` INT,
  `earned_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`customer_id`) REFERENCES `CUSTOMER`(`id`),
  FOREIGN KEY (`reward_id`) REFERENCES `REWARD`(`id`)
) ENGINE=InnoDB;

CREATE TABLE `PRODUCT` (
  `id` CHAR(36) PRIMARY KEY,
  `station_id` CHAR(36),
  `name` VARCHAR(190),
  `unit` VARCHAR(50),
  `stock_qty` INT DEFAULT 0,
  `type` VARCHAR(50) NULL,
  FOREIGN KEY (`station_id`) REFERENCES `STATION`(`id`)
) ENGINE=InnoDB;

CREATE TABLE `SUBSCRIPTION_PLAN` (
  `id` CHAR(36) PRIMARY KEY,
  `station_id` CHAR(36),
  `name` VARCHAR(190),
  `gallons_included` INT,
  `price` DECIMAL(10,2),
  `frequency` VARCHAR(50),
  `status` VARCHAR(50),
  FOREIGN KEY (`station_id`) REFERENCES `STATION`(`id`)
) ENGINE=InnoDB;

CREATE TABLE `ORDER` (
  `id` CHAR(36) PRIMARY KEY,
  `customer_id` CHAR(36),
  `station_id` CHAR(36),
  `type` VARCHAR(50),
  `status` VARCHAR(50),
  `total` DECIMAL(10,2),
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `meta` JSON NULL,
  FOREIGN KEY (`customer_id`) REFERENCES `CUSTOMER`(`id`),
  FOREIGN KEY (`station_id`) REFERENCES `STATION`(`id`)
) ENGINE=InnoDB;

CREATE TABLE `STAFF` (
  `id` CHAR(36) PRIMARY KEY,
  `user_id` CHAR(36),
  `station_id` CHAR(36),
  `approved_by` CHAR(36),
  `status` VARCHAR(50),
  FOREIGN KEY (`user_id`) REFERENCES `USER`(`id`),
  FOREIGN KEY (`station_id`) REFERENCES `STATION`(`id`),
  FOREIGN KEY (`approved_by`) REFERENCES `USER`(`id`)
) ENGINE=InnoDB;

CREATE TABLE `PRICING` (
  `id` CHAR(36) PRIMARY KEY,
  `product_id` CHAR(36),
  `price` DECIMAL(10,2),
  `effective_from` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`product_id`) REFERENCES `PRODUCT`(`id`)
) ENGINE=InnoDB;

CREATE TABLE `SUBSCRIPTION` (
  `id` CHAR(36) PRIMARY KEY,
  `customer_id` CHAR(36),
  `plan_id` CHAR(36),
  `next_delivery` DATE,
  `status` VARCHAR(50),
  `meta` JSON NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`customer_id`) REFERENCES `CUSTOMER`(`id`),
  FOREIGN KEY (`plan_id`) REFERENCES `SUBSCRIPTION_PLAN`(`id`)
) ENGINE=InnoDB;

CREATE TABLE `ORDER_ITEM` (
  `id` CHAR(36) PRIMARY KEY,
  `order_id` CHAR(36),
  `product_id` CHAR(36),
  `qty` INT,
  `unit_price` DECIMAL(10,2),
  FOREIGN KEY (`order_id`) REFERENCES `ORDER`(`id`),
  FOREIGN KEY (`product_id`) REFERENCES `PRODUCT`(`id`)
) ENGINE=InnoDB;

SET FOREIGN_KEY_CHECKS=1;
