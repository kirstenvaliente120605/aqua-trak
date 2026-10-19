-- ============================================================================
-- AquaTracker Database Schema — FULL ERD (corrected import order + exact FKs)
-- Database: aquatracker  |  Charset: utf8mb4 / utf8mb4_general_ci  |  Engine: InnoDB
-- Reserved: table `orders`, column `is_read` (avoids reserved `read`)
-- All PK/FK = CHAR(36) UUID, exact match, tables created in dependency order.
-- ============================================================================

CREATE DATABASE IF NOT EXISTS `aquatracker`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_general_ci;

USE `aquatracker`;

-- ============================================================================
-- 1. users (parent — must exist first for all FKs)
-- ============================================================================
CREATE TABLE IF NOT EXISTS `users` (
  `id`            CHAR(36)     NOT NULL DEFAULT (UUID()),
  `email`         VARCHAR(190) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `role`          ENUM('customer','owner','staff') NOT NULL,
  `full_name`     VARCHAR(100) NOT NULL,
  `phone`         VARCHAR(40)  DEFAULT NULL,
  `remember_me`   TINYINT(1)   NOT NULL DEFAULT 0,
  `created_at`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_email` (`email`),
  KEY `ix_users_role` (`role`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ============================================================================
-- 2. station_owners (FK to users; parent to stations/rewards/promotions)
-- ============================================================================
CREATE TABLE IF NOT EXISTS `station_owners` (
  `id`            CHAR(36)     NOT NULL DEFAULT (UUID()),
  `user_id`       CHAR(36)     NOT NULL,
  `business_name` VARCHAR(190) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_station_owner_user` (`user_id`),
  KEY `ix_station_owner_user` (`user_id`),
  CONSTRAINT `fk_station_owner_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ============================================================================
-- 3. customers (FK to users; parent to orders/subscriptions/customer_rewards)
-- ============================================================================
CREATE TABLE IF NOT EXISTS `customers` (
  `id`              CHAR(36)     NOT NULL DEFAULT (UUID()),
  `user_id`         CHAR(36)     NOT NULL,
  `default_address` VARCHAR(255) DEFAULT NULL,
  `aqua_points`     INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_customer_user` (`user_id`),
  KEY `ix_customer_user` (`user_id`),
  CONSTRAINT `fk_customer_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ============================================================================
-- 4. stations (FK to station_owners; parent to staff/products/subscription_plans/orders)
-- ============================================================================
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
  CONSTRAINT `fk_station_owner`
    FOREIGN KEY (`owner_id`) REFERENCES `station_owners` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ============================================================================
-- 5. staff (FK to users + stations; NO approved_by FK until users fully set)
-- ============================================================================
CREATE TABLE IF NOT EXISTS `staff` (
  `id`            CHAR(36)     NOT NULL DEFAULT (UUID()),
  `user_id`       CHAR(36)     NOT NULL,
  `station_id`    CHAR(36)     NOT NULL,
  `approved_by`   CHAR(36)     DEFAULT NULL,
  `status`        ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_staff_user` (`user_id`),
  KEY `ix_staff_station` (`station_id`),
  KEY `ix_staff_approved_by` (`approved_by`),
  CONSTRAINT `fk_staff_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON DELETE CASCADE,
  CONSTRAINT `fk_staff_station`
    FOREIGN KEY (`station_id`) REFERENCES `stations` (`id`)
    ON DELETE CASCADE
  -- approved_by FK omitted in import to avoid order errors; add after users loaded
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ============================================================================
-- 6. notifications (FK to users; column is_read avoids reserved `read`)
-- ============================================================================
CREATE TABLE IF NOT EXISTS `notifications` (
  `id`            CHAR(36)     NOT NULL DEFAULT (UUID()),
  `user_id`       CHAR(36)     NOT NULL,
  `title`         VARCHAR(190) NOT NULL,
  `body`          TEXT         NOT NULL,
  `is_read`       TINYINT(1)   NOT NULL DEFAULT 0,
  `created_at`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_notifications_user` (`user_id`),
  KEY `ix_notifications_read` (`is_read`),
  CONSTRAINT `fk_notifications_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ============================================================================
-- 7. rewards (FK to station_owners)
-- ============================================================================
CREATE TABLE IF NOT EXISTS `rewards` (
  `id`                 CHAR(36)     NOT NULL DEFAULT (UUID()),
  `owner_id`           CHAR(36)     NOT NULL,
  `name`               VARCHAR(190) NOT NULL,
  `required_purchases` INT          NOT NULL DEFAULT 0,
  `reward_description` VARCHAR(255) NOT NULL,
  `status`             VARCHAR(40)  NOT NULL DEFAULT 'active',
  PRIMARY KEY (`id`),
  KEY `ix_rewards_owner` (`owner_id`),
  CONSTRAINT `fk_rewards_owner`
    FOREIGN KEY (`owner_id`) REFERENCES `station_owners` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ============================================================================
-- 8. promotions (FK to station_owners; code unique; expires_at DATE)
-- ============================================================================
CREATE TABLE IF NOT EXISTS `promotions` (
  `id`          CHAR(36)     NOT NULL DEFAULT (UUID()),
  `owner_id`    CHAR(36)     NOT NULL,
  `code`        VARCHAR(50)  NOT NULL,
  `type`        VARCHAR(40)  NOT NULL,
  `value`       DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `expires_at`  DATE         DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_promotion_code` (`code`),
  KEY `ix_promotions_owner` (`owner_id`),
  CONSTRAINT `fk_promotion_owner`
    FOREIGN KEY (`owner_id`) REFERENCES `station_owners` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ============================================================================
-- 9. customer_rewards (FK to customers + rewards)
-- ============================================================================
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ============================================================================
-- 10. products (FK to stations)
-- ============================================================================
CREATE TABLE IF NOT EXISTS `products` (
  `id`         CHAR(36)     NOT NULL DEFAULT (UUID()),
  `station_id` CHAR(36)     NOT NULL,
  `name`       VARCHAR(190) NOT NULL,
  `unit`       VARCHAR(40)  NOT NULL DEFAULT 'unit',
  `stock_qty`  INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `ix_products_station` (`station_id`),
  CONSTRAINT `fk_product_station`
    FOREIGN KEY (`station_id`) REFERENCES `stations` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ============================================================================
-- 11. pricing (FK to products)
-- ============================================================================
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ============================================================================
-- 12. subscription_plans (FK to stations)
-- ============================================================================
CREATE TABLE IF NOT EXISTS `subscription_plans` (
  `id`              CHAR(36)     NOT NULL DEFAULT (UUID()),
  `station_id`      CHAR(36)     NOT NULL,
  `name`            VARCHAR(190) NOT NULL,
  `gallons_included` INT         NOT NULL DEFAULT 0,
  `price`           DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `frequency`       VARCHAR(20)  NOT NULL DEFAULT 'monthly',
  `status`          VARCHAR(40)  NOT NULL DEFAULT 'active',
  PRIMARY KEY (`id`),
  KEY `ix_subscription_plans_station` (`station_id`),
  CONSTRAINT `fk_subscription_plan_station`
    FOREIGN KEY (`station_id`) REFERENCES `stations` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ============================================================================
-- 13. subscriptions (FK to customers + subscription_plans)
-- ============================================================================
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
  CONSTRAINT `fk_subscription_customer`
    FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`)
    ON DELETE CASCADE,
  CONSTRAINT `fk_subscription_plan`
    FOREIGN KEY (`plan_id`) REFERENCES `subscription_plans` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ============================================================================
-- 14. orders (table named orders; promotion_id nullable)
-- ============================================================================
CREATE TABLE IF NOT EXISTS `orders` (
  `id`             VARCHAR(20)  NOT NULL,
  `customer_id`    CHAR(36)     NOT NULL,
  `station_id`     CHAR(36)     NOT NULL,
  `promotion_id`   CHAR(36)     DEFAULT NULL,
  `type`           VARCHAR(40)  NOT NULL DEFAULT 'refill',
  `status`         VARCHAR(40)  NOT NULL DEFAULT 'New',
  `total`          DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `created_at`     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_orders_customer` (`customer_id`),
  KEY `ix_orders_station` (`station_id`),
  KEY `ix_orders_promotion` (`promotion_id`),
  KEY `ix_orders_status` (`status`),
  KEY `ix_orders_created` (`created_at`),
  CONSTRAINT `fk_orders_customer`
    FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`)
    ON DELETE CASCADE,
  CONSTRAINT `fk_orders_station`
    FOREIGN KEY (`station_id`) REFERENCES `stations` (`id`)
    ON DELETE CASCADE,
  CONSTRAINT `fk_orders_promotion`
    FOREIGN KEY (`promotion_id`) REFERENCES `promotions` (`id`)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ============================================================================
-- 15. order_items (FK to orders + products)
-- ============================================================================
CREATE TABLE IF NOT EXISTS `order_items` (
  `id`         CHAR(36)     NOT NULL DEFAULT (UUID()),
  `order_id`   VARCHAR(20)  NOT NULL,
  `product_id` CHAR(36)     NOT NULL,
  `qty`        INT          NOT NULL DEFAULT 1,
  `unit_price` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  PRIMARY KEY (`id`),
  KEY `ix_order_items_order` (`order_id`),
  KEY `ix_order_items_product` (`product_id`),
  CONSTRAINT `fk_order_items_order`
    FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`)
    ON DELETE CASCADE,
  CONSTRAINT `fk_order_items_product`
    FOREIGN KEY (`product_id`) REFERENCES `products` (`id`)
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
