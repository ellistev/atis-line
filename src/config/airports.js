const fs = require('node:fs');
const path = require('node:path');

const CONFIG_PATH = path.join(__dirname, '..', '..', 'airports.json');

function loadAirports(configPath = CONFIG_PATH) {
  const raw = fs.readFileSync(configPath, 'utf-8');
  const list = JSON.parse(raw);

  validate(list);

  // Convert array to digit-keyed object matching existing AIRPORTS shape
  const airports = {};
  for (const entry of list) {
    airports[entry.digit] = { icao: entry.icao, name: entry.name, hasTaf: entry.hasTaf };
  }
  return airports;
}

function validate(list) {
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error('airports.json must be a non-empty array');
  }

  const digits = new Set();
  const icaos = new Set();

  for (const entry of list) {
    if (!entry.icao || !entry.name || !entry.digit) {
      throw new Error(`Airport entry missing required fields: ${JSON.stringify(entry)}`);
    }

    if (digits.has(entry.digit)) {
      throw new Error(`Duplicate digit "${entry.digit}" in airports.json`);
    }
    digits.add(entry.digit);

    if (icaos.has(entry.icao)) {
      throw new Error(`Duplicate ICAO "${entry.icao}" in airports.json`);
    }
    icaos.add(entry.icao);
  }
}

function generateGreeting(airports) {
  const menuItems = Object.entries(airports)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([digit, airport]) => `Press ${digit} for ${airport.name}.`)
    .join(' ');

  return (
    'Welcome to Lower Mainland aviation weather. The service NAV CANADA didn\'t love enough to keep. ' +
    'We\'re not official, but we\'ve got you covered. ' +
    'Quick heads up, this is an unofficial automated service and is not affiliated with NAV CANADA. ' +
    'We pull from public data sources and do our best, but always verify with official sources before you fly. ' +
    'Now, let\'s get you that weather. ' +
    menuItems + ' ' +
    'Press 9 for an aviation joke. Press 0 for about this service.'
  );
}

async function verifyAirports(airports) {
  const failed = [];
  for (const airport of Object.values(airports)) {
    try {
      const url = `https://aviationweather.gov/api/data/metar?ids=${airport.icao}&format=raw&hours=1`;
      const res = await fetch(url);
      const text = await res.text();
      if (!text.trim()) {
        failed.push(airport.icao);
      }
    } catch {
      failed.push(airport.icao);
    }
  }
  if (failed.length > 0) {
    console.warn(`Warning: No METAR data for: ${failed.join(', ')}`);
  }
  return failed;
}

module.exports = { loadAirports, validate, generateGreeting, verifyAirports };
