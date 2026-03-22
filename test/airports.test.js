const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { loadAirports, validate, getRegions, generateTopGreeting, generateRegionGreeting } = require('../src/config/airports');

describe('Airport Configuration', () => {
  describe('loadAirports', () => {
    it('loads the default airports.json as an array', () => {
      const airports = loadAirports();
      assert.ok(Array.isArray(airports));
      assert.ok(airports.length > 0);
    });

    it('each entry has required fields', () => {
      const airports = loadAirports();
      for (const entry of airports) {
        assert.ok(entry.icao, 'missing icao');
        assert.ok(entry.name, 'missing name');
        assert.ok(entry.digit, 'missing digit');
        assert.ok(entry.region, 'missing region');
        assert.ok(entry.regionDigit, 'missing regionDigit');
      }
    });

    it('contains expected airports', () => {
      const airports = loadAirports();
      const icaos = airports.map(a => a.icao);
      assert.ok(icaos.includes('CYVR'));
      assert.ok(icaos.includes('CYPK'));
    });

    it('loads from custom path', () => {
      const tmpFile = path.join(os.tmpdir(), 'test-airports.json');
      fs.writeFileSync(tmpFile, JSON.stringify([
        { region: 'Test Region', regionDigit: '1', icao: 'CXXX', name: 'Test Airport', digit: '9' },
      ]));
      const airports = loadAirports(tmpFile);
      assert.equal(airports[0].icao, 'CXXX');
      fs.unlinkSync(tmpFile);
    });
  });

  describe('validate', () => {
    it('rejects empty array', () => {
      assert.throws(() => validate([]), /non-empty array/);
    });

    it('rejects non-array', () => {
      assert.throws(() => validate('nope'), /non-empty array/);
    });

    it('rejects duplicate region+digit combo', () => {
      assert.throws(() => validate([
        { region: 'R1', regionDigit: '1', icao: 'CAAA', name: 'A', digit: '1' },
        { region: 'R1', regionDigit: '1', icao: 'CBBB', name: 'B', digit: '1' },
      ]), /Duplicate region\+digit combo/);
    });

    it('allows same digit in different regions', () => {
      assert.doesNotThrow(() => validate([
        { region: 'R1', regionDigit: '1', icao: 'CAAA', name: 'A', digit: '1' },
        { region: 'R2', regionDigit: '2', icao: 'CBBB', name: 'B', digit: '1' },
      ]));
    });

    it('rejects entries missing required fields', () => {
      assert.throws(() => validate([
        { icao: 'CAAA', name: 'A' },
      ]), /missing required fields/);
    });

    it('rejects entry missing region', () => {
      assert.throws(() => validate([
        { icao: 'CAAA', name: 'A', digit: '1', regionDigit: '1' },
      ]), /missing required fields/);
    });

    it('rejects entry missing regionDigit', () => {
      assert.throws(() => validate([
        { icao: 'CAAA', name: 'A', digit: '1', region: 'R1' },
      ]), /missing required fields/);
    });

    it('accepts valid config', () => {
      assert.doesNotThrow(() => validate([
        { region: 'R1', regionDigit: '1', icao: 'CAAA', name: 'A', digit: '1' },
        { region: 'R1', regionDigit: '1', icao: 'CBBB', name: 'B', digit: '2' },
      ]));
    });
  });

  describe('getRegions', () => {
    it('groups airports by regionDigit', () => {
      const list = [
        { region: 'Lower Mainland', regionDigit: '1', icao: 'CYVR', name: 'Vancouver', digit: '1' },
        { region: 'Lower Mainland', regionDigit: '1', icao: 'CYPK', name: 'Pitt Meadows', digit: '2' },
        { region: 'Victoria', regionDigit: '2', icao: 'CYYJ', name: 'Victoria', digit: '1' },
      ];
      const regions = getRegions(list);
      assert.equal(Object.keys(regions).length, 2);
      assert.equal(regions['1'].region, 'Lower Mainland');
      assert.equal(regions['1'].airports.length, 2);
      assert.equal(regions['2'].region, 'Victoria');
      assert.equal(regions['2'].airports.length, 1);
    });

    it('sorts airports within each region by digit', () => {
      const list = [
        { region: 'R1', regionDigit: '1', icao: 'CBBB', name: 'Beta', digit: '2' },
        { region: 'R1', regionDigit: '1', icao: 'CAAA', name: 'Alpha', digit: '1' },
      ];
      const regions = getRegions(list);
      assert.equal(regions['1'].airports[0].digit, '1');
      assert.equal(regions['1'].airports[1].digit, '2');
    });

    it('each airport entry has icao, name, and digit', () => {
      const list = [
        { region: 'R1', regionDigit: '1', icao: 'CXXX', name: 'Test', digit: '3' },
      ];
      const regions = getRegions(list);
      const airport = regions['1'].airports[0];
      assert.equal(airport.icao, 'CXXX');
      assert.equal(airport.name, 'Test');
      assert.equal(airport.digit, '3');
    });
  });

  describe('generateTopGreeting', () => {
    it('includes all regions in digit order', () => {
      const regions = {
        '2': { region: 'Victoria', airports: [] },
        '1': { region: 'Lower Mainland', airports: [] },
      };
      const greeting = generateTopGreeting(regions);
      assert.ok(greeting.includes('Press 1 for Lower Mainland.'));
      assert.ok(greeting.includes('Press 2 for Victoria.'));
      assert.ok(greeting.indexOf('Press 1') < greeting.indexOf('Press 2'));
    });

    it('includes welcome text', () => {
      const regions = {
        '1': { region: 'Test', airports: [] },
      };
      const greeting = generateTopGreeting(regions);
      assert.ok(greeting.includes('Welcome to'));
    });

    it('includes joke and about options', () => {
      const regions = {
        '1': { region: 'Test', airports: [] },
      };
      const greeting = generateTopGreeting(regions);
      assert.ok(greeting.includes('Press 9 for an aviation joke'));
      assert.ok(greeting.includes('Press 0 for about'));
    });

    it('updates when regions change', () => {
      const g1 = generateTopGreeting({ '1': { region: 'A', airports: [] } });
      const g2 = generateTopGreeting({
        '1': { region: 'A', airports: [] },
        '2': { region: 'B', airports: [] },
      });
      assert.notEqual(g1, g2);
      assert.ok(g2.includes('Press 2 for B.'));
    });
  });

  describe('generateRegionGreeting', () => {
    it('includes region name and all airports', () => {
      const regionData = {
        region: 'Lower Mainland',
        airports: [
          { icao: 'CYVR', name: 'Vancouver', digit: '1' },
          { icao: 'CYPK', name: 'Pitt Meadows', digit: '2' },
        ],
      };
      const greeting = generateRegionGreeting(regionData);
      assert.ok(greeting.includes('Lower Mainland airports'));
      assert.ok(greeting.includes('Press 1 for Vancouver.'));
      assert.ok(greeting.includes('Press 2 for Pitt Meadows.'));
    });

    it('lists airports in provided order', () => {
      const regionData = {
        region: 'Test',
        airports: [
          { icao: 'CAAA', name: 'Alpha', digit: '1' },
          { icao: 'CBBB', name: 'Beta', digit: '2' },
        ],
      };
      const greeting = generateRegionGreeting(regionData);
      assert.ok(greeting.indexOf('Press 1') < greeting.indexOf('Press 2'));
    });
  });
});
