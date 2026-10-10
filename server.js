const express = require('express');
const { startTransitSync } = require('./express/services/transitSync');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static frontend assets
app.use(express.static('public'));

// Map out individual route files
app.use('/api/bus', require('./express/api/bus.js'));
app.use('/api/train', require('./express/api/train.js'));

// Kick off background sync worker
startTransitSync();

// Start app
app.listen(PORT, () => {
    console.log(`Transit Server running on http://localhost:${PORT}`);
});