const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseMetar } = require('../src/data/metar-parser');

describe('METAR Parser', () => {
  describe('LWIS format (auto weather)', () => {
    it('parses LWIS CYPK auto METAR', () => {
      const raw = 'LWIS CYPK 210300Z AUTO 22004KT 190V250 11/05 A3010=';
      const result = parseMetar(raw);

      assert.equal(result.station, 'CYPK');
      assert.equal(result.isLwis, true);
      assert.equal(result.isAuto, true);
      assert.deepStrictEqual(result.time, { day: 21, hour: 3, minute: 0 });
      assert.deepStrictEqual(result.wind, {
        direction: 220,
        speed: 4,
        gust: null,
        variableRange: { from: 190, to: 250 },
      });
      assert.equal(result.temperature, 11);
      assert.equal(result.dewpoint, 5);
      assert.deepStrictEqual(result.altimeter, { unit: 'inHg', value: 30.10 });
    });

    it('parses LWIS with VRB wind', () => {
      const raw = 'LWIS CZBB 210400Z AUTO VRB03KT 08/06 A3012=';
      const result = parseMetar(raw);

      assert.equal(result.station, 'CZBB');
      assert.equal(result.isLwis, true);
      assert.equal(result.wind.direction, 'VRB');
      assert.equal(result.wind.speed, 3);
    });
  });

  describe('Full METAR format', () => {
    it('parses CYVR full METAR', () => {
      const raw = 'METAR CYVR 210300Z 24008G15KT 15SM FEW040 SCT080 BKN120 09/04 A3010 RMK SC2AC3AC2 SLP198';
      const result = parseMetar(raw);

      assert.equal(result.station, 'CYVR');
      assert.equal(result.isLwis, false);
      assert.equal(result.isAuto, false);
      assert.deepStrictEqual(result.wind, {
        direction: 240,
        speed: 8,
        gust: 15,
        variableRange: null,
      });
      assert.deepStrictEqual(result.visibility, { value: 15, modifier: null, unit: 'SM' });
      assert.equal(result.clouds.length, 3);
      assert.deepStrictEqual(result.clouds[0], { coverage: 'FEW', height: 4000, type: null });
      assert.deepStrictEqual(result.clouds[1], { coverage: 'SCT', height: 8000, type: null });
      assert.deepStrictEqual(result.clouds[2], { coverage: 'BKN', height: 12000, type: null });
      assert.equal(result.temperature, 9);
      assert.equal(result.dewpoint, 4);
    });

    it('parses METAR with weather phenomena', () => {
      const raw = 'CYVR 210300Z 18012KT 3SM -RA BR BKN010 OVC025 07/06 A2985';
      const result = parseMetar(raw);

      assert.equal(result.weather.length, 2);
      assert.equal(result.weather[0].code, 'RA');
      assert.equal(result.weather[0].intensity, '-');
      assert.equal(result.weather[0].description, 'light rain');
      assert.equal(result.weather[1].code, 'BR');
      assert.equal(result.weather[1].description, 'mist');
    });

    it('parses P6SM visibility', () => {
      const raw = 'CYVR 210300Z 18005KT P6SM CLR 12/08 A3015';
      const result = parseMetar(raw);

      assert.deepStrictEqual(result.visibility, { value: 6, modifier: 'P', unit: 'SM' });
      assert.deepStrictEqual(result.clouds[0], { coverage: 'CLR', height: null, type: null });
    });

    it('parses negative temperatures', () => {
      const raw = 'CYVR 150300Z 09010KT 10SM OVC020 M02/M05 A3025';
      const result = parseMetar(raw);

      assert.equal(result.temperature, -2);
      assert.equal(result.dewpoint, -5);
    });

    it('parses QNH altimeter (hPa)', () => {
      const raw = 'CYVR 210300Z 18005KT 9999 SCT030 10/05 Q1013';
      const result = parseMetar(raw);

      assert.deepStrictEqual(result.altimeter, { unit: 'hPa', value: 1013 });
      assert.deepStrictEqual(result.visibility, { value: 9999, modifier: null, unit: 'm' });
    });
  });

  describe('edge cases', () => {
    it('returns null for null input', () => {
      assert.equal(parseMetar(null), null);
    });

    it('returns null for empty string', () => {
      assert.equal(parseMetar(''), null);
    });

    it('handles METAR without METAR prefix', () => {
      const raw = 'CYHC 210400Z AUTO 31003KT 09/07 A3011=';
      const result = parseMetar(raw);
      assert.equal(result.station, 'CYHC');
      assert.equal(result.isAuto, true);
    });
  });
});
