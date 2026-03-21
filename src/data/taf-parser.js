/**
 * TAF (Terminal Aerodrome Forecast) parser.
 *
 * Parses raw TAF strings into structured forecast periods.
 * TAF format: https://aviationweather.gov/data/help/taf-decode.php
 */

const CHANGE_TYPES = {
  FM: 'from',
  TEMPO: 'temporary',
  BECMG: 'becoming',
};

/**
 * Parse a raw TAF string into structured data.
 *
 * @param {string} raw - Raw TAF string
 * @returns {Object|null} Parsed TAF or null if invalid
 */
function parseTaf(raw) {
  if (!raw || typeof raw !== 'string') return null;

  const text = raw.trim().replace(/\s+/g, ' ');

  // Must start with TAF (optionally with AMD/COR)
  const headerMatch = text.match(/^TAF\s+(?:AMD\s+|COR\s+)?(\w{4})\s+(\d{6})Z\s+(\d{4})\/(\d{4})\s+(.+)$/);
  if (!headerMatch) return null;

  const [, icao, issuedTime, validFrom, validTo, body] = headerMatch;

  const periods = parseBody(body);

  return {
    icao,
    issuedTime,
    validFrom,
    validTo,
    periods,
  };
}

/**
 * Parse the body of a TAF into forecast periods.
 * Splits on FM, TEMPO, BECMG, and PROB tokens.
 */
function parseBody(body) {
  const periods = [];

  // Split the body into segments by change indicators
  // FM is followed by time (FMddHHmm), TEMPO/BECMG have time ranges
  const segments = splitSegments(body);

  for (const segment of segments) {
    const period = parsePeriod(segment);
    if (period) {
      periods.push(period);
    }
  }

  return periods;
}

/**
 * Split TAF body into segments by change indicators.
 */
function splitSegments(body) {
  const segments = [];
  // Match: start of body (base forecast), FM, TEMPO, BECMG, PROB
  const regex = /\b(FM\d{6}|TEMPO\s+\d{4}\/\d{4}|BECMG\s+\d{4}\/\d{4}|PROB\d{2}\s+(?:TEMPO\s+)?\d{4}\/\d{4})\b/g;

  let lastIndex = 0;
  let match;

  // First segment is the base forecast
  const firstMatch = regex.exec(body);
  if (!firstMatch) {
    // Entire body is one base forecast
    segments.push({ type: 'base', time: null, text: body.trim() });
    return segments;
  }

  // Base forecast is everything before first change indicator
  const baseText = body.slice(0, firstMatch.index).trim();
  if (baseText) {
    segments.push({ type: 'base', time: null, text: baseText });
  }

  // Process the first match
  lastIndex = firstMatch.index;
  let prevHeader = firstMatch[1];
  let prevEnd = firstMatch.index + firstMatch[0].length;

  while ((match = regex.exec(body)) !== null) {
    const segText = body.slice(prevEnd, match.index).trim();
    segments.push(parseSegmentHeader(prevHeader, segText));
    prevHeader = match[1];
    prevEnd = match.index + match[0].length;
  }

  // Last segment
  const lastText = body.slice(prevEnd).trim();
  segments.push(parseSegmentHeader(prevHeader, lastText));

  return segments;
}

/**
 * Parse a segment header (FM/TEMPO/BECMG/PROB) and its body text.
 */
function parseSegmentHeader(header, text) {
  // FM followed by ddHHmm
  const fmMatch = header.match(/^FM(\d{6})$/);
  if (fmMatch) {
    return { type: 'FM', time: fmMatch[1], text };
  }

  // PROB with optional TEMPO
  const probMatch = header.match(/^PROB(\d{2})\s+(?:TEMPO\s+)?(\d{4}\/\d{4})$/);
  if (probMatch) {
    return { type: 'PROB', probability: parseInt(probMatch[1], 10), time: probMatch[2], text };
  }

  // TEMPO or BECMG with time range
  const changeMatch = header.match(/^(TEMPO|BECMG)\s+(\d{4}\/\d{4})$/);
  if (changeMatch) {
    return { type: changeMatch[1], time: changeMatch[2], text };
  }

  return { type: 'base', time: null, text: `${header} ${text}`.trim() };
}

/**
 * Parse a single forecast period segment into structured data.
 */
function parsePeriod(segment) {
  const { type, time, text, probability } = segment;
  const tokens = text.split(/\s+/).filter(Boolean);

  const period = {
    type,
    time: time || null,
  };

  if (probability !== undefined) {
    period.probability = probability;
  }

  // Parse wind
  const windToken = tokens.find(t => /^\d{3}\d{2,3}(G\d{2,3})?KT$/.test(t) || /^VRB\d{2,3}KT$/.test(t));
  if (windToken) {
    period.wind = parseWind(windToken);
  }

  // Parse visibility
  const visToken = tokens.find(t => /^P?\d+SM$/.test(t) || /^\d+\/\d+SM$/.test(t));
  if (visToken) {
    period.visibility = parseVisibility(visToken);
  }

  // Parse weather phenomena
  const weatherTokens = tokens.filter(t =>
    /^[-+]?(?:VC)?(?:MI|BC|PR|DR|BL|SH|TS|FZ)?(?:RA|SN|DZ|FG|BR|HZ|FU|SA|DU|GR|GS|IC|PL|SG|UP|SS|DS|SQ|FC|VA|PO)+$/.test(t)
  );
  if (weatherTokens.length > 0) {
    period.weather = weatherTokens;
  }

  // Parse NSW (no significant weather)
  if (tokens.includes('NSW')) {
    period.weather = ['NSW'];
  }

  // Parse cloud layers
  const cloudTokens = tokens.filter(t =>
    /^(?:FEW|SCT|BKN|OVC)\d{3}(?:CB|TCU)?$/.test(t) || t === 'SKC' || t === 'CLR' || t === 'NSC'
  );
  if (cloudTokens.length > 0) {
    period.clouds = cloudTokens.map(parseClouds).filter(Boolean);
  }

  return period;
}

/**
 * Parse a wind token (e.g., "27015G25KT").
 */
function parseWind(token) {
  const match = token.match(/^(VRB|\d{3})(\d{2,3})(?:G(\d{2,3}))?KT$/);
  if (!match) return null;

  const wind = {
    direction: match[1],
    speed: parseInt(match[2], 10),
  };
  if (match[3]) {
    wind.gust = parseInt(match[3], 10);
  }
  return wind;
}

/**
 * Parse a visibility token (e.g., "6SM", "P6SM", "1/2SM").
 */
function parseVisibility(token) {
  if (token.startsWith('P')) {
    return `greater than ${token.slice(1).replace('SM', '')} statute miles`;
  }
  const val = token.replace('SM', '');
  return `${val} statute miles`;
}

/**
 * Parse a cloud token (e.g., "BKN040", "OVC100CB").
 */
function parseClouds(token) {
  if (token === 'SKC' || token === 'CLR') {
    return { type: token, altitude: 0, text: token === 'SKC' ? 'sky clear' : 'clear' };
  }
  if (token === 'NSC') {
    return { type: 'NSC', altitude: 0, text: 'no significant clouds' };
  }

  const match = token.match(/^(FEW|SCT|BKN|OVC)(\d{3})(CB|TCU)?$/);
  if (!match) return null;

  return {
    type: match[1],
    altitude: parseInt(match[2], 10) * 100,
    cb: match[3] || null,
  };
}

module.exports = {
  parseTaf,
  parseWind,
  parseVisibility,
  parseClouds,
  parsePeriod,
  splitSegments,
};
