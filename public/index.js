async function refreshAll() {
    try {
        const res = await fetch('/api/bus-data');
        const dbData = await res.json();

        const stopKeys = ['r20e', 'r20w', 'r49n', 'r49s', 'r52n', 'r52s'];

        stopKeys.forEach(key => {
            const container = document.querySelector(`.${key}`);
            if (container && dbData[key]) {
                // Parse the JSON string back into an array
                const times = JSON.parse(dbData[key]);

                // Clear the container and build new elements
                container.innerHTML = ''; 

                times.forEach(t => {
                    const span = document.createElement('span');
                    if (t === "DUE") {
                        span.className = 'arrival-pill';
                        span.innerText = 'DUE';
                    } else if (t === "No service") {
                        span.innerText = t;
                    } else {
                        span.className = 'arrival-time';
                        span.innerText = `${t}m`;
                    }
                    container.appendChild(span);
                });
            }
        });
    } catch (err) {
        console.error("UI Sync Error:", err);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    refreshAll();
    // Frontend updates every 10s from our local SQLite cache
    setInterval(refreshAll, 10000); 
});