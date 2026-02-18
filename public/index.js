// A reusable function to process arrivals for any endpoint
async function updateUI(endpoint, keys) {
    try {
        const res = await fetch(endpoint);
        const dbData = await res.json(); // This is now an array of objects

        keys.forEach(key => {
            const container = document.querySelector(`.${key}`);
            if (!container) return;

            // Filter the master list for vehicles belonging to THIS stop
            const stopArrivals = dbData.filter(row => row.stop_key === key);

            container.innerHTML = ''; 

            if (stopArrivals.length === 0) {
                container.innerHTML = '<span class="delay">No Service</span>';
                return;
            }

            stopArrivals.forEach(vehicle => {
                const t = vehicle.arrival;
                const isSch = vehicle.is_scheduled === 1;
                const span = document.createElement('span');
                
                // Base classes
                let statusClass = 'arrival';
                let displayTime = t;

                // Logic: DUE or < 10 mins
                if (t === "DUE" || (+t > 0 && +t < 10)) {
                    statusClass = 'due';
                    displayTime = (t === "DUE") ? 'DUE' : `${t}m`;
                } 
                // Regular arrivals (10+ mins)
                else if (+t) {
                    statusClass = 'arrival';
                    displayTime = `${t}m`;
                } 
                // Handle "DLY" or "ERR"
                else {
                    statusClass = 'delay';
                    displayTime = t;
                }

                span.className = statusClass;
                
                // OPTIONAL: Add a class if it's a scheduled (ghost) bus/train
                if (isSch) {
                    span.classList.add('scheduled'); 
                    // You could also append an asterisk: displayTime += '*';
                }

                span.innerText = displayTime;
                container.appendChild(span);
            });
        });
    } catch (err) {
        console.error(`UI Sync Error for ${endpoint}:`, err);
    }
}

// Master function to fire off both requests
function refreshAll() {
    const busKeys = ['bus_r20e', 'bus_r20w', 'bus_r49n', 'bus_r49s', 'bus_r52n', 'bus_r52s'];
    const trainKeys = ['train_rg_east', 'train_rg_west', 'train_rb_east', 'train_rb_west'];

    updateUI('/api/bus', busKeys);
    updateUI('/api/train', trainKeys);
}

document.addEventListener('DOMContentLoaded', () => {
    refreshAll();
    // Refresh UI every 10 seconds from SQLite cache
    setInterval(refreshAll, 10000); 
});