-- Rollback for 014 (data) — restore the pre-014 station_id / station values.
--
-- Pre-014 state (verified before the migration ran):
--   USR_007/008/012/013/014/023  station_id = ''        station = ''
--   USR_010                      station_id = 'STN_002' station = ''
--   USR_003 (pending)            station_id = 'STN_002' station = 'Station staff'
--   USR_011                      station = ''
--   USR_015/022/024              station = 'Station staff'
--
-- STAFF.station_id and the STATION rows are untouched by 014, so nothing else
-- needs restoring.

UPDATE `user` SET `station_id` = '', `station` = ''
 WHERE `id` IN ('USR_007', 'USR_008', 'USR_012', 'USR_013', 'USR_014', 'USR_023');

UPDATE `user` SET `station_id` = 'STN_002', `station` = ''
 WHERE `id` = 'USR_010';

UPDATE `user` SET `station_id` = 'STN_002', `station` = 'Station staff'
 WHERE `id` = 'USR_003';

UPDATE `user` SET `station` = ''
 WHERE `id` = 'USR_011';

UPDATE `user` SET `station` = 'Station staff'
 WHERE `id` IN ('USR_015', 'USR_022', 'USR_024');
