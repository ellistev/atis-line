/**
 * Parse a raw METAR string into structured data.
 * Handles both full METAR format and LWIS (Limited Weather Information System) auto reports.
 */
function parseMetar(raw) {
  if (!raw || typeof raw !== 'string') return null;

  const result = {
    raw,
    station: null,
    time: null,
    isAuto: false,
    isLwis: false,
    wind: null,
    visibility: null,
    weather: [],
    clouds: [],
    temperature: null,
    dewpoint: null,
    altimeter: null,
  };

  // Trim and normalise whitespace
  const text = raw.replace(/\s+/g, ' ').trim();

  // Some METAR strings start with "METAR" or "SPECI" prefix, or "LWIS" prefix
  let tokens = text.split(' ');
  let idx = 0;

  // Skip METAR/SPECI/LWIS prefix
  if (/^(METAR|SPECI)$/i.test(tokens[idx])) idx++;
  if (/^LWIS$/i.test(tokens[idx])) {
    result.isLwis = true;
    idx++;
  }

  // Station identifier (4-letter ICAO)
  if (idx < tokens.length && /^[A-Z]{4}$/i.test(tokens[idx])) {
    result.station = tokens[idx].toUpperCase();
    idx++;
  }

  // Observation time (DDHHMMz)
  if (idx < tokens.length && /^\d{6}Z$/i.test(tokens[idx])) {
    const t = tokens[idx];
    result.time = {
      day: parseInt(t.slice(0, 2)),
      hour: parseInt(t.slice(2, 4)),
      minute: parseInt(t.slice(4, 6)),
    };
    idx++;
  }

  // AUTO
  if (idx < tokens.length && tokens[idx] === 'AUTO') {
    result.isAuto = true;
    idx++;
  }

  // Wind  e.g. 22004KT, VRB03KT, 22004G15KT
  if (idx < tokens.length && /^(VRB|\d{3})(\d{2,3})(G(\d{2,3}))?KT$/i.test(tokens[idx])) {
    const m = tokens[idx].match(/^(VRB|\d{3})(\d{2,3})(G(\d{2,3}))?KT$/i);
    result.wind = {
      direction: m[1] === 'VRB' ? 'VRB' : parseInt(m[1]),
      speed: parseInt(m[2]),
      gust: m[4] ? parseInt(m[4]) : null,
      variableRange: null,
    };
    idx++;
    // Variable wind direction range e.g. 190V250
    if (idx < tokens.length && /^\d{3}V\d{3}$/.test(tokens[idx])) {
      const v = tokens[idx].match(/^(\d{3})V(\d{3})$/);
      result.wind.variableRange = { from: parseInt(v[1]), to: parseInt(v[2]) };
      idx++;
    }
  }

  // Visibility e.g. 9999, P6SM, 3SM, 1 1/2SM, 15SM
  if (idx < tokens.length) {
    const visTok = tokens[idx];
    if (/^P6SM$/i.test(visTok)) {
      result.visibility = { value: 6, modifier: 'P', unit: 'SM' };
      idx++;
    } else if (/^(\d+)SM$/i.test(visTok)) {
      const vm = visTok.match(/^(\d+)SM$/i);
      result.visibility = { value: parseInt(vm[1]), modifier: null, unit: 'SM' };
      idx++;
    } else if (/^\d{4}$/.test(visTok) && parseInt(visTok) <= 9999) {
      result.visibility = { value: parseInt(visTok), modifier: null, unit: 'm' };
      idx++;
    } else if (/^\d+\/\d+SM$/i.test(visTok)) {
      // Fractional visibility like 1/2SM
      const parts = visTok.replace(/SM$/i, '').split('/');
      result.visibility = { value: parseInt(parts[0]) / parseInt(parts[1]), modifier: null, unit: 'SM' };
      idx++;
    }
  }

  // Weather phenomena and cloud layers - parse remaining tokens
  while (idx < tokens.length) {
    const tok = tokens[idx];

    // Cloud layers: FEW, SCT, BKN, OVC + 3-digit height, or CLR/SKC/NCD
    const cloudMatch = tok.match(/^(FEW|SCT|BKN|OVC)(\d{3})(CB|TCU)?$/i);
    if (cloudMatch) {
      result.clouds.push({
        coverage: cloudMatch[1].toUpperCase(),
        height: parseInt(cloudMatch[2]) * 100,
        type: cloudMatch[3] ? cloudMatch[3].toUpperCase() : null,
      });
      idx++;
      continue;
    }
    if (/^(CLR|SKC|NCD|NSC)$/i.test(tok)) {
      result.clouds.push({ coverage: tok.toUpperCase(), height: null, type: null });
      idx++;
      continue;
    }

    // Temperature/Dewpoint: e.g. 11/05, M02/M05
    const tempMatch = tok.match(/^(M?\d{2})\/(M?\d{2})$/);
    if (tempMatch) {
      result.temperature = parseTemp(tempMatch[1]);
      result.dewpoint = parseTemp(tempMatch[2]);
      idx++;
      continue;
    }

    // Altimeter: A3010, Q1013 (may have trailing =)
    const altMatch = tok.replace(/=$/, '').match(/^([AQ])(\d{4})$/);
    if (altMatch) {
      result.altimeter = {
        unit: altMatch[1] === 'A' ? 'inHg' : 'hPa',
        value: altMatch[1] === 'A'
          ? parseInt(altMatch[2]) / 100
          : parseInt(altMatch[2]),
      };
      idx++;
      continue;
    }

    // Weather phenomena: optional intensity prefix (-/+/VC), then 2-letter codes
    const wxMatch = tok.match(/^([+-]|VC)?([A-Z]{2,})$/i);
    if (wxMatch && isWeatherCode(wxMatch[2])) {
      result.weather.push({
        intensity: wxMatch[1] || null,
        code: wxMatch[2].toUpperCase(),
        description: describeWeather(wxMatch[1], wxMatch[2].toUpperCase()),
      });
      idx++;
      continue;
    }

    // RMK and everything after - stop parsing structured data
    if (/^RMK$/i.test(tok)) break;

    // Unknown token, skip (e.g. equals sign at end)
    idx++;
  }

  return result;
}

function parseTemp(s) {
  if (s.startsWith('M')) return -parseInt(s.slice(1));
  return parseInt(s);
}

const WEATHER_CODES = new Set([
  'BR', 'FG', 'HZ', 'DU', 'SA', 'FU', 'VA', 'PY',  // obscuration
  'RA', 'SN', 'DZ', 'GR', 'GS', 'PL', 'SG', 'IC', 'UP', // precipitation
  'TS', 'SH', 'FZ', 'MI', 'PR', 'BC', 'BL', 'DR',    // descriptors
  'TSRA', 'SHRA', 'SHSN', 'FZRA', 'FZDZ', 'FZFG',    // combinations
  'BLSN', 'DRSN',
]);

function isWeatherCode(code) {
  if (WEATHER_CODES.has(code.toUpperCase())) return true;
  // Check if it's a combination of known 2-letter codes
  const upper = code.toUpperCase();
  if (upper.length >= 4 && upper.length % 2 === 0) {
    for (let i = 0; i < upper.length; i += 2) {
      if (!WEATHER_CODES.has(upper.slice(i, i + 2))) return false;
    }
    return true;
  }
  return false;
}

const WEATHER_DESCRIPTIONS = {
  BR: 'mist', FG: 'fog', HZ: 'haze', DU: 'dust', SA: 'sand',
  FU: 'smoke', VA: 'volcanic ash', PY: 'spray',
  RA: 'rain', SN: 'snow', DZ: 'drizzle', GR: 'hail', GS: 'small hail',
  PL: 'ice pellets', SG: 'snow grains', IC: 'ice crystals', UP: 'unknown precipitation',
  TS: 'thunderstorm', SH: 'showers', FZ: 'freezing',
  TSRA: 'thunderstorm with rain', SHRA: 'rain showers', SHSN: 'snow showers',
  FZRA: 'freezing rain', FZDZ: 'freezing drizzle', FZFG: 'freezing fog',
  BLSN: 'blowing snow', DRSN: 'drifting snow',
};

function describeWeather(intensity, code) {
  const prefix = intensity === '-' ? 'light ' : intensity === '+' ? 'heavy ' : intensity === 'VC' ? 'vicinity ' : '';
  return prefix + (WEATHER_DESCRIPTIONS[code] || code.toLowerCase());
}

module.exports = { parseMetar };
