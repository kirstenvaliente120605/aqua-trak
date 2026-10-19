-- Phase 1 Migration: Add missing tables for PHP backend
-- Source of truth: php-backend/schema.sql
-- Only safe ALTER / CREATE IF NOT EXISTS — no DROP/DELETE

CREATE TABLE IF NOT EXISTS staff_shifts (
  id VARCHAR(36) NOT NULL,
  staff_id CHAR(36) NOT NULL,
  station_id VARCHAR(64) NOT NULL,
  date DATE NOT NULL,
  start VARCHAR(5) NOT NULL,
  end VARCHAR(5) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'Scheduled',
  attendance TEXT NULL,
  PRIMARY KEY (id),
  KEY ix_shifts_staff (staff_id, station_id),
  CONSTRAINT fk_shifts_staff FOREIGN KEY (staff_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS inventory_items (
  id VARCHAR(64) NOT NULL,
  station_id VARCHAR(64) NOT NULL DEFAULT '',
  name VARCHAR(190) NOT NULL,
  quantity INT NOT NULL DEFAULT 0,
  reorder_at INT NOT NULL DEFAULT 0,
  unit VARCHAR(40) NOT NULL DEFAULT 'units',
  PRIMARY KEY (id),
  KEY ix_inventory_station (station_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS inventory_reports (
  id VARCHAR(36) NOT NULL,
  item_id VARCHAR(64) NOT NULL,
  staff_id CHAR(36) NOT NULL,
  type ENUM('return','damage','missing') NOT NULL DEFAULT 'missing',
  amount INT NOT NULL DEFAULT 1,
  note VARCHAR(500) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_reports_item (item_id),
  CONSTRAINT fk_reports_item FOREIGN KEY (item_id) REFERENCES inventory_items(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS customer_requests (
  id VARCHAR(36) NOT NULL,
  station_id VARCHAR(64) NOT NULL,
  customer_name VARCHAR(100) NOT NULL DEFAULT '',
  subject VARCHAR(190) NOT NULL DEFAULT '',
  message TEXT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'Open',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY ix_requests_station (station_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS station_settings (
  station_id VARCHAR(64) NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY (station_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS station_pricing (
  station_id VARCHAR(64) NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY (station_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS staff_approvals (
  id VARCHAR(36) NOT NULL,
  station_id VARCHAR(64) NOT NULL,
  user_id CHAR(36) NOT NULL,
  name VARCHAR(100) NOT NULL DEFAULT '',
  email VARCHAR(190) NOT NULL DEFAULT '',
  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_approvals_station (station_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
