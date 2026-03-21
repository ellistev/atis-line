const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { loadAirports, validate, generateGreeting } = require('../src/config/airports');

describe('Airport Configuration', () => {
  describe('loadAirports', () => {
    it('loads the default airports.json', () => {
      const airports = loadAirports();
      assert.ok(airports['1']);
      assert.equal(airports['1'].icao, 'CYPK');
      assert.equal(airports['1'].name, 'Pitt Meadows');
    });

    it('returns digit-keyed object', () => {
      const airports = loadAirports();
      const digits = Object.keys(airports).sort();
      assert.deepEqual(digits, ['1', '2', '3', '4', '5']);
    });

    it('preserves hasTaf flag', () => {
      const airports = loadAirports();
      assert.equal(airports['5'].hasTaf, true);
      assert.equal(airports['1'].hasTaf, false);
    });

    it('loads from custom path', () => {
      const tmpFile = path.join(os.tmpdir(), 'test-airports.json');
      fs.writeFileSync(tmpFile, JSON.stringify([
        { icao: 'CXXX', name: 'Test Airport', digit: '9', hasTaf: false },
      ]));
      const airports = loadAirports(tmpFile);
      assert.equal(airports['9'].icao, 'CXXX');
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

    it('rejects duplicate digits', () => {
      assert.throws(() => validate([
        { icao: 'CAAA', name: 'A', digit: '1', hasTaf: false },
        { icao: 'CBBB', name: 'B', digit: '1', hasTaf: false },
      ]), /Duplicate digit "1"/);
    });

    it('rejects duplicate ICAO codes', () => {
      assert.throws(() => validate([
        { icao: 'CAAA', name: 'A', digit: '1', hasTaf: false },
        { icao: 'CAAA', name: 'B', digit: '2', hasTaf: false },
      ]), /Duplicate ICAO "CAAA"/);
    });

    it('rejects entries missing required fields', () => {
      assert.throws(() => validate([
        { icao: 'CAAA', name: 'A' },
      ]), /missing required fields/);
    });

    it('accepts valid config', () => {
      assert.doesNotThrow(() => validate([
        { icao: 'CAAA', name: 'A', digit: '1', hasTaf: false },
        { icao: 'CBBB', name: 'B', digit: '2', hasTaf: true },
      ]));
    });
  });

  describe('generateGreeting', () => {
    it('includes all airports in digit order', () => {
      const airports = {
        '2': { icao: 'CBBB', name: 'Beta Airport' },
        '1': { icao: 'CAAA', name: 'Alpha Airport' },
      };
      const greeting = generateGreeting(airports);
      assert.ok(greeting.includes('Press 1 for Alpha Airport.'));
      assert.ok(greeting.includes('Press 2 for Beta Airport.'));
      // Alpha before Beta (sorted by digit)
      assert.ok(greeting.indexOf('Press 1') < greeting.indexOf('Press 2'));
    });

    it('includes disclaimer text', () => {
      const airports = {
        '1': { icao: 'CAAA', name: 'Test' },
      };
      const greeting = generateGreeting(airports);
      assert.ok(greeting.includes('unofficial automated service'));
      assert.ok(greeting.includes('not affiliated with NAV CANADA'));
    });

    it('updates when airports change', () => {
      const g1 = generateGreeting({ '1': { icao: 'CAAA', name: 'A' } });
      const g2 = generateGreeting({
        '1': { icao: 'CAAA', name: 'A' },
        '2': { icao: 'CBBB', name: 'B' },
      });
      assert.notEqual(g1, g2);
      assert.ok(g2.includes('Press 2 for B.'));
    });
  });
});
