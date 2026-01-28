const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const app = express();
const PORT = 3000;

const API_KEY = 'hWLgKpmckMQjQEFfx5X3jBZp6';

// Your updated 6 stops
const STOPS = [
    { rt: '20', id: '417', key: 'r20e' },
    { rt: '20', id: '480', key: 'r20w' },
    { rt: '49', id: '8379', key: 'r49n' },
    { rt: '49', id: '14546', key: 'r49s' },
    { rt: '52', id: '3164', key: 'r52n' },
    { rt: '52', id: '17593', key: 'r52s' }
];

const db = new sqlite3.Database('./bus_cache.db');

db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS bus_times (stop_key TEXT PRIMARY KEY, arrivals TEXT)");
});

app.use(express.static('public'));

async function syncCtaToDb() {
    console.log(`Syncing ${STOPS.length} stops at ${new Date().toLocaleTimeString()}...`);
    for (const stop of STOPS) {
        try {
            const url = `https://www.ctabustracker.com/bustime/api/v3/getpredictions?key=${API_KEY}&rt=${stop.rt}&stpid=${stop.id}&format=json`;
            const res = await fetch(url);
            const data = await res.json();
            const prds = data['bustime-response']?.prd;

            let resultData = ["No service"];
            if (prds) {
                resultData = prds.map(p => {
                    let mins = parseInt(p.prdctdn);
                    let buffered = isNaN(mins) ? p.prdctdn : Math.max(0, mins - 1);
                    return buffered === 0 ? "DUE" : buffered;
                }).slice(0, 3); // Grab up to 3 buses
            }

            // Save as a JSON string so the frontend can parse it back into an array
            db.run(
                "INSERT OR REPLACE INTO bus_times (stop_key, arrivals) VALUES (?, ?)", 
                [stop.key, JSON.stringify(resultData)]
            );
        } catch (err) {
            console.error(`Fetch Error for ${stop.key}:`, err.message);
        }
    }
}

// Sync every 30 seconds
syncCtaToDb();
setInterval(syncCtaToDb, 30000);

// Frontend pings this every 10 seconds
app.get('/api/bus-data', (req, res) => {
    db.all("SELECT * FROM bus_times", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const results = {};
        rows.forEach(row => results[row.stop_key] = row.arrivals);
        res.json(results);
    });
});

app.listen(PORT, () => console.log(`Bus Server: http://localhost:${PORT}`));