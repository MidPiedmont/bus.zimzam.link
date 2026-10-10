const { BUS_API_KEY, TRAIN_API_KEY, stops } = require('../config/stops');
const { batchUpsert, purgeStaleQuery } = require('../db/database');

async function syncCtaToDb() {
    const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const queuedUpdates = [];

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
                    runNum = p.vid || `SCH_${p.tmst || Math.random()}`;
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

            const sql = `
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

            queuedUpdates.push({ sql, params });

        } catch (err) {
            console.error(`Sync Error for ${stop.key}:`, err.message);
        }
    }

    if (queuedUpdates.length > 0) {
        try {
            batchUpsert(queuedUpdates);
        } catch (err) {
            console.error("Batch Upsert Error:", err.message);
        }
    }

    try {
        purgeStaleQuery.run();
    } catch (err) {
        console.error("Purge Error:", err.message);
    }
}

function startTransitSync() {
    syncCtaToDb();
    setInterval(syncCtaToDb, 30000);
}

module.exports = { startTransitSync };