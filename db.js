const Database = require('better-sqlite3');

// Open or create the database file
const db = new Database('transit_cache.db');

// Enable WAL mode for excellent concurrent read/write speed
db.pragma('journal_mode = WAL');

module.exports = db;
