ALTER TABLE `users`
  ADD COLUMN `email_verified` TINYINT(1) NOT NULL DEFAULT 1,
  ADD COLUMN `auth_version` INT UNSIGNED NOT NULL DEFAULT 1;

CREATE TABLE `node_email_otps` (
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
  KEY `ix_node_email_otps_email_purpose` (`email`,`purpose`,`id`),
  KEY `ix_node_email_otps_expiry` (`expires_at`),
  CONSTRAINT `fk_node_email_otps_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE `node_otp_rate_limits` (
  `scope` VARCHAR(8) NOT NULL,
  `key_hash` CHAR(64) NOT NULL,
  `action` VARCHAR(32) NOT NULL,
  `window_started_at` DATETIME NOT NULL,
  `request_count` INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (`scope`,`key_hash`,`action`)
) ENGINE=InnoDB;

CREATE TABLE `node_password_reset_tokens` (
  `token_hash` CHAR(64) NOT NULL,
  `email` VARCHAR(190) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `expires_at` DATETIME NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `used_at` DATETIME NULL,
  PRIMARY KEY (`token_hash`),
  KEY `ix_node_reset_tokens_user` (`user_id`),
  KEY `ix_node_reset_tokens_expiry` (`expires_at`),
  CONSTRAINT `fk_node_reset_tokens_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;
