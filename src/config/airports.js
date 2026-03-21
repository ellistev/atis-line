/**
 * Airport configuration loader.
 * airports.json format:
 * [{ region, regionDigit, icao, name, digit }, ...]
 *
 * regionDigit: top-level IVR key (1 = Lower Mainland, 2 = Victoria, etc.)
 * digit: sub-menu key within that region
 *
 * To add a new region or airport, just edit airports.json - no code changes needed.
 */

const fs = require('node:fs');
const path = require('node:path');

const CONFIG_PATH = path.join(__dirname, '..', '..', 'airports.json');

function loadAirports(configPath = CONFIG_PATH) {
  const raw = fs.readFileSync(configPath, 'utf-8');
  const list = JSON.parse(raw);
  validate(list);
  return list;
}

function validate(list) {
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error('airports.json must be a non-empty array');
  }
  const seen = new Set();
  for (const entry of list) {
    if (!entry.icao || !entry.name || !entry.digit || !entry.region || !entry.regionDigit) {
      throw new Error(`Airport entry missing required fields: ${JSON.stringify(entry)}`);
    }
    const key = `${entry.regionDigit}:${entry.digit}`;
    if (seen.has(key)) throw new Error(`Duplicate region+digit combo: ${key}`);
    seen.add(key);
  }
}

/**
 * Returns a map of regionDigit -> { region, airports: [{icao, name, digit}] }
 */
function getRegions(list) {
  const map = {};
  for (const entry of list) {
    if (!map[entry.regionDigit]) {
      map[entry.regionDigit] = { region: entry.region, airports: [] };
    }
    map[entry.regionDigit].airports.push({ icao: entry.icao, name: entry.name, digit: entry.digit });
  }
  // Sort airports within each region by digit
  for (const r of Object.values(map)) {
    r.airports.sort((a, b) => a.digit.localeCompare(b.digit));
  }
  return map;
}

/**
 * Build top-level IVR greeting.
 */
function generateTopGreeting(regions) {
  const items = Object.entries(regions)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([digit, r]) => `Press ${digit} for ${r.region}.`)
    .join(' ');
  return (
    'Welcome to Lower Mainland and Vancouver Island aviation weather. ' +
    'The service NAV CANADA didn\'t love enough to keep. ' +
    'We\'re not official, but we\'ve got you covered. ' +
    items + ' ' +
    'Press 9 for an aviation joke. Press 0 for about this service.'
  );
}

/**
 * Build sub-menu greeting for a region.
 */
function generateRegionGreeting(regionData) {
  const items = regionData.airports
    .map(a => `Press ${a.digit} for ${a.name}.`)
    .join(' ');
  return `${regionData.region} airports. ${items}`;
}

module.exports = { loadAirports, validate, getRegions, generateTopGreeting, generateRegionGreeting };
