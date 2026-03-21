const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { RefreshService } = require('../src/data/refresh-service');

function makeClient(metars = {}, tafs = {}) {
  return {
    async fetchMetar(icao) { return metars[icao] || null; },
    async fetchTaf(icao) { return tafs[icao] || null; },
    async fetchAll(icao) {
      return {
        metar: metars[icao] || null,
        taf: tafs[icao] || null,
        timestamp: new Date(),
      };
    },
  };
}

describe('RefreshService', () => {
  describe('refresh', () => {
    it('populates cache on first refresh', async () => {
      const client = makeClient({
        CYPK: 'LWIS CYPK 210300Z AUTO 22004KT 11/05 A3010=',
        CYVR: 'METAR CYVR 210300Z 24008KT 15SM FEW040 09/04 A3010',
      });
      const service = new RefreshService({ client, airports: ['CYPK', 'CYVR'] });

      const results = await service.refresh();
      assert.deepStrictEqual(results.updated, ['CYPK', 'CYVR']);
      assert.deepStrictEqual(results.unchanged, []);
      assert.deepStrictEqual(results.failed, []);

      assert.ok(service.getAirport('CYPK'));
      assert.ok(service.getAirport('CYVR'));
    });

    it('detects unchanged data on second refresh', async () => {
      const client = makeClient({
        CYPK: 'LWIS CYPK 210300Z AUTO 22004KT 11/05 A3010=',
      });
      const service = new RefreshService({ client, airports: ['CYPK'] });

      await service.refresh();
      const results = await service.refresh();
      assert.deepStrictEqual(results.updated, []);
      assert.deepStrictEqual(results.unchanged, ['CYPK']);
    });

    it('detects changed data', async () => {
      let metar = 'LWIS CYPK 210300Z AUTO 22004KT 11/05 A3010=';
      const client = {
        async fetchMetar() { return metar; },
        async fetchTaf() { return null; },
        async fetchAll() { return { metar, taf: null, timestamp: new Date() }; },
      };
      const service = new RefreshService({ client, airports: ['CYPK'] });

      await service.refresh();
      metar = 'LWIS CYPK 210400Z AUTO 18006KT 10/04 A3008=';
      const results = await service.refresh();
      assert.deepStrictEqual(results.updated, ['CYPK']);
    });

    it('handles fetch failures gracefully', async () => {
      const client = {
        async fetchAll() { throw new Error('Network error'); },
      };
      const service = new RefreshService({ client, airports: ['CYPK'] });

      const results = await service.refresh();
      assert.deepStrictEqual(results.failed, ['CYPK']);
      assert.equal(service.getAirport('CYPK'), null);
    });
  });

  describe('staleness tracking', () => {
    it('reports stale when no data', () => {
      const service = new RefreshService({ airports: ['CYPK'] });
      assert.equal(service.isStale('CYPK'), true);
    });

    it('reports not stale after fresh refresh', async () => {
      const client = makeClient({ CYPK: 'METAR data' });
      const service = new RefreshService({ client, airports: ['CYPK'] });
      await service.refresh();
      assert.equal(service.isStale('CYPK'), false);
    });

    it('reports stale with zero maxAge', async () => {
      const client = makeClient({ CYPK: 'METAR data' });
      const service = new RefreshService({ client, airports: ['CYPK'] });
      await service.refresh();
      // maxAge of 0 means always stale
      assert.equal(service.isStale('CYPK', 0), true);
    });
  });

  describe('speech formatting', () => {
    it('uses formatForSpeech callback when provided', async () => {
      const client = makeClient({ CYPK: 'RAW METAR' });
      const service = new RefreshService({
        client,
        airports: ['CYPK'],
        formatForSpeech: (metar) => `Formatted: ${metar}`,
      });

      await service.refresh();
      assert.equal(service.getSpeech('CYPK'), 'Formatted: RAW METAR');
    });

    it('returns raw metar as speech when no formatter', async () => {
      const client = makeClient({ CYPK: 'RAW METAR' });
      const service = new RefreshService({ client, airports: ['CYPK'] });

      await service.refresh();
      assert.equal(service.getSpeech('CYPK'), 'RAW METAR');
    });
  });

  describe('integration', () => {
    it('fetch -> parse -> cache round trip', async () => {
      const client = makeClient({
        CYVR: 'METAR CYVR 210300Z 24008G15KT 15SM FEW040 SCT080 09/04 A3010 RMK SC2AC3',
      }, {
        CYVR: 'TAF CYVR 210530Z 2106/2206 24008KT P6SM FEW040',
      });
      const service = new RefreshService({ client, airports: ['CYVR'] });

      await service.refresh();
      const entry = service.getAirport('CYVR');

      assert.ok(entry);
      assert.ok(entry.metar);
      assert.ok(entry.taf);
      assert.ok(entry.parsed);
      assert.equal(entry.parsed.station, 'CYVR');
      assert.equal(entry.parsed.wind.speed, 8);
      assert.equal(entry.parsed.wind.gust, 15);
      assert.ok(entry.timestamp instanceof Date);
    });
  });
});
