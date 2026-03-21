const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const {
  pronounceNumber,
  pronounceDigit,
  pronounceAltitude,
  pronounceAltimeter,
  pronounceRunway,
  pronounceTemperature,
  translateWeather,
  formatCloudLayers,
  getAtisLetter,
  resetAtisState,
  formatAtis,
  NATO_ALPHABET,
} = require('../src/speech/formatter');

describe('pronounceNumber', () => {
  it('pronounces single digits', () => {
    assert.equal(pronounceNumber('0'), 'zero');
    assert.equal(pronounceNumber('9'), 'niner');
  });

  it('pronounces multi-digit numbers digit by digit', () => {
    assert.equal(pronounceNumber('180'), 'one eight zero');
    assert.equal(pronounceNumber('080'), 'zero eight zero');
    assert.equal(pronounceNumber('1953'), 'one niner five three');
  });

  it('pronounces wind directions', () => {
    assert.equal(pronounceNumber('080'), 'zero eight zero');
    assert.equal(pronounceNumber('270'), 'two seven zero');
    assert.equal(pronounceNumber('360'), 'three six zero');
  });
});

describe('pronounceAltitude', () => {
  it('pronounces thousands', () => {
    assert.equal(pronounceAltitude(3000), 'three thousand');
    assert.equal(pronounceAltitude(5000), 'five thousand');
  });

  it('pronounces thousands and hundreds', () => {
    assert.equal(pronounceAltitude(3500), 'three thousand five hundred');
    assert.equal(pronounceAltitude(1200), 'one thousand two hundred');
  });

  it('pronounces hundreds only', () => {
    assert.equal(pronounceAltitude(500), 'five hundred');
    assert.equal(pronounceAltitude(200), 'two hundred');
  });

  it('pronounces common cloud altitudes', () => {
    assert.equal(pronounceAltitude(2000), 'two thousand');
    assert.equal(pronounceAltitude(1000), 'one thousand');
  });
});

describe('pronounceAltimeter', () => {
  it('pronounces altimeter with decimal', () => {
    assert.equal(pronounceAltimeter('30.02'), 'three zero decimal zero two');
    assert.equal(pronounceAltimeter('29.92'), 'two niner decimal niner two');
  });

  it('pronounces altimeter without decimal', () => {
    assert.equal(pronounceAltimeter('3002'), 'three zero zero two');
  });
});

describe('pronounceRunway', () => {
  it('pronounces runway with right suffix', () => {
    assert.equal(pronounceRunway('08R'), 'zero eight right');
  });

  it('pronounces runway with left suffix', () => {
    assert.equal(pronounceRunway('26L'), 'two six left');
  });

  it('pronounces runway with center suffix', () => {
    assert.equal(pronounceRunway('09C'), 'zero niner center');
  });

  it('pronounces runway without suffix', () => {
    assert.equal(pronounceRunway('08'), 'zero eight');
    assert.equal(pronounceRunway('36'), 'three six');
  });
});

describe('pronounceTemperature', () => {
  it('pronounces positive temperatures', () => {
    assert.equal(pronounceTemperature(8), 'eight');
    assert.equal(pronounceTemperature(0), 'zero');
  });

  it('pronounces negative temperatures', () => {
    assert.equal(pronounceTemperature(-5), 'minus five');
    assert.equal(pronounceTemperature(-1), 'minus one');
  });
});

describe('translateWeather', () => {
  it('translates simple phenomena', () => {
    assert.equal(translateWeather('RA'), 'rain');
    assert.equal(translateWeather('SN'), 'snow');
    assert.equal(translateWeather('BR'), 'mist');
    assert.equal(translateWeather('FG'), 'fog');
    assert.equal(translateWeather('DZ'), 'drizzle');
    assert.equal(translateWeather('HZ'), 'haze');
    assert.equal(translateWeather('FU'), 'smoke');
    assert.equal(translateWeather('GR'), 'hail');
    assert.equal(translateWeather('IC'), 'ice crystals');
    assert.equal(translateWeather('PL'), 'ice pellets');
    assert.equal(translateWeather('SG'), 'snow grains');
  });

  it('translates with light intensity', () => {
    assert.equal(translateWeather('-RA'), 'light rain');
    assert.equal(translateWeather('-SN'), 'light snow');
    assert.equal(translateWeather('-DZ'), 'light drizzle');
  });

  it('translates with heavy intensity', () => {
    assert.equal(translateWeather('+RA'), 'heavy rain');
    assert.equal(translateWeather('+SN'), 'heavy snow');
    assert.equal(translateWeather('+TS'), 'heavy thunderstorm');
  });

  it('translates compound phenomena', () => {
    assert.equal(translateWeather('TSRA'), 'thunderstorm with rain');
    assert.equal(translateWeather('SHRA'), 'rain showers');
    assert.equal(translateWeather('FZRA'), 'freezing rain');
    assert.equal(translateWeather('FZDZ'), 'freezing drizzle');
    assert.equal(translateWeather('BLSN'), 'blowing snow');
    assert.equal(translateWeather('FZFG'), 'freezing fog');
  });

  it('translates compound with intensity', () => {
    assert.equal(translateWeather('+TSRA'), 'heavy thunderstorm with rain');
    assert.equal(translateWeather('-SHRA'), 'light rain showers');
    assert.equal(translateWeather('-FZRA'), 'light freezing rain');
  });

  it('returns original code for unknown phenomena', () => {
    assert.equal(translateWeather('XYZ'), 'XYZ');
  });

  it('handles empty input', () => {
    assert.equal(translateWeather(''), '');
    assert.equal(translateWeather(null), '');
  });
});

describe('formatCloudLayers', () => {
  it('formats FEW layer', () => {
    const result = formatCloudLayers([{ type: 'FEW', altitude: 2000 }]);
    assert.deepEqual(result, ['few clouds at two thousand']);
  });

  it('formats SCT layer', () => {
    const result = formatCloudLayers([{ type: 'SCT', altitude: 3500 }]);
    assert.deepEqual(result, ['scattered clouds at three thousand five hundred']);
  });

  it('identifies first BKN as ceiling', () => {
    const result = formatCloudLayers([{ type: 'BKN', altitude: 5000 }]);
    assert.deepEqual(result, ['ceiling broken five thousand']);
  });

  it('identifies first OVC as ceiling', () => {
    const result = formatCloudLayers([{ type: 'OVC', altitude: 1000 }]);
    assert.deepEqual(result, ['ceiling overcast one thousand']);
  });

  it('formats multiple layers with ceiling', () => {
    const result = formatCloudLayers([
      { type: 'FEW', altitude: 3000 },
      { type: 'BKN', altitude: 5000 },
    ]);
    assert.deepEqual(result, [
      'few clouds at three thousand',
      'ceiling broken five thousand',
    ]);
  });

  it('only marks first BKN/OVC as ceiling', () => {
    const result = formatCloudLayers([
      { type: 'BKN', altitude: 3000 },
      { type: 'OVC', altitude: 8000 },
    ]);
    assert.deepEqual(result, [
      'ceiling broken three thousand',
      'overcast eight thousand',
    ]);
  });

  it('FEW and SCT do not get ceiling prefix', () => {
    const result = formatCloudLayers([
      { type: 'FEW', altitude: 2000 },
      { type: 'SCT', altitude: 4000 },
    ]);
    assert.deepEqual(result, [
      'few clouds at two thousand',
      'scattered clouds at four thousand',
    ]);
  });
});

describe('getAtisLetter', () => {
  beforeEach(() => {
    resetAtisState();
  });

  it('starts with Alpha', () => {
    assert.equal(getAtisLetter('CYPK', 'METAR1'), 'Alpha');
  });

  it('returns same letter for same data', () => {
    getAtisLetter('CYPK', 'METAR1');
    assert.equal(getAtisLetter('CYPK', 'METAR1'), 'Alpha');
  });

  it('increments on data change', () => {
    getAtisLetter('CYPK', 'METAR1');
    assert.equal(getAtisLetter('CYPK', 'METAR2'), 'Bravo');
    assert.equal(getAtisLetter('CYPK', 'METAR3'), 'Charlie');
  });

  it('tracks airports independently', () => {
    assert.equal(getAtisLetter('CYPK', 'METAR1'), 'Alpha');
    assert.equal(getAtisLetter('CZBB', 'METAR1'), 'Alpha');
    assert.equal(getAtisLetter('CYPK', 'METAR2'), 'Bravo');
    assert.equal(getAtisLetter('CZBB', 'METAR1'), 'Alpha');
  });

  it('wraps from Zulu back to Alpha', () => {
    for (let i = 0; i < 26; i++) {
      getAtisLetter('CYPK', `METAR${i}`);
    }
    assert.equal(getAtisLetter('CYPK', 'METAR26'), 'Alpha');
  });
});

describe('formatAtis', () => {
  beforeEach(() => {
    resetAtisState();
  });

  it('generates a full ATIS message', () => {
    const data = {
      airportName: 'Pitt Meadows',
      icao: 'CYPK',
      rawMetar: 'CYPK 051953Z 08005KT 6SM FEW030 BKN050 08/06 A3002',
      time: '1953',
      wind: { direction: '080', speed: 5 },
      visibility: 6,
      clouds: [
        { type: 'FEW', altitude: 3000 },
        { type: 'BKN', altitude: 5000 },
      ],
      temperature: 8,
      dewpoint: 6,
      altimeter: '30.02',
      runway: '08R',
    };

    const result = formatAtis(data);

    assert.ok(result.includes('Pitt Meadows information Alpha'));
    assert.ok(result.includes('one niner five three zulu'));
    assert.ok(result.includes('Wind zero eight zero at five'));
    assert.ok(result.includes('Visibility 6'));
    assert.ok(result.includes('few clouds at three thousand'));
    assert.ok(result.includes('ceiling broken five thousand'));
    assert.ok(result.includes('Temperature eight, dewpoint six'));
    assert.ok(result.includes('Altimeter three zero decimal zero two'));
    assert.ok(result.includes('runway zero eight right'));
    assert.ok(result.includes('Advise on initial contact you have information Alpha'));
  });

  it('includes weather phenomena', () => {
    const data = {
      airportName: 'Boundary Bay',
      icao: 'CZBB',
      rawMetar: 'CZBB 051953Z 18010G20KT 3SM -RA BR OVC010 05/04 A2992',
      time: '1953',
      wind: { direction: '180', speed: 10, gust: 20 },
      visibility: 3,
      weather: ['-RA', 'BR'],
      clouds: [{ type: 'OVC', altitude: 1000 }],
      temperature: 5,
      dewpoint: 4,
      altimeter: '29.92',
    };

    const result = formatAtis(data);

    assert.ok(result.includes('Wind one eight zero at one zero gusting two zero'));
    assert.ok(result.includes('light rain'));
    assert.ok(result.includes('mist'));
    assert.ok(result.includes('ceiling overcast one thousand'));
  });

  it('handles variable wind', () => {
    const data = {
      airportName: 'Langley',
      icao: 'CYNJ',
      rawMetar: 'CYNJ 051953Z VRB03KT 10SM CLR 10/05 A3005',
      time: '1953',
      wind: { direction: 'VRB', speed: 3 },
      visibility: 10,
      clouds: [],
      temperature: 10,
      dewpoint: 5,
      altimeter: '30.05',
    };

    const result = formatAtis(data);
    assert.ok(result.includes('Wind variable at three'));
  });

  it('handles negative temperatures', () => {
    const data = {
      airportName: 'Vancouver International',
      icao: 'CYVR',
      rawMetar: 'CYVR 051953Z 36015KT 10SM SCT040 M05/M10 A3010',
      time: '1953',
      wind: { direction: '360', speed: 15 },
      visibility: 10,
      clouds: [{ type: 'SCT', altitude: 4000 }],
      temperature: -5,
      dewpoint: -10,
      altimeter: '30.10',
    };

    const result = formatAtis(data);
    assert.ok(result.includes('Temperature minus five'));
  });

  it('increments letter on data change', () => {
    const baseData = {
      airportName: 'Pitt Meadows',
      icao: 'CYPK',
      rawMetar: 'METAR1',
      time: '1953',
      wind: { direction: '080', speed: 5 },
      visibility: 6,
      clouds: [],
      temperature: 8,
      dewpoint: 6,
      altimeter: '30.02',
    };

    const result1 = formatAtis(baseData);
    assert.ok(result1.includes('information Alpha'));

    const result2 = formatAtis({ ...baseData, rawMetar: 'METAR2' });
    assert.ok(result2.includes('information Bravo'));
  });
});
