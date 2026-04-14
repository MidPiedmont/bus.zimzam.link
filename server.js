// ./server.js
// caches times to a sqlite3 db and serves data via API
// refreshes every 30 seconds 

// USE https://www.ctabustracker.com/bustime/api/v3/getroutes?key=hWLgKpmckMQjQEFfx5X3jBZp6 
// to get routes

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = 3000;



// Read and parse the gitignored 'api' file
const apiFile = fs.readFileSync(path.join(__dirname, 'api'), 'utf8');
const keys = Object.fromEntries(
    apiFile.split('\n')
        .map(line => line.trim().split(/\s+/)) // Splits by any whitespace
        .filter(parts => parts.length === 2)
);

const BUS_API_KEY = keys['bus'];
const TRAIN_API_KEY = keys['train'];

// Your updated 6 stops
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

const db = new sqlite3.Database('./transit_cache.db');

db.serialize(() => {
    db.run("DROP TABLE IF EXISTS arrivals"); 
    db.run(`CREATE TABLE IF NOT EXISTS arrivals (
        stop_key TEXT,
        stop_id TEXT,
        run_number TEXT,
        arrival TEXT,
        is_scheduled INTEGER,
        is_express INTEGER
    )`);
});

app.use(express.static('public'));

async function syncCtaToDb() {
    db.run("DELETE FROM arrivals");

    // Helper to get express version of a route (e.g., 20 -> X20)
    const getExpressRoute = (rt) => new Promise((resolve) => {
        db.get("SELECT rt FROM bus_routes WHERE rt = ?", [`X${rt}`], (err, row) => {
            resolve(row ? row.rt : null);
        });
    });

    for (const stop of stops) {
        try {
            let prds = [];
            
            if (stop.type === 'train') {
                const url = `https://lapi.transitchicago.com/api/1.0/ttarrivals.aspx?key=${TRAIN_API_KEY}&stpid=${stop.id}&outputType=JSON`;
                const res = await fetch(url);
                const data = await res.json();
                prds = data.ctatt.eta || [];
            } else {
                // Determine which routes to fetch: the base route + the X route if it exists
                const expressRt = await getExpressRoute(stop.rt);
                const routesToQuery = expressRt ? `${stop.rt},${expressRt}` : stop.rt;
                
                const url = `https://www.ctabustracker.com/bustime/api/v3/getpredictions?key=${BUS_API_KEY}&rt=${routesToQuery}&stpid=${stop.id}&format=json`;
                const res = await fetch(url);
                const data = await res.json();
                prds = data['bustime-response']?.prd || [];
            }

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
                    isExpress = p.rt.startsWith('X') ? 1 : 0; // Check if the specific arrival is an X route
                    mins = (p.prdctdn === "DUE") ? "DUE" : parseInt(p.prdctdn);
                }

                let finalDisplay = mins;
                if (!isNaN(mins)) {
                    let bufferedMins = Math.ceil((mins * 60 - 30) / 60);
                    finalDisplay = bufferedMins <= 1 ? "DUE" : bufferedMins.toString();
                }

                db.run(
                    "INSERT INTO arrivals (stop_key, stop_id, run_number, arrival, is_scheduled, is_express) VALUES (?, ?, ?, ?, ?, ?)", 
                    [stop.key, stop.id, runNum, finalDisplay, isSch, isExpress]
                );
            });
        } catch (err) {
            console.error(`Sync Error for ${stop.key}:`, err.message);
        }
    }
}

// Sync every 30 seconds
syncCtaToDb();
setInterval(syncCtaToDb, 30000);

// --- Bus API Route ---
app.get('/api/bus', (req, res) => {
    const sql = `
        SELECT * FROM arrivals 
        WHERE stop_key LIKE 'bus_%' 
        ORDER BY 
            stop_key ASC, 
            CASE 
                WHEN arrival = 'DUE' THEN 0
                WHEN arrival = 'DLY' THEN 998
                WHEN arrival = 'ERR' THEN 999
                ELSE CAST(arrival AS INTEGER)
            END ASC
    `;
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows); 
    });
});

// --- Train API Route ---
app.get('/api/train', (req, res) => {
    const sql = `
        SELECT * FROM arrivals 
        WHERE stop_key LIKE 'train_%' 
        ORDER BY 
            stop_key ASC, 
            CASE 
                WHEN arrival = 'DUE' THEN 0
                WHEN arrival = 'DLY' THEN 998
                WHEN arrival = 'ERR' THEN 999
                ELSE CAST(arrival AS INTEGER)
            END ASC
    `;
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.listen(PORT, () => console.log(`Bus Server: http://localhost:${PORT}`));