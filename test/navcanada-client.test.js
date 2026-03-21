const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { NavCanadaClient } = require('../src/data/navcanada-client');

function mockFetch(responses) {
  return async (url) => {
    const key = Object.keys(responses).find(k => url.includes(k));
    const body = key ? responses[key] : { data: [] };
    return { ok: true, json: async () => body };
  };
}

describe('NavCanadaClient', () => {
  describe('fetchMetar', () => {
    it('returns latest METAR text from API response', async () => {
      const client = new NavCanadaClient({
        fetch: mockFetch({
          'alpha=metar': {
            meta: { now: '2026-03-21T03:17:33.428', count: { metar: 1 } },
            data: [{
              type: 'metar',
              pk: '769671881',
              location: 'CYPK',
              startValidity: '2026-03-21T03:00:00',
              text: 'LWIS CYPK 210300Z AUTO 22004KT 190V250 11/05 A3010=',
            }],
          },
        }),
      });

      const result = await client.fetchMetar('CYPK');
      assert.equal(result, 'LWIS CYPK 210300Z AUTO 22004KT 190V250 11/05 A3010=');
    });

    it('returns null when no METAR data', async () => {
      const client = new NavCanadaClient({
        fetch: mockFetch({ 'alpha=metar': { data: [] } }),
      });
      const result = await client.fetchMetar('XXXX');
      assert.equal(result, null);
    });

    it('filters out non-metar types', async () => {
      const client = new NavCanadaClient({
        fetch: mockFetch({
          'alpha=metar': {
            data: [
              { type: 'taf', text: 'TAF data' },
              { type: 'metar', text: 'METAR data' },
            ],
          },
        }),
      });
      const result = await client.fetchMetar('CYVR');
      assert.equal(result, 'METAR data');
    });

    it('throws on non-ok response', async () => {
      const client = new NavCanadaClient({
        fetch: async () => ({ ok: false, status: 500, statusText: 'Internal Server Error' }),
      });
      await assert.rejects(() => client.fetchMetar('CYVR'), /NAV CANADA API error: 500/);
    });
  });

  describe('fetchTaf', () => {
    it('returns latest TAF text', async () => {
      const client = new NavCanadaClient({
        fetch: mockFetch({
          'alpha=taf': {
            data: [{ type: 'taf', text: 'TAF CYVR 210530Z ...' }],
          },
        }),
      });
      const result = await client.fetchTaf('CYVR');
      assert.equal(result, 'TAF CYVR 210530Z ...');
    });

    it('returns null when no TAF available', async () => {
      const client = new NavCanadaClient({
        fetch: mockFetch({ 'alpha=taf': { data: [] } }),
      });
      const result = await client.fetchTaf('CYPK');
      assert.equal(result, null);
    });
  });

  describe('fetchAll', () => {
    it('returns metar, taf, and timestamp', async () => {
      const client = new NavCanadaClient({
        fetch: mockFetch({
          'alpha=metar': { data: [{ type: 'metar', text: 'METAR CYVR ...' }] },
          'alpha=taf': { data: [{ type: 'taf', text: 'TAF CYVR ...' }] },
        }),
      });
      const result = await client.fetchAll('CYVR');
      assert.equal(result.metar, 'METAR CYVR ...');
      assert.equal(result.taf, 'TAF CYVR ...');
      assert.ok(result.timestamp instanceof Date);
    });
  });
});
