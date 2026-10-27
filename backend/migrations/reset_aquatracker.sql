-- =============================================================================
-- reset_aquatracker.sql — Complete wipe + rebuild of XAMPP aquatracker database
-- Target: XAMPP MySQL (MariaDB) instance
-- Use with: mysql -u root < reset_aquatracker.sql
-- This script drops, recreates and populates the 15 ERD tables.
-- =============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP DATABASE IF EXISTS `aquatracker`;
CREATE DATABASE IF NOT EXISTS `aquatracker`
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
USE `aquatracker`;

-- ---------------------------------------------------------------------------
-- 1. USER
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `user` (
  `id`            CHAR(36)     NOT NULL DEFAULT (UUID()),
  `email`         VARCHAR(190) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `role`          VARCHAR(50)  NOT NULL,
  `full_name`     VARCHAR(100) NOT NULL,
  `phone`         VARCHAR(40)  DEFAULT NULL,
  `remember_me`   TINYINT(1)   NOT NULL DEFAULT 0,
  `created_at`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_user_email` (`email`),
  KEY `ix_user_role` (`role`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 2. STATION_OWNER (1:1 to user)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `station_owner` (
  `id`            CHAR(36)     NOT NULL DEFAULT (UUID()),
  `user_id`       CHAR(36)     NOT NULL,
  `business_name` VARCHAR(190) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_station_owner_user` (`user_id`),
  KEY `ix_station_owner_user` (`user_id`),
  CONSTRAINT `fk_station_owner_user`
    FOREIGN KEY (`user_id`) REFERENCES `user` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 3. NOTIFICATION (1:N from user)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `notification` (
  `id`            CHAR(36)     NOT NULL DEFAULT (UUID()),
  `user_id`       CHAR(36)     NOT NULL,
  `title`         VARCHAR(190) NOT NULL,
  `body`          TEXT         NOT NULL,
  `read`          TINYINT(1)   NOT NULL DEFAULT 0,
  `created_at`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_notification_user` (`user_id`),
  KEY `ix_notification_read` (`read`),
  CONSTRAINT `fk_notification_user`
    FOREIGN KEY (`user_id`) REFERENCES `user` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 4. REWARD (1:N from station_owner)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `reward` (
  `id`              CHAR(36)     NOT NULL DEFAULT (UUID()),
  `owner_id`        CHAR(36)     NOT NULL,
  `title`           VARCHAR(190) NOT NULL,
  `description`     VARCHAR(255) NOT NULL,
  `status`          VARCHAR(40)  NOT NULL DEFAULT 'active',
  PRIMARY KEY (`id`),
  KEY `ix_reward_owner` (`owner_id`),
  CONSTRAINT `fk_reward_owner`
    FOREIGN KEY (`owner_id`) REFERENCES `station_owner` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 5. STATION (1:N from station_owner)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `station` (
  `id`              CHAR(36)     NOT NULL DEFAULT (UUID()),
  `owner_id`        CHAR(36)     NOT NULL,
  `name`            VARCHAR(190) NOT NULL,
  `address`         VARCHAR(255) NOT NULL,
  `lat`             DECIMAL(10,7) DEFAULT NULL,
  `lng`             DECIMAL(10,7) DEFAULT NULL,
  `operating_hours` JSON         DEFAULT NULL,
  `status`          VARCHAR(40)  NOT NULL DEFAULT 'open',
  PRIMARY KEY (`id`),
  KEY `ix_station_owner` (`owner_id`),
  KEY `ix_station_lat_lng` (`lat`,`lng`),
  CONSTRAINT `fk_station_owner`
    FOREIGN KEY (`owner_id`) REFERENCES `station_owner` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 6. PROMOTION (1:N from station_owner; code UNIQUE)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `promotion` (
  `id`            CHAR(36)     NOT NULL DEFAULT (UUID()),
  `owner_id`      CHAR(36)     NOT NULL,
  `code`          VARCHAR(50)  NOT NULL,
  `type`          VARCHAR(40)  NOT NULL,
  `value`         DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `expires_at`    DATE         DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_promotion_code` (`code`),
  KEY `ix_promotion_owner` (`owner_id`),
  CONSTRAINT `fk_promotion_owner`
    FOREIGN KEY (`owner_id`) REFERENCES `station_owner` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 7. CUSTOMER (1:1 to user)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `customer` (
  `id`              CHAR(36)     NOT NULL DEFAULT (UUID()),
  `user_id`         CHAR(36)     NOT NULL,
  `default_address` VARCHAR(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_customer_user` (`user_id`),
  KEY `ix_customer_user` (`user_id`),
  CONSTRAINT `fk_customer_user`
    FOREIGN KEY (`user_id`) REFERENCES `user` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 8. CUSTOMER_REWARD (junction: customer + reward)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `customer_reward` (
  `id`            CHAR(36)     NOT NULL DEFAULT (UUID()),
  `customer_id`   CHAR(36)     NOT NULL,
  `reward_id`     CHAR(36)     NOT NULL,
  `points`        INT          NOT NULL DEFAULT 0,
  `reason`        VARCHAR(255) DEFAULT NULL,
  `earned_at`     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_customer_reward_customer` (`customer_id`),
  KEY `ix_customer_reward_reward` (`reward_id`),
  CONSTRAINT `fk_customer_reward_customer`
    FOREIGN KEY (`customer_id`) REFERENCES `customer` (`id`)
    ON DELETE CASCADE,
  CONSTRAINT `fk_customer_reward_reward`
    FOREIGN KEY (`reward_id`) REFERENCES `reward` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 9. PRODUCT (1:N from station)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `product` (
  `id`            CHAR(36)     NOT NULL DEFAULT (UUID()),
  `station_id`    CHAR(36)     NOT NULL,
  `name`          VARCHAR(190) NOT NULL,
  `unit`          VARCHAR(40)  NOT NULL DEFAULT 'unit',
  `stock_qty`     INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `ix_product_station` (`station_id`),
  CONSTRAINT `fk_product_station`
    FOREIGN KEY (`station_id`) REFERENCES `station` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 10. PRICING (1:N from product)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `pricing` (
  `id`            CHAR(36)     NOT NULL DEFAULT (UUID()),
  `product_id`    CHAR(36)     NOT NULL,
  `price`         DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `effective_from` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_pricing_product` (`product_id`),
  CONSTRAINT `fk_pricing_product`
    FOREIGN KEY (`product_id`) REFERENCES `product` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 11. SUBSCRIPTION_PLAN (1:N from station)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `subscription_plan` (
  `id`              CHAR(36)     NOT NULL DEFAULT (UUID()),
  `station_id`      CHAR(36)     NOT NULL,
  `name`            VARCHAR(190) NOT NULL,
  `gallons_included` INT         NOT NULL DEFAULT 0,
  `discount_percent` DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  `frequency`       VARCHAR(20)  NOT NULL DEFAULT 'monthly',
  `status`          VARCHAR(40)  NOT NULL DEFAULT 'active',
  PRIMARY KEY (`id`),
  KEY `ix_subscription_plan_station` (`station_id`),
  CONSTRAINT `fk_subscription_plan_station`
    FOREIGN KEY (`station_id`) REFERENCES `station` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 12. SUBSCRIPTION (1:N from customer; 1:N from subscription_plan)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `subscription` (
  `id`              CHAR(36)     NOT NULL DEFAULT (UUID()),
  `customer_id`     CHAR(36)     NOT NULL,
  `plan_id`         CHAR(36)     NOT NULL,
  `start_date`      DATE         DEFAULT NULL,
  `next_delivery`   DATE         DEFAULT NULL,
  `status`          VARCHAR(40)  NOT NULL DEFAULT 'active',
  PRIMARY KEY (`id`),
  KEY `ix_subscription_customer` (`customer_id`),
  KEY `ix_subscription_plan` (`plan_id`),
  CONSTRAINT `fk_subscription_customer`
    FOREIGN KEY (`customer_id`) REFERENCES `customer` (`id`)
    ON DELETE CASCADE,
  CONSTRAINT `fk_subscription_plan`
    FOREIGN KEY (`plan_id`) REFERENCES `subscription_plan` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 13. ORDERS (1:N from customer; 1:N from station; Nullable FK to promotion)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `orders` (
  `id`             CHAR(36)     NOT NULL DEFAULT (UUID()),
  `customer_id`    CHAR(36)     NOT NULL,
  `station_id`     CHAR(36)     NOT NULL,
  `promotion_id`   CHAR(36)     DEFAULT NULL,
  `type`           VARCHAR(40)  NOT NULL DEFAULT 'refill',
  `status`         VARCHAR(40)  NOT NULL DEFAULT 'New',
  `decimal`        DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `total`          DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `created_at`     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_orders_customer` (`customer_id`),
  KEY `ix_orders_station` (`station_id`),
  KEY `ix_orders_promotion` (`promotion_id`),
  KEY `ix_orders_status` (`status`),
  CONSTRAINT `fk_orders_customer`
    FOREIGN KEY (`customer_id`) REFERENCES `customer` (`id`)
    ON DELETE CASCADE,
  CONSTRAINT `fk_orders_station`
    FOREIGN KEY (`station_id`) REFERENCES `station` (`id`)
    ON DELETE CASCADE,
  CONSTRAINT `fk_orders_promotion`
    FOREIGN KEY (`promotion_id`) REFERENCES `promotion` (`id`)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 14. ORDER_ITEMS (junction: orders + product)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `order_items` (
  `id`            CHAR(36)     NOT NULL DEFAULT (UUID()),
  `order_id`      CHAR(36)     NOT NULL,
  `product_id`    CHAR(36)     NOT NULL,
  `qty`           INT          NOT NULL DEFAULT 1,
  `unit_price`    DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  PRIMARY KEY (`id`),
  KEY `ix_order_items_order` (`order_id`),
  KEY `ix_order_items_product` (`product_id`),
  CONSTRAINT `fk_order_items_order`
    FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`)
    ON DELETE CASCADE,
  CONSTRAINT `fk_order_items_product`
    FOREIGN KEY (`product_id`) REFERENCES `product` (`id`)
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 15. STAFF (1:1 to user; 1:N from station)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `staff` (
  `id`            CHAR(36)     NOT NULL DEFAULT (UUID()),
  `user_id`       CHAR(36)     NOT NULL,
  `station_id`    CHAR(36)     NOT NULL,
  `status`        VARCHAR(40)  NOT NULL DEFAULT 'pending',
  `approved_by`   CHAR(36)     DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_staff_user` (`user_id`),
  KEY `ix_staff_station` (`station_id`),
  KEY `ix_staff_approved_by` (`approved_by`),
  CONSTRAINT `fk_staff_user`
    FOREIGN KEY (`user_id`) REFERENCES `user` (`id`)
    ON DELETE CASCADE,
  CONSTRAINT `fk_staff_station`
    FOREIGN KEY (`station_id`) REFERENCES `station` (`id`)
    ON DELETE CASCADE,
  CONSTRAINT `fk_staff_approved_by`
    FOREIGN KEY (`approved_by`) REFERENCES `user` (`id`)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- =============================================================================
-- End of reset_aquatracker.sql
-- =============================================================================