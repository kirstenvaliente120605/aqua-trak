-- =============================================================================
-- create_tables.sql — Rebuild aquatracker MySQL database to exact ERD spec
-- Target: XAMPP MySQL (MariaDB) instance
-- Run: "C:\xampp\mysql\bin\mysql.exe" -u root aquatracker < create_tables.sql
-- This script drops existing tables, creates the database and all 15 ERD tables.
-- =============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------------
-- 1. users
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS `users`;
CREATE TABLE IF NOT EXISTS `users` (
  `id`            CHAR(36)     NOT NULL DEFAULT (UUID()),
  `email`         VARCHAR(190) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `role`          VARCHAR(50)  NOT NULL,
  `full_name`     VARCHAR(100) NOT NULL,
  `phone`         VARCHAR(40)  DEFAULT NULL,
  `remember_me`   TINYINT(1)   NOT NULL DEFAULT 0,
  `created_at`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_email` (`email`),
  KEY `ix_users_role` (`role`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 2. station_owners
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS `station_owners`;
CREATE TABLE IF NOT EXISTS `station_owners` (
  `id`            CHAR(36)     NOT NULL DEFAULT (UUID()),
  `user_id`       CHAR(36)     NOT NULL,
  `business_name` VARCHAR(190) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_station_owners_user` (`user_id`),
  KEY `ix_station_owners_user` (`user_id`),
  CONSTRAINT `fk_station_owners_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 3. notifications
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS `notifications`;
CREATE TABLE IF NOT EXISTS `notifications` (
  `id`            CHAR(36)     NOT NULL DEFAULT (UUID()),
  `user_id`       CHAR(36)     NOT NULL,
  `title`         VARCHAR(190) NOT NULL,
  `body`          TEXT         NOT NULL,
  `read`          TINYINT(1)   NOT NULL DEFAULT 0,
  `created_at`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_notifications_user` (`user_id`),
  KEY `ix_notifications_read` (`read`),
  CONSTRAINT `fk_notifications_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 4. rewards
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS `rewards`;
CREATE TABLE IF NOT EXISTS `rewards` (
  `id`              CHAR(36)     NOT NULL DEFAULT (UUID()),
  `owner_id`        CHAR(36)     NOT NULL,
  `title`           VARCHAR(190) NOT NULL,
  `description`     VARCHAR(255) NOT NULL,
  `status`          VARCHAR(40)  NOT NULL DEFAULT 'active',
  PRIMARY KEY (`id`),
  KEY `ix_rewards_owner` (`owner_id`),
  CONSTRAINT `fk_rewards_owner`
    FOREIGN KEY (`owner_id`) REFERENCES `station_owners` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 5. stations
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS `stations`;
CREATE TABLE IF NOT EXISTS `stations` (
  `id`              CHAR(36)     NOT NULL DEFAULT (UUID()),
  `owner_id`        CHAR(36)     NOT NULL,
  `name`            VARCHAR(190) NOT NULL,
  `address`         VARCHAR(255) NOT NULL,
  `lat`             DECIMAL(10,7) DEFAULT NULL,
  `lng`             DECIMAL(10,7) DEFAULT NULL,
  `operating_hours` JSON         DEFAULT NULL,
  `status`          VARCHAR(40)  NOT NULL DEFAULT 'open',
  PRIMARY KEY (`id`),
  KEY `ix_stations_owner` (`owner_id`),
  KEY `ix_stations_lat_lng` (`lat`,`lng`),
  CONSTRAINT `fk_stations_owner`
    FOREIGN KEY (`owner_id`) REFERENCES `station_owners` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 6. promotions
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS `promotions`;
CREATE TABLE IF NOT EXISTS `promotions` (
  `id`            CHAR(36)     NOT NULL DEFAULT (UUID()),
  `owner_id`      CHAR(36)     NOT NULL,
  `code`          VARCHAR(50)  NOT NULL,
  `type`          VARCHAR(40)  NOT NULL,
  `value`         DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `expires_at`    DATE         DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_promotions_code` (`code`),
  KEY `ix_promotions_owner` (`owner_id`),
  CONSTRAINT `fk_promotions_owner`
    FOREIGN KEY (`owner_id`) REFERENCES `station_owners` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 7. customers
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS `customers`;
CREATE TABLE IF NOT EXISTS `customers` (
  `id`              CHAR(36)     NOT NULL DEFAULT (UUID()),
  `user_id`         CHAR(36)     NOT NULL,
  `default_address` VARCHAR(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_customers_user` (`user_id`),
  KEY `ix_customers_user` (`user_id`),
  CONSTRAINT `fk_customers_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 8. customer_rewards
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS `customer_rewards`;
CREATE TABLE IF NOT EXISTS `customer_rewards` (
  `id`            CHAR(36)     NOT NULL DEFAULT (UUID()),
  `customer_id`   CHAR(36)     NOT NULL,
  `reward_id`     CHAR(36)     NOT NULL,
  `points`        INT          NOT NULL DEFAULT 0,
  `reason`        VARCHAR(255) DEFAULT NULL,
  `earned_at`     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_customer_rewards_customer` (`customer_id`),
  KEY `ix_customer_rewards_reward` (`reward_id`),
  CONSTRAINT `fk_customer_rewards_customer`
    FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`)
    ON DELETE CASCADE,
  CONSTRAINT `fk_customer_rewards_reward`
    FOREIGN KEY (`reward_id`) REFERENCES `rewards` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 9. products
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS `products`;
CREATE TABLE IF NOT EXISTS `products` (
  `id`            CHAR(36)     NOT NULL DEFAULT (UUID()),
  `station_id`    CHAR(36)     NOT NULL,
  `name`          VARCHAR(190) NOT NULL,
  `unit`          VARCHAR(40)  NOT NULL DEFAULT 'unit',
  `stock_qty`     INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `ix_products_station` (`station_id`),
  CONSTRAINT `fk_products_station`
    FOREIGN KEY (`station_id`) REFERENCES `stations` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 10. pricing
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS `pricing`;
CREATE TABLE IF NOT EXISTS `pricing` (
  `id`            CHAR(36)     NOT NULL DEFAULT (UUID()),
  `product_id`    CHAR(36)     NOT NULL,
  `price`         DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `effective_from` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_pricing_product` (`product_id`),
  CONSTRAINT `fk_pricing_product`
    FOREIGN KEY (`product_id`) REFERENCES `products` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 11. subscription_plans
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS `subscription_plans`;
CREATE TABLE IF NOT EXISTS `subscription_plans` (
  `id`              CHAR(36)     NOT NULL DEFAULT (UUID()),
  `station_id`      CHAR(36)     NOT NULL,
  `name`            VARCHAR(190) NOT NULL,
  `gallons_included` INT         NOT NULL DEFAULT 0,
  `discount_percent` DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  `frequency`       VARCHAR(20)  NOT NULL DEFAULT 'monthly',
  `status`          VARCHAR(40)  NOT NULL DEFAULT 'active',
  PRIMARY KEY (`id`),
  KEY `ix_subscription_plans_station` (`station_id`),
  CONSTRAINT `fk_subscription_plans_station`
    FOREIGN KEY (`station_id`) REFERENCES `stations` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 12. subscriptions
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS `subscriptions`;
CREATE TABLE IF NOT EXISTS `subscriptions` (
  `id`              CHAR(36)     NOT NULL DEFAULT (UUID()),
  `customer_id`     CHAR(36)     NOT NULL,
  `plan_id`         CHAR(36)     NOT NULL,
  `start_date`      DATE         DEFAULT NULL,
  `next_delivery`   DATE         DEFAULT NULL,
  `status`          VARCHAR(40)  NOT NULL DEFAULT 'active',
  PRIMARY KEY (`id`),
  KEY `ix_subscriptions_customer` (`customer_id`),
  KEY `ix_subscriptions_plan` (`plan_id`),
  CONSTRAINT `fk_subscriptions_customer`
    FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`)
    ON DELETE CASCADE,
  CONSTRAINT `fk_subscriptions_plan`
    FOREIGN KEY (`plan_id`) REFERENCES `subscription_plans` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 13. orders
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS `orders`;
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
    FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`)
    ON DELETE CASCADE,
  CONSTRAINT `fk_orders_station`
    FOREIGN KEY (`station_id`) REFERENCES `stations` (`id`)
    ON DELETE CASCADE,
  CONSTRAINT `fk_orders_promotion`
    FOREIGN KEY (`promotion_id`) REFERENCES `promotions` (`id`)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 14. order_items
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS `order_items`;
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
    FOREIGN KEY (`product_id`) REFERENCES `products` (`id`)
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 15. staff
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS `staff`;
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
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON DELETE CASCADE,
  CONSTRAINT `fk_staff_station`
    FOREIGN KEY (`station_id`) REFERENCES `stations` (`id`)
    ON DELETE CASCADE,
  CONSTRAINT `fk_staff_approved_by`
    FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;