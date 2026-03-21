const BASE_URL = 'https://plan.navcanada.ca/weather/api/alpha/';

class NavCanadaClient {
  constructor({ fetch: fetchFn } = {}) {
    this._fetch = fetchFn || globalThis.fetch;
  }

  async fetchMetar(icao) {
    const url = `${BASE_URL}?site=${encodeURIComponent(icao)}&alpha=metar&metar_choice=3`;
    const res = await this._fetch(url);
    if (!res.ok) {
      throw new Error(`NAV CANADA API error: ${res.status} ${res.statusText}`);
    }
    const json = await res.json();
    const metars = (json.data || []).filter(d => d.type === 'metar');
    if (metars.length === 0) return null;
    // Return most recent METAR text
    return metars[0].text || null;
  }

  async fetchTaf(icao) {
    const url = `${BASE_URL}?site=${encodeURIComponent(icao)}&alpha=taf`;
    const res = await this._fetch(url);
    if (!res.ok) {
      throw new Error(`NAV CANADA API error: ${res.status} ${res.statusText}`);
    }
    const json = await res.json();
    const tafs = (json.data || []).filter(d => d.type === 'taf');
    if (tafs.length === 0) return null;
    return tafs[0].text || null;
  }

  async fetchAll(icao) {
    const [metar, taf] = await Promise.all([
      this.fetchMetar(icao),
      this.fetchTaf(icao),
    ]);
    return { metar, taf, timestamp: new Date() };
  }
}

module.exports = { NavCanadaClient };
