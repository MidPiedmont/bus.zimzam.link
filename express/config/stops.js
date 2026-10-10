const fs = require('fs');
const path = require('path');

const apiFile = fs.readFileSync(path.join(__dirname, '../.env'), 'utf8');
const keys = Object.fromEntries(
    apiFile.split('\n')
        .map(line => line.trim().split(/\s+/))
        .filter(parts => parts.length === 2)
);

module.exports = {
    BUS_API_KEY: keys['bus'],
    TRAIN_API_KEY: keys['train'],
    ENV: keys['env'] || 'prd',
    stops: [
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
    ]
};