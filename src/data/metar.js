/**
 * METAR fetcher for airports without D-ATIS (e.g. North Coast).
 * Uses the free aviationweather.gov API - no auth, no browser needed.
 */

const logger = require('../logger');

const METAR_API = 'https://aviationweather.gov/api/data/metar';

/**
 * Fetch raw METAR strings for a list of ICAO codes.
 * @param {string[]} icaoList - Array of ICAO codes
 * @returns {Promise<Map<string, { raw: string, observationTime: string }>>}
 */
async function fetchMetar(icaoList) {
  const results = new Map();
  if (!icaoList.length) return results;

  const ids = icaoList.join(',');
  const url = `${METAR_API}?ids=${ids}&format=raw&hours=3`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      logger.error(`[METAR] API error: ${res.status}`);
      return results;
    }

    const text = await res.text();
    if (!text.trim()) return results;

    // Response is one METAR per line
    const lines = text.trim().split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const parsed = parseMetarLine(trimmed);
      if (parsed) {
        results.set(parsed.icao, { raw: trimmed, observationTime: parsed.observationTime });
      }
    }
  } catch (err) {
    logger.error(`[METAR] Fetch failed: ${err.message}`);
  }

  return results;
}

/**
 * Parse ICAO and observation time from a raw METAR line.
 * METAR format: "METAR CYPR 221800Z 31008KT ..." or "SPECI CYPR 221800Z ..."
 * Also handles lines without the METAR/SPECI prefix: "CYPR 221800Z 31008KT ..."
 * @param {string} line
 * @returns {{ icao: string, observationTime: string } | null}
 */
function parseMetarLine(line) {
  const match = line.match(/^(?:(?:METAR|SPECI)\s+)?([A-Z]{4})\s+(\d{6}Z)\s/);
  if (!match) return null;
  return { icao: match[1], observationTime: match[2] };
}

module.exports = { fetchMetar, parseMetarLine };
