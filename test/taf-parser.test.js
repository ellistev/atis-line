const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseTaf,
  parseWind,
  parseVisibility,
  parseClouds,
  splitSegments,
} = require('../src/data/taf-parser');

describe('parseTaf', () => {
  it('returns null for empty input', () => {
    assert.equal(parseTaf(null), null);
    assert.equal(parseTaf(''), null);
    assert.equal(parseTaf(undefined), null);
  });

  it('returns null for non-string input', () => {
    assert.equal(parseTaf(123), null);
    assert.equal(parseTaf({}), null);
  });

  it('returns null for non-TAF text', () => {
    assert.equal(parseTaf('METAR CYVR 181953Z 27015KT P6SM FEW040 BKN100'), null);
  });

  it('parses a basic CYVR TAF', () => {
    const raw = 'TAF CYVR 181730Z 1818/1918 27012KT P6SM FEW040 BKN100';
    const taf = parseTaf(raw);

    assert.equal(taf.icao, 'CYVR');
    assert.equal(taf.issuedTime, '181730');
    assert.equal(taf.validFrom, '1818');
    assert.equal(taf.validTo, '1918');
    assert.ok(taf.periods.length >= 1);
  });

  it('parses TAF with AMD amendment', () => {
    const raw = 'TAF AMD CYVR 181800Z 1818/1918 27015KT P6SM SCT040';
    const taf = parseTaf(raw);

    assert.equal(taf.icao, 'CYVR');
    assert.equal(taf.periods.length, 1);
  });

  it('parses TAF with COR correction', () => {
    const raw = 'TAF COR CYVR 181800Z 1818/1918 27015KT P6SM SCT040';
    const taf = parseTaf(raw);

    assert.equal(taf.icao, 'CYVR');
  });

  it('parses TAF with FM periods', () => {
    const raw = 'TAF CYVR 181730Z 1818/1918 27012KT P6SM FEW040 BKN100 FM182200 30015G25KT P6SM SCT050';
    const taf = parseTaf(raw);

    assert.equal(taf.periods.length, 2);
    assert.equal(taf.periods[0].type, 'base');
    assert.equal(taf.periods[1].type, 'FM');
    assert.equal(taf.periods[1].time, '182200');
  });

  it('parses TAF with TEMPO periods', () => {
    const raw = 'TAF CYVR 181730Z 1818/1918 27012KT P6SM FEW040 TEMPO 1820/1824 4SM BR BKN020';
    const taf = parseTaf(raw);

    assert.equal(taf.periods.length, 2);
    assert.equal(taf.periods[1].type, 'TEMPO');
    assert.equal(taf.periods[1].time, '1820/1824');
  });

  it('parses TAF with BECMG periods', () => {
    const raw = 'TAF CYVR 181730Z 1818/1918 27012KT P6SM FEW040 BECMG 1820/1822 18010KT';
    const taf = parseTaf(raw);

    assert.equal(taf.periods.length, 2);
    assert.equal(taf.periods[1].type, 'BECMG');
    assert.equal(taf.periods[1].time, '1820/1822');
  });

  it('parses TAF with PROB periods', () => {
    const raw = 'TAF CYVR 181730Z 1818/1918 27012KT P6SM FEW040 PROB30 1820/1824 2SM TSRA BKN020CB';
    const taf = parseTaf(raw);

    assert.equal(taf.periods.length, 2);
    assert.equal(taf.periods[1].type, 'PROB');
    assert.equal(taf.periods[1].probability, 30);
  });

  it('parses TAF with multiple change periods', () => {
    const raw = 'TAF CYVR 181730Z 1818/1918 27012KT P6SM FEW040 BKN100 FM182200 30015G25KT P6SM SCT050 FM190200 VRB03KT P6SM FEW060';
    const taf = parseTaf(raw);

    assert.equal(taf.periods.length, 3);
    assert.equal(taf.periods[0].type, 'base');
    assert.equal(taf.periods[1].type, 'FM');
    assert.equal(taf.periods[2].type, 'FM');
  });

  it('parses complex real-world TAF', () => {
    const raw = 'TAF CYVR 181730Z 1818/1918 27012KT P6SM FEW040 BKN100 TEMPO 1818/1822 4SM -RA BR BKN030 FM190000 09008KT P6SM SCT040 BECMG 1906/1908 12015G25KT';
    const taf = parseTaf(raw);

    assert.equal(taf.periods.length, 4);
    assert.equal(taf.periods[0].type, 'base');
    assert.equal(taf.periods[1].type, 'TEMPO');
    assert.equal(taf.periods[2].type, 'FM');
    assert.equal(taf.periods[3].type, 'BECMG');
  });
});

describe('parseTaf - period content', () => {
  it('parses wind in base period', () => {
    const raw = 'TAF CYVR 181730Z 1818/1918 27012KT P6SM FEW040';
    const taf = parseTaf(raw);

    assert.deepEqual(taf.periods[0].wind, { direction: '270', speed: 12 });
  });

  it('parses gusting wind', () => {
    const raw = 'TAF CYVR 181730Z 1818/1918 27015G25KT P6SM SCT040';
    const taf = parseTaf(raw);

    assert.deepEqual(taf.periods[0].wind, { direction: '270', speed: 15, gust: 25 });
  });

  it('parses variable wind', () => {
    const raw = 'TAF CYVR 181730Z 1818/1918 VRB03KT P6SM FEW060';
    const taf = parseTaf(raw);

    assert.deepEqual(taf.periods[0].wind, { direction: 'VRB', speed: 3 });
  });

  it('parses visibility P6SM', () => {
    const raw = 'TAF CYVR 181730Z 1818/1918 27012KT P6SM FEW040';
    const taf = parseTaf(raw);

    assert.equal(taf.periods[0].visibility, 'greater than 6 statute miles');
  });

  it('parses numeric visibility', () => {
    const raw = 'TAF CYVR 181730Z 1818/1918 27012KT 3SM FEW020';
    const taf = parseTaf(raw);

    assert.equal(taf.periods[0].visibility, '3 statute miles');
  });

  it('parses fractional visibility', () => {
    const raw = 'TAF CYVR 181730Z 1818/1918 27012KT 1/2SM FG OVC002';
    const taf = parseTaf(raw);

    assert.equal(taf.periods[0].visibility, '1/2 statute miles');
  });

  it('parses weather phenomena', () => {
    const raw = 'TAF CYVR 181730Z 1818/1918 27012KT 4SM -RA BR BKN030';
    const taf = parseTaf(raw);

    assert.ok(taf.periods[0].weather);
    assert.ok(taf.periods[0].weather.includes('-RA'));
    assert.ok(taf.periods[0].weather.includes('BR'));
  });

  it('parses cloud layers', () => {
    const raw = 'TAF CYVR 181730Z 1818/1918 27012KT P6SM FEW040 BKN100';
    const taf = parseTaf(raw);

    assert.equal(taf.periods[0].clouds.length, 2);
    assert.deepEqual(taf.periods[0].clouds[0], { type: 'FEW', altitude: 4000, cb: null });
    assert.deepEqual(taf.periods[0].clouds[1], { type: 'BKN', altitude: 10000, cb: null });
  });

  it('parses CB clouds', () => {
    const raw = 'TAF CYVR 181730Z 1818/1918 27012KT P6SM BKN020CB';
    const taf = parseTaf(raw);

    assert.equal(taf.periods[0].clouds[0].cb, 'CB');
  });

  it('parses TCU clouds', () => {
    const raw = 'TAF CYVR 181730Z 1818/1918 27012KT P6SM SCT040TCU';
    const taf = parseTaf(raw);

    assert.equal(taf.periods[0].clouds[0].cb, 'TCU');
  });

  it('parses SKC in forecast', () => {
    const raw = 'TAF CYVR 181730Z 1818/1918 27012KT P6SM SKC';
    const taf = parseTaf(raw);

    assert.equal(taf.periods[0].clouds[0].type, 'SKC');
  });

  it('parses NSW (no significant weather)', () => {
    const raw = 'TAF CYVR 181730Z 1818/1918 27012KT P6SM FEW040 FM182200 30015KT P6SM NSW SCT050';
    const taf = parseTaf(raw);

    assert.ok(taf.periods[1].weather);
    assert.ok(taf.periods[1].weather.includes('NSW'));
  });

  it('parses wind in FM period', () => {
    const raw = 'TAF CYVR 181730Z 1818/1918 27012KT P6SM FEW040 FM182200 30015G25KT P6SM SCT050';
    const taf = parseTaf(raw);

    assert.deepEqual(taf.periods[1].wind, { direction: '300', speed: 15, gust: 25 });
  });
});

describe('parseWind', () => {
  it('parses standard wind', () => {
    assert.deepEqual(parseWind('27015KT'), { direction: '270', speed: 15 });
  });

  it('parses gusting wind', () => {
    assert.deepEqual(parseWind('30015G25KT'), { direction: '300', speed: 15, gust: 25 });
  });

  it('parses variable wind', () => {
    assert.deepEqual(parseWind('VRB03KT'), { direction: 'VRB', speed: 3 });
  });

  it('parses calm wind', () => {
    assert.deepEqual(parseWind('00000KT'), { direction: '000', speed: 0 });
  });

  it('parses three-digit speed', () => {
    assert.deepEqual(parseWind('270100KT'), { direction: '270', speed: 100 });
  });

  it('returns null for invalid input', () => {
    assert.equal(parseWind('INVALID'), null);
  });
});

describe('parseVisibility', () => {
  it('parses P6SM', () => {
    assert.equal(parseVisibility('P6SM'), 'greater than 6 statute miles');
  });

  it('parses numeric visibility', () => {
    assert.equal(parseVisibility('3SM'), '3 statute miles');
  });

  it('parses fractional visibility', () => {
    assert.equal(parseVisibility('1/2SM'), '1/2 statute miles');
  });
});

describe('parseClouds', () => {
  it('parses FEW layer', () => {
    assert.deepEqual(parseClouds('FEW040'), { type: 'FEW', altitude: 4000, cb: null });
  });

  it('parses BKN layer', () => {
    assert.deepEqual(parseClouds('BKN100'), { type: 'BKN', altitude: 10000, cb: null });
  });

  it('parses OVC layer', () => {
    assert.deepEqual(parseClouds('OVC002'), { type: 'OVC', altitude: 200, cb: null });
  });

  it('parses CB suffix', () => {
    assert.deepEqual(parseClouds('BKN020CB'), { type: 'BKN', altitude: 2000, cb: 'CB' });
  });

  it('parses TCU suffix', () => {
    assert.deepEqual(parseClouds('SCT050TCU'), { type: 'SCT', altitude: 5000, cb: 'TCU' });
  });

  it('parses SKC', () => {
    const result = parseClouds('SKC');
    assert.equal(result.type, 'SKC');
    assert.equal(result.text, 'sky clear');
  });

  it('parses CLR', () => {
    const result = parseClouds('CLR');
    assert.equal(result.type, 'CLR');
    assert.equal(result.text, 'clear');
  });

  it('parses NSC', () => {
    const result = parseClouds('NSC');
    assert.equal(result.type, 'NSC');
    assert.equal(result.text, 'no significant clouds');
  });
});

describe('splitSegments', () => {
  it('splits body with no change indicators', () => {
    const segments = splitSegments('27012KT P6SM FEW040');
    assert.equal(segments.length, 1);
    assert.equal(segments[0].type, 'base');
  });

  it('splits body with FM indicator', () => {
    const segments = splitSegments('27012KT P6SM FEW040 FM182200 30015KT P6SM SCT050');
    assert.equal(segments.length, 2);
    assert.equal(segments[0].type, 'base');
    assert.equal(segments[1].type, 'FM');
  });

  it('splits body with multiple indicators', () => {
    const segments = splitSegments('27012KT P6SM FEW040 FM182200 30015KT P6SM TEMPO 1900/1906 4SM BR');
    assert.equal(segments.length, 3);
    assert.equal(segments[0].type, 'base');
    assert.equal(segments[1].type, 'FM');
    assert.equal(segments[2].type, 'TEMPO');
  });

  it('splits body with BECMG indicator', () => {
    const segments = splitSegments('27012KT P6SM FEW040 BECMG 1820/1822 18010KT');
    assert.equal(segments.length, 2);
    assert.equal(segments[1].type, 'BECMG');
  });

  it('splits body with PROB indicator', () => {
    const segments = splitSegments('27012KT P6SM FEW040 PROB30 1820/1824 2SM TSRA');
    assert.equal(segments.length, 2);
    assert.equal(segments[1].type, 'PROB');
    assert.equal(segments[1].probability, 30);
  });
});
