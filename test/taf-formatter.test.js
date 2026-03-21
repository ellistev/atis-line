const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  formatTafSpeech,
  formatTafPeriod,
  formatTafTime,
  formatTafWind,
  formatTafClouds,
} = require('../src/data/taf-formatter');

describe('formatTafTime', () => {
  it('formats FM time (ddHHmm) extracting HHmm', () => {
    const result = formatTafTime('182200', 'FM');
    assert.equal(result, 'two two zero zero zulu');
  });

  it('formats FM time with midnight', () => {
    const result = formatTafTime('190000', 'FM');
    assert.equal(result, 'zero zero zero zero zulu');
  });

  it('formats range time (ddHH/ddHH)', () => {
    const result = formatTafTime('1820/1824', 'TEMPO');
    assert.equal(result, 'two zero zero zero to two four zero zero zulu');
  });

  it('formats BECMG range time', () => {
    const result = formatTafTime('1906/1908', 'BECMG');
    assert.equal(result, 'zero six zero zero to zero eight zero zero zulu');
  });

  it('returns empty string for null time', () => {
    assert.equal(formatTafTime(null, 'base'), '');
  });
});

describe('formatTafWind', () => {
  it('formats standard wind', () => {
    const result = formatTafWind({ direction: '270', speed: 12 });
    assert.equal(result, 'wind two seven zero at one two');
  });

  it('formats gusting wind', () => {
    const result = formatTafWind({ direction: '300', speed: 15, gust: 25 });
    assert.equal(result, 'wind three zero zero at one five gusting two five');
  });

  it('formats variable wind', () => {
    const result = formatTafWind({ direction: 'VRB', speed: 3 });
    assert.equal(result, 'wind variable at three');
  });

  it('returns null for null wind', () => {
    assert.equal(formatTafWind(null), null);
  });

  it('returns null for undefined wind', () => {
    assert.equal(formatTafWind(undefined), null);
  });
});

describe('formatTafClouds', () => {
  it('formats FEW cloud layer', () => {
    const result = formatTafClouds([{ type: 'FEW', altitude: 4000, cb: null }]);
    assert.equal(result, 'few clouds at four thousand');
  });

  it('formats BKN cloud layer', () => {
    const result = formatTafClouds([{ type: 'BKN', altitude: 3000, cb: null }]);
    assert.equal(result, 'broken three thousand');
  });

  it('formats OVC cloud layer', () => {
    const result = formatTafClouds([{ type: 'OVC', altitude: 200, cb: null }]);
    assert.equal(result, 'overcast two hundred');
  });

  it('formats multiple cloud layers', () => {
    const result = formatTafClouds([
      { type: 'FEW', altitude: 4000, cb: null },
      { type: 'BKN', altitude: 8000, cb: null },
    ]);
    assert.equal(result, 'few clouds at four thousand, broken eight thousand');
  });

  it('formats CB cloud', () => {
    const result = formatTafClouds([{ type: 'BKN', altitude: 2000, cb: 'CB' }]);
    assert.equal(result, 'broken two thousand cumulonimbus');
  });

  it('formats TCU cloud', () => {
    const result = formatTafClouds([{ type: 'SCT', altitude: 5000, cb: 'TCU' }]);
    assert.equal(result, 'scattered clouds at five thousand towering cumulus');
  });

  it('formats SKC', () => {
    const result = formatTafClouds([{ type: 'SKC', altitude: 0, text: 'sky clear' }]);
    assert.equal(result, 'sky clear');
  });

  it('formats NSC', () => {
    const result = formatTafClouds([{ type: 'NSC', altitude: 0, text: 'no significant clouds' }]);
    assert.equal(result, 'no significant clouds');
  });

  it('returns null for empty array', () => {
    assert.equal(formatTafClouds([]), null);
  });

  it('returns null for null input', () => {
    assert.equal(formatTafClouds(null), null);
  });
});

describe('formatTafPeriod', () => {
  it('formats a base period with wind and visibility', () => {
    const period = {
      type: 'base',
      time: null,
      wind: { direction: '270', speed: 12 },
      visibility: 'greater than 6 statute miles',
    };
    const result = formatTafPeriod(period);
    assert.ok(result.includes('wind two seven zero at one two'));
    assert.ok(result.includes('visibility greater than 6 statute miles'));
  });

  it('formats a FM period', () => {
    const period = {
      type: 'FM',
      time: '182200',
      wind: { direction: '300', speed: 15, gust: 25 },
      visibility: 'greater than 6 statute miles',
    };
    const result = formatTafPeriod(period);
    assert.ok(result.startsWith('From two two zero zero zulu'));
    assert.ok(result.includes('gusting two five'));
  });

  it('formats a TEMPO period', () => {
    const period = {
      type: 'TEMPO',
      time: '1820/1824',
      visibility: '4 statute miles',
      weather: ['BR'],
      clouds: [{ type: 'BKN', altitude: 2000, cb: null }],
    };
    const result = formatTafPeriod(period);
    assert.ok(result.startsWith('Temporarily'));
    assert.ok(result.includes('mist'));
    assert.ok(result.includes('broken two thousand'));
  });

  it('formats a BECMG period', () => {
    const period = {
      type: 'BECMG',
      time: '1906/1908',
      wind: { direction: '120', speed: 15, gust: 25 },
    };
    const result = formatTafPeriod(period);
    assert.ok(result.startsWith('Becoming'));
  });

  it('formats a PROB period', () => {
    const period = {
      type: 'PROB',
      time: '1820/1824',
      probability: 30,
      weather: ['TSRA'],
      clouds: [{ type: 'BKN', altitude: 2000, cb: 'CB' }],
    };
    const result = formatTafPeriod(period);
    assert.ok(result.includes('30 percent probability'));
    assert.ok(result.includes('thunderstorm with rain'));
    assert.ok(result.includes('cumulonimbus'));
  });

  it('formats NSW weather', () => {
    const period = {
      type: 'FM',
      time: '182200',
      wind: { direction: '300', speed: 15 },
      weather: ['NSW'],
    };
    const result = formatTafPeriod(period);
    assert.ok(result.includes('no significant weather'));
  });

  it('ends with a period', () => {
    const period = {
      type: 'base',
      time: null,
      wind: { direction: '270', speed: 12 },
    };
    const result = formatTafPeriod(period);
    assert.ok(result.endsWith('.'));
  });
});

describe('formatTafSpeech', () => {
  it('returns empty string for null TAF', () => {
    assert.equal(formatTafSpeech(null), '');
  });

  it('returns empty string for TAF with no periods', () => {
    assert.equal(formatTafSpeech({ periods: [] }), '');
  });

  it('starts with "Forecast."', () => {
    const taf = {
      periods: [{
        type: 'base',
        time: null,
        wind: { direction: '270', speed: 12 },
        visibility: 'greater than 6 statute miles',
      }],
    };
    const result = formatTafSpeech(taf);
    assert.ok(result.startsWith('Forecast.'));
  });

  it('limits to maxPeriods', () => {
    const taf = {
      periods: [
        { type: 'base', time: null, wind: { direction: '270', speed: 12 } },
        { type: 'FM', time: '182200', wind: { direction: '300', speed: 15 } },
        { type: 'FM', time: '190200', wind: { direction: '090', speed: 8 } },
        { type: 'BECMG', time: '1906/1908', wind: { direction: '120', speed: 15 } },
      ],
    };

    const result3 = formatTafSpeech(taf, 3);
    const result2 = formatTafSpeech(taf, 2);

    // Count periods (lines after "Forecast.")
    const lines3 = result3.split('\n').filter(l => l.trim()).length;
    const lines2 = result2.split('\n').filter(l => l.trim()).length;

    assert.equal(lines3, 4); // "Forecast." + 3 periods
    assert.equal(lines2, 3); // "Forecast." + 2 periods
  });

  it('formats a complete multi-period TAF', () => {
    const taf = {
      periods: [
        {
          type: 'base',
          time: null,
          wind: { direction: '270', speed: 12 },
          visibility: 'greater than 6 statute miles',
          clouds: [{ type: 'FEW', altitude: 4000, cb: null }, { type: 'BKN', altitude: 10000, cb: null }],
        },
        {
          type: 'FM',
          time: '182200',
          wind: { direction: '300', speed: 15, gust: 25 },
          visibility: 'greater than 6 statute miles',
          clouds: [{ type: 'SCT', altitude: 5000, cb: null }],
        },
        {
          type: 'TEMPO',
          time: '1820/1824',
          visibility: '4 statute miles',
          weather: ['-RA', 'BR'],
          clouds: [{ type: 'BKN', altitude: 3000, cb: null }],
        },
      ],
    };
    const result = formatTafSpeech(taf);

    assert.ok(result.includes('Forecast.'));
    assert.ok(result.includes('wind two seven zero'));
    assert.ok(result.includes('From two two zero zero zulu'));
    assert.ok(result.includes('Temporarily'));
    assert.ok(result.includes('light rain'));
  });

  it('uses default maxPeriods of 3', () => {
    const taf = {
      periods: [
        { type: 'base', time: null, wind: { direction: '270', speed: 12 } },
        { type: 'FM', time: '182200', wind: { direction: '300', speed: 15 } },
        { type: 'FM', time: '190200', wind: { direction: '090', speed: 8 } },
        { type: 'BECMG', time: '1906/1908', wind: { direction: '120', speed: 15 } },
        { type: 'FM', time: '191200', wind: { direction: '180', speed: 10 } },
      ],
    };

    const result = formatTafSpeech(taf);
    const lines = result.split('\n').filter(l => l.trim()).length;
    assert.equal(lines, 4); // "Forecast." + 3 periods
  });
});

describe('integration: parseTaf + formatTafSpeech', () => {
  const { parseTaf } = require('../src/data/taf-parser');

  it('parses and formats a CYVR TAF end-to-end', () => {
    const raw = 'TAF CYVR 181730Z 1818/1918 27012KT P6SM FEW040 BKN100 FM182200 30015G25KT P6SM SCT050 TEMPO 1900/1906 4SM -RA BR BKN030';
    const taf = parseTaf(raw);
    const speech = formatTafSpeech(taf);

    assert.ok(speech.startsWith('Forecast.'));
    assert.ok(speech.includes('wind two seven zero at one two'));
    assert.ok(speech.includes('From two two zero zero zulu'));
    assert.ok(speech.includes('gusting two five'));
    assert.ok(speech.includes('Temporarily'));
    assert.ok(speech.includes('light rain'));
    assert.ok(speech.includes('mist'));
  });

  it('handles TAF with only base period', () => {
    const raw = 'TAF CYVR 181730Z 1818/1918 27012KT P6SM FEW040';
    const taf = parseTaf(raw);
    const speech = formatTafSpeech(taf);

    assert.ok(speech.startsWith('Forecast.'));
    assert.ok(speech.includes('wind two seven zero'));
  });

  it('returns empty for unparseable TAF', () => {
    const speech = formatTafSpeech(null);
    assert.equal(speech, '');
  });
});
