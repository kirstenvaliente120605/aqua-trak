-- Phase 2 Migration: Tables for localStorage business data
-- Safe: only CREATE TABLE IF NOT EXISTS / ALTER ADD COLUMN

CREATE TABLE IF NOT EXISTS loyalty_points (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  balance INT NOT NULL DEFAULT 0,
  tier VARCHAR(50) NOT NULL DEFAULT 'Bronze',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY ix_loyalty_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS saved_stations (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  station_id VARCHAR(64) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_saved_user_station (user_id, station_id),
  KEY ix_saved_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS customer_preferences (
  user_id CHAR(36) NOT NULL PRIMARY KEY,
  address VARCHAR(255) DEFAULT NULL,
  landmark VARCHAR(255) DEFAULT NULL,
  delivery_address VARCHAR(255) DEFAULT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_prefs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
