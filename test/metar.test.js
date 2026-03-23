const { describe, it, before, after, mock } = require('node:test');
const assert = require('node:assert/strict');
const { parseMetarLine } = require('../src/data/metar');

describe('METAR', () => {
  describe('parseMetarLine', () => {
    it('parses ICAO and observation time from standard METAR', () => {
      const result = parseMetarLine('CYPR 221800Z 31008KT 15SM FEW040 BKN100 12/08 A2992 RMK CU2SC4');
      assert.deepEqual(result, { icao: 'CYPR', observationTime: '221800Z' });
    });

    it('parses different ICAO codes', () => {
      const result = parseMetarLine('CBBC 150000Z 18005KT 10SM CLR 08/02 A3012');
      assert.deepEqual(result, { icao: 'CBBC', observationTime: '150000Z' });
    });

    it('returns null for invalid METAR line', () => {
      assert.equal(parseMetarLine('not a metar'), null);
    });

    it('returns null for empty string', () => {
      assert.equal(parseMetarLine(''), null);
    });

    it('handles METAR with variable winds', () => {
      const result = parseMetarLine('CZMT 221900Z VRB03KT 20SM SCT050 OVC100 10/06 A2988');
      assert.deepEqual(result, { icao: 'CZMT', observationTime: '221900Z' });
    });
  });

  describe('fetchMetar', () => {
    it('returns empty map for empty list', async () => {
      const { fetchMetar } = require('../src/data/metar');
      const results = await fetchMetar([]);
      assert.equal(results.size, 0);
    });

    it('handles API failure gracefully', async () => {
      // Mock fetch to simulate failure
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => ({ ok: false, status: 500 });
      try {
        const { fetchMetar } = require('../src/data/metar');
        const results = await fetchMetar(['CYPR']);
        assert.equal(results.size, 0);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('parses multi-line response', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => ({
        ok: true,
        text: async () => 'CYPR 221800Z 31008KT 15SM FEW040 12/08 A2992\nCYXT 221800Z 27010KT 10SM SCT030 11/07 A2995\n',
      });
      try {
        const { fetchMetar } = require('../src/data/metar');
        const results = await fetchMetar(['CYPR', 'CYXT']);
        assert.equal(results.size, 2);
        assert.ok(results.has('CYPR'));
        assert.ok(results.has('CYXT'));
        assert.equal(results.get('CYPR').observationTime, '221800Z');
        assert.ok(results.get('CYPR').raw.includes('31008KT'));
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('handles empty response body', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => ({
        ok: true,
        text: async () => '',
      });
      try {
        const { fetchMetar } = require('../src/data/metar');
        const results = await fetchMetar(['CYPR']);
        assert.equal(results.size, 0);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('handles network error gracefully', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => { throw new Error('Network error'); };
      try {
        const { fetchMetar } = require('../src/data/metar');
        const results = await fetchMetar(['CYPR']);
        assert.equal(results.size, 0);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
