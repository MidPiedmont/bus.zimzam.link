const Database = require('better-sqlite3');
const path = require('path');
const { ENV } = require('../config/stops');

let db;
if (ENV === 'dev') {
    db = new Database(path.join(__dirname, 'dev_transit_cache.db'));
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('busy_timeout = 1500');
} else {
    db = new Database(':memory:');
    db.pragma('synchronous = OFF');
    db.pragma('busy_timeout = 1500');
}

// Initialize schema
db.exec(`
    CREATE TABLE IF NOT EXISTS arrivals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        stop_key TEXT,
        stop_id TEXT,
        run_number TEXT,
        arrival TEXT,
        is_scheduled INTEGER,
        is_express INTEGER,
        timestamp DATETIME,
        UNIQUE(stop_key, stop_id, run_number)
    )
`);

// Reusable prepared statements & transaction helpers
const getArrivalsQuery = db.prepare(`
    SELECT * FROM arrivals 
    WHERE stop_key LIKE ? 
    ORDER BY 
        stop_key ASC, 
        CASE 
            WHEN arrival = 'DUE' THEN 0
            WHEN arrival = 'DLY' THEN 998
            WHEN arrival = 'ERR' THEN 999
            ELSE CAST(arrival AS INTEGER)
        END ASC
`);

const purgeStaleQuery = db.prepare(`
    DELETE FROM arrivals WHERE timestamp < datetime('now', '-90 seconds')
`);

const batchUpsert = db.transaction((queries) => {
    for (const { sql, params } of queries) {
        db.prepare(sql).run(...params);
    }
});

module.exports = {
    db,
    getArrivalsQuery,
    purgeStaleQuery,
    batchUpsert
};