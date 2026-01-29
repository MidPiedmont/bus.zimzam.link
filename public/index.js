// A reusable function to process arrivals for any endpoint
async function updateUI(endpoint, keys) {
    try {
        const res = await fetch(endpoint);
        const dbData = await res.json();

        keys.forEach(key => {
            const container = document.querySelector(`.${key}`);
            // Check if container exists and data is available for this stop
            if (container && dbData[key]) {
                const times = JSON.parse(dbData[key]);
                container.innerHTML = ''; 

                times.forEach(t => {
                    const span = document.createElement('span');
                    
                    // Logic: DUE or less than 10 mins gets the "pill" look
                    if (t === "DUE" || (+t > 0 && +t < 10)) {
                        span.className = 'due';
                        span.innerText = (t === "DUE") ? 'DUE' : `${t}m`;
                    } 
                    // Regular arrivals (10 mins or more)
                    else if (+t) {
                        span.className = 'arrival';
                        span.innerText = `${t}m`; 
                    } 
                    // Handle "DLY" or "No Service"
                    else {
                        span.className = 'delay';
                        span.innerText = t;
                    } 
                    container.appendChild(span);
                });
            }
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