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
const STOPS = [
    { rt: '20', id: '417', key: 'bus_r20e', type: 'bus' },
    { rt: '20', id: '480', key: 'bus_r20w', type: 'bus' },
    { rt: '49', id: '8379', key: 'bus_r49n', type: 'bus' },
    { rt: '49', id: '14546', key: 'bus_r49s', type: 'bus' },
    { rt: '52', id: '3164', key: 'bus_r52n', type: 'bus' },
    { rt: '52', id: '17593', key: 'bus_r52s', type: 'bus' },
    { rt: 'Green', id: '30058', key: 'train_rg_east', type: 'train' },
    { rt: 'Green', id: '30057', key: 'train_rg_west', type: 'train' },
    { rt: 'Blue',  id: '30049', key: 'train_rb_east', type: 'train' },
    { rt: 'Blue',  id: '30048', key: 'train_rb_west', type: 'train' }
];

const db = new sqlite3.Database('./transit_cache.db');

db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS bus_times (stop_key TEXT PRIMARY KEY, arrivals TEXT)");
});

app.use(express.static('public'));

async function syncCtaToDb() {
    for (const stop of STOPS) {
        try {
            let resultData = ["No Service :("];
            let prds = null;

            if (stop.type === 'train') {
                const url = `https://lapi.transitchicago.com/api/1.0/ttarrivals.aspx?key=${TRAIN_API_KEY}&stpid=${stop.id}&outputType=JSON`;
                const res = await fetch(url);
                const data = await res.json();
                prds = data.ctatt.eta;
            } else {
                const url = `https://www.ctabustracker.com/bustime/api/v3/getpredictions?key=${BUS_API_KEY}&rt=${stop.rt}&stpid=${stop.id}&format=json`;
                const res = await fetch(url);
                const data = await res.json();
                prds = data['bustime-response']?.prd;
            }

            if (prds) {
                resultData = prds.map(p => {
                    let mins;

                    // --- TRAIN SPECIFIC LOGIC ---
                    if (stop.type === 'train') {
                        if (p.isDly === "1") return "DLY";
                        if (p.isApp === "1") return "DUE";
                        
                        // Train math: arrT (Arrival Time) - current time
                        const arrivalTime = new Date(p.arrT);
                        const now = new Date();
                        mins = Math.floor((arrivalTime - now) / 60000);
                    } 
                    // --- BUS SPECIFIC LOGIC ---
                    else {
                        if (p.dly) return "DLY";
                        if (p.prdctdn === "DUE") return "DUE";
                        mins = parseInt(p.prdctdn);
                    }

                    // --- SHARED BUFFER LOGIC ---
                    if (isNaN(mins)) return "ERR";

                    let secs = mins * 60;
                    let bufferedSecs = secs - 30;
                    let finalMins = Math.ceil(bufferedSecs / 60);

                    return finalMins <= 0 ? "DUE" : finalMins;
                }).slice(0, 3);
            }

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

// --- Bus API Route ---
app.get('/api/bus', (req, res) => {
    db.all("SELECT * FROM bus_times WHERE stop_key LIKE 'bus_%'", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const results = {};
        rows.forEach(row => results[row.stop_key] = row.arrivals);
        res.json(results);
    });
});

// --- Train API Route ---
app.get('/api/train', (req, res) => {
    db.all("SELECT * FROM bus_times WHERE stop_key LIKE 'train_%'", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const results = {};
        rows.forEach(row => results[row.stop_key] = row.arrivals);
        res.json(results);
    });
});

app.listen(PORT, () => console.log(`Bus Server: http://localhost:${PORT}`));