const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./transit_cache.db');
const fs = require('fs');
const path = require('path');

// Read and parse the gitignored 'api' file
const apiFile = fs.readFileSync(path.join(__dirname, 'api'), 'utf8');
const keys = Object.fromEntries(
    apiFile.split('\n')
        .map(line => line.trim().split(/\s+/)) // Splits by any whitespace
        .filter(parts => parts.length === 2)
);

const BUS_API_KEY = keys['bus'];
const TRAIN_API_KEY = keys['train'];

// You would run this once: node init_routes.js
async function initializeExpressRoutes(apiKey) {
    db.serialize(() => {
        db.run("CREATE TABLE IF NOT EXISTS bus_routes (rt TEXT PRIMARY KEY, is_express INTEGER)");
    });

    try {
        const url = `https://www.ctabustracker.com/bustime/api/v3/getroutes?key=${apiKey}&format=json`;
        const res = await fetch(url);
        const data = await res.json();
        const allRoutes = data['bustime-response'].routes;

        const stmt = db.prepare("INSERT OR REPLACE INTO bus_routes (rt, is_express) VALUES (?, ?)");
        
        allRoutes.forEach(route => {
            const isExpress = route.rt.startsWith('X') ? 1 : 0;
            stmt.run(route.rt, isExpress);
        });

        stmt.finalize();
        console.log("Bus routes table initialized.");
    } catch (err) {
        console.error("Error initializing routes:", err);
    }
}

initializeExpressRoutes(BUS_API_KEY);