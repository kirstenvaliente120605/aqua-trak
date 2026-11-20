import mysql from 'mysql2/promise';

export const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'aquatracker',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

export async function testDB() {
  const [rows] = await pool.execute('SELECT 1 as ok');
  return rows[0].ok === 1;
}
