SET @email_verified_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user' AND COLUMN_NAME = 'email_verified'
);
SET @email_verified_ddl = IF(
  @email_verified_exists = 0,
  'ALTER TABLE `user` ADD COLUMN `email_verified` TINYINT(1) NOT NULL DEFAULT 1',
  'SELECT 1'
);
PREPARE add_email_verified FROM @email_verified_ddl;
EXECUTE add_email_verified;
DEALLOCATE PREPARE add_email_verified;

SET @auth_version_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user' AND COLUMN_NAME = 'auth_version'
);
SET @auth_version_ddl = IF(
  @auth_version_exists = 0,
  'ALTER TABLE `user` ADD COLUMN `auth_version` INT UNSIGNED NOT NULL DEFAULT 1',
  'SELECT 1'
);
PREPARE add_auth_version FROM @auth_version_ddl;
EXECUTE add_auth_version;
DEALLOCATE PREPARE add_auth_version;

CREATE TABLE IF NOT EXISTS `email_otps` (
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
  CONSTRAINT `fk_email_otps_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `otp_rate_limits` (
  `scope` VARCHAR(8) NOT NULL,
  `key_hash` CHAR(64) NOT NULL,
  `action` VARCHAR(32) NOT NULL,
  `window_started_at` DATETIME NOT NULL,
  `request_count` INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (`scope`,`key_hash`,`action`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `password_reset_tokens` (
  `token_hash` CHAR(64) NOT NULL,
  `email` VARCHAR(190) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `expires_at` DATETIME NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `used_at` DATETIME NULL,
  PRIMARY KEY (`token_hash`),
  KEY `ix_password_reset_tokens_user` (`user_id`),
  KEY `ix_password_reset_tokens_expiry` (`expires_at`),
  CONSTRAINT `fk_password_reset_tokens_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;
