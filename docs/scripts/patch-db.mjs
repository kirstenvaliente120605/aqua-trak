import { pool } from '../backend/src/db.js';

async function patch() {
  try {
    await pool.execute('ALTER TABLE notifications ADD COLUMN IF NOT EXISTS station_id VARCHAR(64) NULL AFTER user_id');
  } catch (e) { console.log('notif col station_id:', e.message); }
  
  try {
    await pool.execute('ALTER TABLE notifications ADD COLUMN IF NOT EXISTS message TEXT NULL AFTER body');
  } catch (e) { console.log('notif col message:', e.message); }

  try {
    await pool.execute('ALTER TABLE notifications ADD COLUMN IF NOT EXISTS is_read TINYINT(1) NOT NULL DEFAULT 0 AFTER `read`');
  } catch (e) { console.log('notif col is_read:', e.message); }

  try {
    await pool.execute('ALTER TABLE notifications MODIFY COLUMN user_id CHAR(36) NULL');
  } catch (e) { console.log('notif modify user_id:', e.message); }

  try {
    await pool.execute(`INSERT IGNORE INTO notifications (id, station_id, title, message, is_read) VALUES
      ('N-1', 'drink-refill', 'Inventory alert', 'Check refill inventory before 4:00 PM.', 0),
      ('N-2', 'drink-refill', 'Shift reminder',  'Your next shift starts at 2:00 PM.', 0)`);
  } catch (e) { console.log('insert notif:', e.message); }

  // Check demo users
  const [users] = await pool.execute('SELECT id, email, role FROM users');
  console.log('Total users:', users.length);
  
  await pool.end();
  console.log('Database patch complete!');
}

patch().catch(console.error);
