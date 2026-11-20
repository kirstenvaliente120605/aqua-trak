-- Rollback for 012 — restore the legacy columns on the singular `user` table.
--
-- Run this only to undo 012. `name` is repopulated from `full_name`; the
-- original `location` values were always empty and `reviewed_at` audit
-- timestamps cannot be restored.

ALTER TABLE `user` ADD COLUMN `name` VARCHAR(100) NOT NULL DEFAULT '';
UPDATE `user` SET `name` = `full_name`;

ALTER TABLE `user` ADD COLUMN `station` VARCHAR(190) NOT NULL DEFAULT '';
ALTER TABLE `user` ADD COLUMN `location` VARCHAR(120) NOT NULL DEFAULT '';
ALTER TABLE `user` ADD COLUMN `reviewed_at` DATETIME NULL;
