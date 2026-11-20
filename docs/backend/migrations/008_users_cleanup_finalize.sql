-- Phase 2: run only after all audit result sets in 007_users_cleanup_prepare.sql
-- return no rows. The foreign key is installed before legacy columns are dropped.

ALTER TABLE `users`
  ADD KEY `ix_users_station_id` (`station_id`),
  ADD CONSTRAINT `fk_users_station_id` FOREIGN KEY (`station_id`)
    REFERENCES `stations` (`id`) ON UPDATE CASCADE ON DELETE RESTRICT,
  DROP INDEX `ix_users_station`,
  DROP COLUMN `station`,
  DROP COLUMN `name`,
  DROP COLUMN `location`,
  DROP COLUMN `reviewed_at`;
