const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

pool.getConnection()
  .then(connection => {
    console.log('[MySQL] Conexion exitosa a archivos_db');
    connection.release();
  })
  .catch(err => {
    console.error('[MySQL] Error de conexion:', err.message);
    process.exit(1);
  });

module.exports = pool;