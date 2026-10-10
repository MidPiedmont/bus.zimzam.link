const express = require('express');
const router = express.Router();
const { getArrivalsQuery } = require('../db/database');

router.get('/', (req, res) => {
    try {
        const rows = getArrivalsQuery.all('train_%');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;