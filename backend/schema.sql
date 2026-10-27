-- ============================================================================
-- AquaTracker schema (XAMPP / MySQL-MariaDB)
--
-- Apply via http://localhost:8080/install, or import this file in phpMyAdmin.
-- Safe to re-run: every statement is CREATE ... IF NOT EXISTS.
--
-- JSON-valued columns (permissions, attendance, pricing, settings) are stored as
-- TEXT and encoded/decoded in PHP so the schema works identically on MySQL and
-- MariaDB, which XAMPP may ship either of.
-- ============================================================================

CREATE DATABASE IF NOT EXISTS `aquatracker`
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE `aquatracker`;

-- ---------------------------------------------------------------------------
-- Accounts. `status` drives the owner staff-approval workflow:
-- active | pending | rejected.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `users` (
  `id`            CHAR(36)     NOT NULL,
  `email`         VARCHAR(190) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `name`          VARCHAR(100) NOT NULL,
  `role`          ENUM('customer','owner','staff') NOT NULL,
  `subtitle`      VARCHAR(190) NOT NULL DEFAULT '',
  `station`       VARCHAR(190) NOT NULL DEFAULT '',
  `station_id`    VARCHAR(64)  NOT NULL DEFAULT '',
  `permissions`   TEXT         NULL,
  `phone`         VARCHAR(40)  NOT NULL DEFAULT '',
  `location`      VARCHAR(120) NOT NULL DEFAULT '',
  `status`        ENUM('active','pending','rejected') NOT NULL DEFAULT 'active',
  `reviewed_at`   DATETIME     NULL,
  `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_email` (`email`),
  KEY `ix_users_role_status` (`role`,`status`),
  KEY `ix_users_station` (`station`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Server-side sessions, keyed by the opaque token in the session cookie.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `sessions` (
  `token`      CHAR(64) NOT NULL,
  `user_id`    CHAR(36) NOT NULL,
  `expires_at` DATETIME NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`token`),
  KEY `ix_sessions_user` (`user_id`),
  KEY `ix_sessions_expiry` (`expires_at`),
  CONSTRAINT `fk_sessions_user` FOREIGN KEY (`user_id`)
    REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Stations. lat/lng drive the nearest-station filter in Step 1 of the order
-- flow, so they are part of the real schema now rather than frontend seed data.
-- `alka` has no coordinates yet; the proximity filter skips it by design.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `stations` (
  `id`                VARCHAR(64)   NOT NULL,
  `name`              VARCHAR(190)  NOT NULL,
  `area`              VARCHAR(190)  NOT NULL DEFAULT '',
  `address`           VARCHAR(255)  NOT NULL DEFAULT '',
  `phone`             VARCHAR(40)   NOT NULL DEFAULT '',
  `hours`             VARCHAR(120)  NOT NULL DEFAULT '',
  `lat`               DECIMAL(10,7) NULL,
  `lng`               DECIMAL(10,7) NULL,
  `price_per_gallon`  DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `delivery`          TINYINT(1)    NOT NULL DEFAULT 0,
  `rating`            DECIMAL(2,1)  NOT NULL DEFAULT 0.0,
  `created_at`        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_stations_coords` (`lat`,`lng`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Orders. Customer-facing rows start at status 'New order'; the station and
-- owner views normalise that to 'New' on read, matching the Node backend.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `orders` (
  `id`            VARCHAR(20)   NOT NULL,
  `user_id`       CHAR(36)      NOT NULL,
  `customer_name` VARCHAR(100)  NOT NULL DEFAULT '',
  `station_id`    VARCHAR(64)   NOT NULL,
  `station_name`  VARCHAR(190)  NOT NULL DEFAULT '',
  `gallons`       INT           NOT NULL,
  `fulfillment`   ENUM('delivery','pickup') NOT NULL DEFAULT 'pickup',
  `status`        VARCHAR(40)   NOT NULL DEFAULT 'New order',
  `unit_price`    DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `subtotal`      DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `discount_rate` DECIMAL(4,3)  NOT NULL DEFAULT 0.000,
  `discount`      DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `total`         DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `internal_note` TEXT          NULL,
  `created_at`    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    DATETIME      NULL,
  PRIMARY KEY (`id`),
  KEY `ix_orders_user` (`user_id`),
  KEY `ix_orders_station_status` (`station_id`,`status`),
  KEY `ix_orders_created` (`created_at`),
  CONSTRAINT `fk_orders_user` FOREIGN KEY (`user_id`)
    REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Atomic id sequence. Declared after `orders` because its seed reads that table.
--
-- Order ids are human-friendly ("AT-2001"), which rules out a UUID. Deriving the
-- next one from SELECT COUNT(*) is a read-then-write race: two requests that
-- overlap both read the same count, both compute the same id, and one of them
-- dies on a duplicate-key error (SQLSTATE 23000 / 1062). That is not
-- theoretical - it needs only two simultaneous orders, and it was reproduced at
-- 8 concurrent clients before this table existed.
--
-- CommerceController increments it with LAST_INSERT_ID(value + 1). The UPDATE
-- takes a row lock on the single counter row and the server hands each caller
-- back a distinct number, so the increment and the read cannot be interleaved.
--
-- Seeded to 2000 so the first order is AT-2001, matching the number the Node
-- backend started from - but never below an id that is already taken. An earlier
-- version derived ids from SELECT COUNT(*), so a database created by that version
-- already holds AT-2001 upwards; without the MAX() below, the counter would walk
-- straight into those rows and every order would fail with a duplicate-key error
-- until it had climbed past them.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `id_sequence` (
  `name`  VARCHAR(32)     NOT NULL,
  `value` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `id_sequence` (`name`, `value`)
SELECT
  'orders',
  GREATEST(2000, COALESCE(MAX(CAST(SUBSTRING(`orders`.`id`, 4) AS UNSIGNED)), 2000))
FROM `orders`;

-- ---------------------------------------------------------------------------
-- Recurring refill plans.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `subscriptions` (
  `id`              VARCHAR(32)   NOT NULL,
  `user_id`         CHAR(36)      NOT NULL,
  `customer_name`   VARCHAR(100)  NOT NULL DEFAULT '',
  `station_id`      VARCHAR(64)   NOT NULL,
  `station_name`    VARCHAR(190)  NOT NULL DEFAULT '',
  `gallons`         INT           NOT NULL,
  `frequency`       ENUM('weekly','biweekly','monthly') NOT NULL DEFAULT 'monthly',
  `unit_price`      DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `discount_rate`   DECIMAL(4,3)  NOT NULL DEFAULT 0.100,
  `estimated_total` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `status`          VARCHAR(20)   NOT NULL DEFAULT 'Active',
  `next_refill`     DATETIME      NULL,
  `cancelled_at`    DATETIME      NULL,
  `created_at`      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_subscriptions_user` (`user_id`),
  KEY `ix_subscriptions_station` (`station_id`),
  CONSTRAINT `fk_subscriptions_user` FOREIGN KEY (`user_id`)
    REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Staff tooling: shifts, attendance, consumable stock, customer requests and
-- station notifications. Each is scoped by station_id the way the Node
-- services scoped their JSON files by the signed-in user's station.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `staff_shifts` (
  `id`         VARCHAR(36)  NOT NULL,
  `staff_id`   CHAR(36)     NOT NULL,
  `station_id` VARCHAR(64)  NOT NULL,
  `date`       DATE         NOT NULL,
  `start`      VARCHAR(5)   NOT NULL,
  `end`        VARCHAR(5)   NOT NULL,
  `status`     VARCHAR(20)  NOT NULL DEFAULT 'Scheduled',
  `attendance` TEXT         NULL,
  PRIMARY KEY (`id`),
  KEY `ix_shifts_staff` (`staff_id`,`station_id`),
  CONSTRAINT `fk_shifts_staff` FOREIGN KEY (`staff_id`)
    REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `inventory_items` (
  `id`         VARCHAR(64)  NOT NULL,
  `station_id` VARCHAR(64)  NOT NULL DEFAULT '',
  `name`       VARCHAR(190) NOT NULL,
  `quantity`   INT          NOT NULL DEFAULT 0,
  `reorder_at` INT          NOT NULL DEFAULT 0,
  `unit`       VARCHAR(40)  NOT NULL DEFAULT 'units',
  PRIMARY KEY (`id`),
  KEY `ix_inventory_station` (`station_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `inventory_reports` (
  `id`         VARCHAR(36)  NOT NULL,
  `item_id`    VARCHAR(64)  NOT NULL,
  `staff_id`   CHAR(36)     NOT NULL,
  `type`       ENUM('return','damage','missing') NOT NULL DEFAULT 'missing',
  `amount`     INT          NOT NULL DEFAULT 1,
  `note`       VARCHAR(500) NOT NULL DEFAULT '',
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_reports_item` (`item_id`),
  CONSTRAINT `fk_reports_item` FOREIGN KEY (`item_id`)
    REFERENCES `inventory_items` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `customer_requests` (
  `id`            VARCHAR(36)  NOT NULL,
  `station_id`    VARCHAR(64)  NOT NULL,
  `customer_name` VARCHAR(100) NOT NULL DEFAULT '',
  `subject`       VARCHAR(190) NOT NULL DEFAULT '',
  `message`       TEXT         NULL,
  `status`        VARCHAR(20)  NOT NULL DEFAULT 'Open',
  `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    DATETIME     NULL,
  PRIMARY KEY (`id`),
  KEY `ix_requests_station` (`station_id`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `notifications` (
  `id`         VARCHAR(36)  NOT NULL,
  `station_id` VARCHAR(64)  NOT NULL,
  `title`      VARCHAR(190) NOT NULL DEFAULT '',
  `message`    TEXT         NULL,
  `is_read`    TINYINT(1)   NOT NULL DEFAULT 0,
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_notifications_station` (`station_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Per-station owner settings and container pricing, stored as JSON blobs keyed
-- by station. TEXT rather than a JSON column so the schema behaves the same on
-- MySQL and MariaDB; OwnerController encodes/decodes in PHP.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `station_settings` (
  `station_id` VARCHAR(64) NOT NULL,
  `payload`    TEXT        NOT NULL,
  PRIMARY KEY (`station_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `station_pricing` (
  `station_id` VARCHAR(64) NOT NULL,
  `payload`    TEXT        NOT NULL,
  PRIMARY KEY (`station_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Station catalogue seed. Prices, delivery flags and areas match
-- backend/src/services/commerceStore.js stationCatalog; coordinates, addresses,
-- phone numbers, opening hours and ratings match the frontend's DEFAULT_STATIONS
-- seed in frontend/js/dashboard.js.
--
-- This is an UPSERT, not a plain INSERT IGNORE, so re-running /install repairs
-- the catalogue if a row was seeded without its descriptive fields. It only ever
-- touches the `stations` table: users, orders, subscriptions and the owner-edited
-- station_settings / station_pricing blobs are never rewritten. Those last two
-- are deliberately NOT seeded here - the Owner settings and pricing screens own
-- them, and an empty table simply means "use the defaults in PHP".
--
-- `alka` has no frontend fixture anywhere in the repo, so its address repeats its
-- area and its phone, hours and rating are left empty. Rating 0 therefore means
-- "not yet rated", not "rated zero stars"; the station finder sorts and filters
-- on rating, so an unrated station simply drops out of a "top rated" filter
-- rather than outranking anything.
-- ---------------------------------------------------------------------------
INSERT INTO `stations`
  (`id`, `name`, `area`, `address`, `phone`, `hours`, `rating`, `price_per_gallon`, `delivery`, `lat`, `lng`)
VALUES
  ('drink-refill',  'DRINK n'' REFILL Purified Water Refilling Station', '45 Sabellano St, Pagadian City',                      '45 Sabellano St, San Jose District, Pagadian City',    '0918 962 5038', 'Mon-Sat 7:30 AM-5:00 PM',  4.9, 35, 1, 7.8269000, 123.4371000),
  ('ultra-pure',    'Ultra Pure Water Refilling Station',                'Purok Bakhaw A, Brgy. Kawit',                            'Purok Bakhaw A, Brgy. Kawit, Pagadian City',          '0970 488 8866', 'Mon-Sun 8:00 AM-6:00 PM',   4.7, 30, 0, 7.8312000, 123.4437000),
  ('waterpol',      'Waterpol Water Refilling Station',                  'Purok Pagang, Brgy. Kawit',                              'Purok Pagang, Brgy. Kawit, Pagadian City',             '0927 251 4246', 'Mon-Sat 7:00 AM-6:30 PM',   4.8, 35, 1, 7.8347000, 123.4481000),
  ('pg-aquamaster', 'PG Aquamaster Water Refilling Station',             'Purok Makugihon, Brgy. Bulatok',                        'Purok Makugihon, Brgy. Bulatok, Pagadian City',        '0951 312 5308', 'Mon-Sat 8:00 AM-5:00 PM',   4.6, 30, 0, 7.8198000, 123.4297000),
  ('aquater',       'Aqua''Ter SMN Water Refilling Station',            'Beside DXPR, San Jose District',                         'Beside DXPR Radio, San Jose District, Pagadian City',  '0975 462 7620', 'Mon-Sun 6:30 AM-7:00 PM',   4.9, 25, 1, 7.8191000, 123.4412000),
  ('ph2o',          'PH2O Water Refilling Station',                      'Warlito Pulmones St, Santiago District',                 'Warlito Pulmones St, Santiago District, Pagadian City','0985 337 4448', '24/7 Automated Vendo & Counter', 4.8, 30, 0, 7.8362000, 123.4264000),
  ('alka',          'Alka Water Refilling Station',                      'Zone 11, Alta Tierra Subdivision, Tiguma',               'Zone 11, Alta Tierra Subdivision, Tiguma',             '',              '',                            0.0, 35, 1, NULL,      NULL)
ON DUPLICATE KEY UPDATE
  `name`             = VALUES(`name`),
  `area`             = VALUES(`area`),
  `address`          = VALUES(`address`),
  `phone`            = VALUES(`phone`),
  `hours`            = VALUES(`hours`),
  `rating`           = VALUES(`rating`),
  `price_per_gallon` = VALUES(`price_per_gallon`),
  `delivery`         = VALUES(`delivery`),
  `lat`              = VALUES(`lat`),
  `lng`              = VALUES(`lng`);

-- ---------------------------------------------------------------------------
-- Default stock and station settings for the demo station.
-- ---------------------------------------------------------------------------
INSERT IGNORE INTO `inventory_items` (`id`, `station_id`, `name`, `quantity`, `reorder_at`, `unit`) VALUES
  ('five-gallon',     'drink-refill', '5-gallon containers', 42, 15, 'containers'),
  ('sealed-caps',     'drink-refill', 'Sealed caps',         86, 30, 'caps'),
  ('sanitizer',       'drink-refill', 'Sanitizer solution',   8,  4, 'bottles'),
  ('delivery-crates', 'drink-refill', 'Delivery crates',     12,  5, 'crates');

INSERT IGNORE INTO `customer_requests` (`id`, `station_id`, `customer_name`, `subject`, `message`, `status`) VALUES
  ('REQ-1001', 'drink-refill', 'Mia Santos',   'Pickup time change', 'Can I collect my refill after 6 PM?',        'Open'),
  ('REQ-1002', 'drink-refill', 'Noah Garcia',  'Container return',   'I have two empty containers to return.',       'Open');

INSERT IGNORE INTO `notifications` (`id`, `station_id`, `title`, `message`) VALUES
  ('N-1', 'drink-refill', 'Inventory alert', 'Check refill inventory before 4:00 PM.'),
  ('N-2', 'drink-refill', 'Shift reminder',  'Your next shift starts at 2:00 PM.');