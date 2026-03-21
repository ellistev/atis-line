const NATO_ALPHABET = [
  'Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot',
  'Golf', 'Hotel', 'India', 'Juliet', 'Kilo', 'Lima',
  'Mike', 'November', 'Oscar', 'Papa', 'Quebec', 'Romeo',
  'Sierra', 'Tango', 'Uniform', 'Victor', 'Whiskey', 'X-ray',
  'Yankee', 'Zulu',
];

const DIGIT_WORDS = [
  'zero', 'one', 'two', 'three', 'four',
  'five', 'six', 'seven', 'eight', 'niner',
];

const WEATHER_PHENOMENA = {
  RA: 'rain',
  SN: 'snow',
  DZ: 'drizzle',
  FG: 'fog',
  BR: 'mist',
  HZ: 'haze',
  FU: 'smoke',
  SA: 'sand',
  DU: 'dust',
  GR: 'hail',
  GS: 'small hail',
  IC: 'ice crystals',
  PL: 'ice pellets',
  SG: 'snow grains',
  UP: 'unknown precipitation',
  TS: 'thunderstorm',
  SH: 'showers',
  FZ: 'freezing',
  MI: 'shallow',
  BC: 'patches',
  PR: 'partial',
  BL: 'blowing',
  DR: 'drifting',
  SS: 'sandstorm',
  DS: 'dust storm',
  SQ: 'squall',
  FC: 'funnel cloud',
  VA: 'volcanic ash',
  PO: 'dust whirls',
};

// Compound weather patterns - order matters (longer first)
const COMPOUND_WEATHER = [
  { code: 'TSRA', text: 'thunderstorm with rain' },
  { code: 'TSSN', text: 'thunderstorm with snow' },
  { code: 'TSGS', text: 'thunderstorm with small hail' },
  { code: 'TSGR', text: 'thunderstorm with hail' },
  { code: 'SHRA', text: 'rain showers' },
  { code: 'SHSN', text: 'snow showers' },
  { code: 'SHGS', text: 'showers of small hail' },
  { code: 'SHGR', text: 'showers of hail' },
  { code: 'FZRA', text: 'freezing rain' },
  { code: 'FZDZ', text: 'freezing drizzle' },
  { code: 'FZFG', text: 'freezing fog' },
  { code: 'BLSN', text: 'blowing snow' },
  { code: 'BLSA', text: 'blowing sand' },
  { code: 'BLDU', text: 'blowing dust' },
  { code: 'DRSN', text: 'drifting snow' },
  { code: 'DRSA', text: 'drifting sand' },
  { code: 'DRDU', text: 'drifting dust' },
  { code: 'MIFG', text: 'shallow fog' },
  { code: 'BCFG', text: 'fog patches' },
  { code: 'PRFG', text: 'partial fog' },
];

const CLOUD_TYPES = {
  FEW: 'few clouds at',
  SCT: 'scattered clouds at',
  BKN: 'broken',
  OVC: 'overcast',
};

const CEILING_TYPES = new Set(['BKN', 'OVC']);

const RUNWAY_SUFFIXES = {
  L: 'left',
  R: 'right',
  C: 'center',
};

// ATIS letter state per airport
const atisState = new Map();

/**
 * Pronounce a single digit in aviation style.
 */
function pronounceDigit(d) {
  return DIGIT_WORDS[d] || String(d);
}

/**
 * Pronounce a number digit-by-digit in aviation style.
 * e.g., 180 -> "one eight zero"
 */
function pronounceNumber(num) {
  const str = String(num);
  return str.split('').map((ch) => {
    if (ch >= '0' && ch <= '9') return pronounceDigit(Number(ch));
    return ch;
  }).join(' ');
}

/**
 * Pronounce altitude in aviation style.
 * e.g., 3000 -> "three thousand", 3500 -> "three thousand five hundred"
 */
function pronounceAltitude(feet) {
  const n = Number(feet);
  if (n === 0) return 'zero';

  const thousands = Math.floor(n / 1000);
  const hundreds = Math.floor((n % 1000) / 100);

  const parts = [];
  if (thousands > 0) {
    parts.push(`${pronounceDigit(thousands)} thousand`);
  }
  if (hundreds > 0) {
    parts.push(`${pronounceDigit(hundreds)} hundred`);
  }
  if (thousands === 0 && hundreds === 0) {
    return pronounceNumber(n);
  }
  return parts.join(' ');
}

/**
 * Pronounce altimeter setting.
 * e.g., "30.02" -> "three zero decimal zero two"
 */
function pronounceAltimeter(value) {
  const str = String(value);
  const parts = str.split('.');
  const whole = pronounceNumber(parts[0]);
  if (parts.length === 1) return whole;
  const frac = pronounceNumber(parts[1]);
  return `${whole} decimal ${frac}`;
}

/**
 * Pronounce a runway designator.
 * e.g., "08R" -> "zero eight right"
 */
function pronounceRunway(rwy) {
  const str = String(rwy);
  const match = str.match(/^(\d+)([LRC]?)$/i);
  if (!match) return str;

  const num = match[1];
  const suffix = match[2].toUpperCase();

  const digits = pronounceNumber(num);
  if (suffix && RUNWAY_SUFFIXES[suffix]) {
    return `${digits} ${RUNWAY_SUFFIXES[suffix]}`;
  }
  return digits;
}

/**
 * Pronounce temperature.
 * Negative values get "minus" prefix.
 */
function pronounceTemperature(temp) {
  const n = Number(temp);
  if (n < 0) return `minus ${pronounceDigit(Math.abs(n))}`;
  return pronounceDigit(n);
}

/**
 * Translate a weather code to spoken English.
 * Handles intensity prefixes (-, +) and compound codes.
 */
function translateWeather(code) {
  if (!code) return '';

  let intensity = '';
  let rest = code;

  if (rest.startsWith('+')) {
    intensity = 'heavy ';
    rest = rest.slice(1);
  } else if (rest.startsWith('-')) {
    intensity = 'light ';
    rest = rest.slice(1);
  }

  // Check compound patterns first
  for (const { code: pattern, text } of COMPOUND_WEATHER) {
    if (rest === pattern) {
      return `${intensity}${text}`;
    }
  }

  // Try single phenomenon
  if (WEATHER_PHENOMENA[rest]) {
    return `${intensity}${WEATHER_PHENOMENA[rest]}`;
  }

  // Try splitting into 2-char codes
  const parts = [];
  let remaining = rest;
  while (remaining.length >= 2) {
    const chunk = remaining.slice(0, 2);
    if (WEATHER_PHENOMENA[chunk]) {
      parts.push(WEATHER_PHENOMENA[chunk]);
      remaining = remaining.slice(2);
    } else {
      break;
    }
  }

  if (parts.length > 0 && remaining.length === 0) {
    return `${intensity}${parts.join(' with ')}`;
  }

  return code;
}

/**
 * Format cloud layers with ceiling identification.
 * First BKN or OVC layer is prefixed with "ceiling".
 */
function formatCloudLayers(layers) {
  let ceilingFound = false;
  return layers.map((layer) => {
    const { type, altitude } = layer;
    const altText = pronounceAltitude(altitude);

    if (!ceilingFound && CEILING_TYPES.has(type)) {
      ceilingFound = true;
      return `ceiling ${CLOUD_TYPES[type]} ${altText}`;
    }

    return `${CLOUD_TYPES[type]} ${altText}`;
  });
}

/**
 * Get the current ATIS letter for an airport.
 * Increments when raw METAR data changes.
 */
function getAtisLetter(icao, rawMetar) {
  const state = atisState.get(icao);

  if (!state || state.rawMetar !== rawMetar) {
    const nextIndex = state ? (state.letterIndex + 1) % 26 : 0;
    atisState.set(icao, { letterIndex: nextIndex, rawMetar });
    return NATO_ALPHABET[nextIndex];
  }

  return NATO_ALPHABET[state.letterIndex];
}

/**
 * Reset ATIS letter tracking (for testing).
 */
function resetAtisState() {
  atisState.clear();
}

/**
 * Format a full ATIS message from structured airport data.
 *
 * @param {Object} data
 * @param {string} data.airportName - Airport name (e.g., "Pitt Meadows")
 * @param {string} data.icao - ICAO code (e.g., "CYPK")
 * @param {string} data.rawMetar - Raw METAR string (for change detection)
 * @param {string} data.time - Zulu time (e.g., "1953")
 * @param {Object} data.wind - Wind info
 * @param {string} data.wind.direction - Direction in degrees (e.g., "080") or "VRB"
 * @param {number} data.wind.speed - Speed in knots
 * @param {number} [data.wind.gust] - Gust speed in knots
 * @param {number|string} data.visibility - Visibility in SM
 * @param {Array} [data.clouds] - Cloud layers [{type, altitude}]
 * @param {Array} [data.weather] - Weather phenomena codes
 * @param {number} data.temperature - Temperature in C
 * @param {number} data.dewpoint - Dewpoint in C
 * @param {string} data.altimeter - Altimeter setting (e.g., "30.02")
 * @param {string} [data.runway] - Active runway (e.g., "08R")
 * @returns {string}
 */
function formatAtis(data) {
  const letter = getAtisLetter(data.icao, data.rawMetar);
  const parts = [];

  // Header
  parts.push(`${data.airportName} information ${letter}, ${pronounceNumber(data.time)} zulu.`);

  // Wind
  let windText;
  const speedText = pronounceNumber(String(data.wind.speed));
  if (data.wind.direction === 'VRB') {
    windText = `Wind variable at ${speedText}`;
  } else {
    windText = `Wind ${pronounceNumber(data.wind.direction)} at ${speedText}`;
  }
  if (data.wind.gust) {
    windText += ` gusting ${pronounceNumber(String(data.wind.gust))}`;
  }
  parts.push(windText + '.');

  // Visibility
  parts.push(`Visibility ${data.visibility}.`);

  // Weather phenomena
  if (data.weather && data.weather.length > 0) {
    const weatherTexts = data.weather.map(translateWeather);
    parts.push(weatherTexts.join(', ') + '.');
  }

  // Clouds
  if (data.clouds && data.clouds.length > 0) {
    const cloudTexts = formatCloudLayers(data.clouds);
    parts.push(cloudTexts.join(', ') + '.');
  }

  // Temperature and dewpoint
  parts.push(`Temperature ${pronounceTemperature(data.temperature)}, dewpoint ${pronounceTemperature(data.dewpoint)}.`);

  // Altimeter
  parts.push(`Altimeter ${pronounceAltimeter(data.altimeter)}.`);

  // Runway
  if (data.runway) {
    parts.push(`Landing and departing runway ${pronounceRunway(data.runway)}.`);
  }

  // Closing
  parts.push(`Advise on initial contact you have information ${letter}.`);

  return parts.join('\n');
}

module.exports = {
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
};
