const { NavCanadaClient } = require('./navcanada-client');
const { parseMetar } = require('./metar-parser');

const DEFAULT_AIRPORTS = ['CYPK', 'CZBB', 'CYHC', 'CYNJ', 'CYVR'];
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

class RefreshService {
  constructor({ client, airports, formatForSpeech } = {}) {
    this._client = client || new NavCanadaClient();
    this._airports = airports || DEFAULT_AIRPORTS;
    this._formatForSpeech = formatForSpeech || null;
    this._cache = new Map(); // icao -> { metar, taf, parsed, speech, timestamp, lastChanged }
    this._timer = null;
  }

  get cache() {
    return this._cache;
  }

  getAirport(icao) {
    return this._cache.get(icao) || null;
  }

  getSpeech(icao) {
    const entry = this._cache.get(icao);
    return entry ? entry.speech : null;
  }

  isStale(icao, maxAgeMs = REFRESH_INTERVAL_MS * 2) {
    const entry = this._cache.get(icao);
    if (!entry) return true;
    return (Date.now() - entry.timestamp.getTime()) >= maxAgeMs;
  }

  async refresh() {
    const results = { updated: [], unchanged: [], failed: [] };

    const fetches = this._airports.map(async (icao) => {
      try {
        const data = await this._client.fetchAll(icao);
        const prev = this._cache.get(icao);
        const changed = !prev || prev.metar !== data.metar || prev.taf !== data.taf;

        if (changed) {
          const parsed = parseMetar(data.metar);
          const speech = this._formatForSpeech ? this._formatForSpeech(data.metar) : data.metar;
          this._cache.set(icao, {
            metar: data.metar,
            taf: data.taf,
            parsed,
            speech,
            timestamp: data.timestamp,
            lastChanged: data.timestamp,
          });
          results.updated.push(icao);
        } else {
          // Update timestamp but keep existing data
          prev.timestamp = data.timestamp;
          results.unchanged.push(icao);
        }
      } catch (err) {
        console.error(`Refresh failed for ${icao}:`, err.message);
        results.failed.push(icao);
      }
    });

    await Promise.all(fetches);
    return results;
  }

  async start() {
    console.log(`[${new Date().toISOString()}] Refreshing ATIS data...`);
    const results = await this.refresh();
    this._logResults(results);

    this._timer = setInterval(async () => {
      console.log(`[${new Date().toISOString()}] Refreshing ATIS data...`);
      const r = await this.refresh();
      this._logResults(r);
    }, REFRESH_INTERVAL_MS);
  }

  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  _logResults(results) {
    for (const icao of results.updated) console.log(`  ${icao}: updated`);
    for (const icao of results.unchanged) console.log(`  ${icao}: unchanged`);
    for (const icao of results.failed) console.log(`  ${icao}: fetch failed`);
  }
}

module.exports = { RefreshService, DEFAULT_AIRPORTS, REFRESH_INTERVAL_MS };
