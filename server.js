const express = require('express');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Read and parse the gitignored 'api' file
const apiFile = fs.readFileSync(path.join(__dirname, 'api'), 'utf8');
const keys = Object.fromEntries(
    apiFile.split('\n')
        .map(line => line.trim().split(/\s+/))
        .filter(parts => parts.length === 2)
);

const BUS_API_KEY = keys['bus'];
const TRAIN_API_KEY = keys['train'];

const stops = [
    { rt: '20', id: '417', key: 'bus_r20e', type: 'bus' },
    { rt: '20', id: '480', key: 'bus_r20w', type: 'bus' },
    { rt: '49', id: '8379', key: 'bus_r49n', type: 'bus' },
    { rt: '49', id: '14546', key: 'bus_r49s', type: 'bus' },
    { rt: '52', id: '3164', key: 'bus_r52n', type: 'bus' },
    { rt: '52', id: '17593', key: 'bus_r52s', type: 'bus' },
    { rt: 'Green', id: '30207', key: 'train_rg_east', type: 'train' },
    { rt: 'Green', id: '30208', key: 'train_rg_west', type: 'train' },
    { rt: 'Blue',  id: '30048', key: 'train_rb_east', type: 'train' },
    { rt: 'Blue',  id: '30049', key: 'train_rb_west', type: 'train' }
];

// Initialize SQLite database synchronously
const db = new Database('./transit_cache.db');

// Enable WAL mode for high-concurrency read/write performance
db.pragma('journal_mode = WAL');

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

// Prepare reusable SQL statements
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

app.use(express.static('public'));

async function syncCtaToDb() {
    const timestamp = new Date().toISOString();

    for (const stop of stops) {
        try {
            let prds = [];

            if (stop.type === 'train') {
                const url = `https://lapi.transitchicago.com/api/1.0/ttarrivals.aspx?key=${TRAIN_API_KEY}&stpid=${stop.id}&outputType=JSON`;
                const res = await fetch(url);
                const data = await res.json();
                prds = data.ctatt?.eta || [];
            } else {
                const url = `http://www.ctabustracker.com/bustime/api/v2/getpredictions?key=${BUS_API_KEY}&rt=${stop.rt}&stpid=${stop.id}&format=json`;
                const res = await fetch(url);
                const data = await res.json();
                prds = data['bustime-response']?.prd || [];
            }

            if (prds.length === 0) continue;

            const valuesPlaceholders = [];
            const params = [];

            prds.forEach(p => {
                let mins;
                let isSch = 0;
                let isExpress = 0;
                let runNum = "";

                if (stop.type === 'train') {
                    runNum = p.rn;
                    isSch = p.isSch === "1" ? 1 : 0;
                    if (p.isDly === "1") mins = "DLY";
                    else if (p.isApp === "1") mins = "DUE";
                    else {
                        mins = Math.floor((new Date(p.arrT) - new Date(p.prdt)) / 60000);
                    }
                } else {
                    runNum = p.vid || "SCH";
                    isSch = p.typ === "S" ? 1 : 0;
                    isExpress = p.rt && p.rt.startsWith('X') ? 1 : 0;
                    mins = (p.prdctdn === "DUE") ? "DUE" : parseInt(p.prdctdn, 10);
                }

                let finalDisplay = mins;
                if (typeof mins === 'number' && !isNaN(mins)) {
                    let bufferedMins = Math.ceil((mins * 60 - 30) / 60);
                    finalDisplay = bufferedMins <= 1 ? "DUE" : bufferedMins.toString();
                }

                valuesPlaceholders.push("(?, ?, ?, ?, ?, ?, ?)");
                params.push(stop.key, stop.id, runNum, finalDisplay, isSch, isExpress, timestamp);
            });

            const upsertSql = `
                INSERT INTO arrivals (
                    stop_key, stop_id, run_number, 
                    arrival, is_scheduled, is_express, timestamp
                ) 
                VALUES ${valuesPlaceholders.join(', ')}
                ON CONFLICT(stop_key, stop_id, run_number) DO UPDATE SET
                    arrival = excluded.arrival,
                    is_scheduled = excluded.is_scheduled,
                    is_express = excluded.is_express,
                    timestamp = excluded.timestamp
            `;

            // Execute upsert synchronously
            db.prepare(upsertSql).run(...params);

        } catch (err) {
            console.error(`Sync Error for ${stop.key}:`, err.message);
        }
    }

    // Clear arrivals that haven't been refreshed in the last 90 seconds
    try {
        purgeStaleQuery.run();
    } catch (err) {
        console.error("Purge Error:", err.message);
    }
}

// Initial Sync and Loop
syncCtaToDb();
setInterval(syncCtaToDb, 30000);

// API Handlers
app.get('/api/bus', (req, res) => {
    try {
        const rows = getArrivalsQuery.all('bus_%');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/train', (req, res) => {
    try {
        const rows = getArrivalsQuery.all('train_%');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => console.log(`Transit Server running on http://localhost:${PORT}`));