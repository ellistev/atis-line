/**
 * Simplified METAR-to-speech utilities for direct METAR parsing.
 */

const PHONETIC_ALPHABET = [
  'Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot',
  'Golf', 'Hotel', 'India', 'Juliet', 'Kilo', 'Lima',
  'Mike', 'November', 'Oscar', 'Papa', 'Quebec', 'Romeo',
  'Sierra', 'Tango', 'Uniform', 'Victor', 'Whiskey', 'X-ray',
  'Yankee', 'Zulu',
];

// Track ATIS letter per airport: icao -> { lastMetar, letterIndex }
const letterState = new Map();

/**
 * Get or advance the ATIS letter for an airport based on METAR changes.
 */
function getAtisLetter(icao, metar) {
  const state = letterState.get(icao);
  if (!state) {
    letterState.set(icao, { lastMetar: metar, letterIndex: 0 });
    return PHONETIC_ALPHABET[0];
  }
  if (state.lastMetar === metar) {
    return PHONETIC_ALPHABET[state.letterIndex % 26];
  }
  state.letterIndex = (state.letterIndex + 1) % 26;
  state.lastMetar = metar;
  return PHONETIC_ALPHABET[state.letterIndex];
}

const WEATHER_PHENOMENA = {
  'RA': 'rain',
  'SN': 'snow',
  'DZ': 'drizzle',
  'FG': 'fog',
  'BR': 'mist',
  'HZ': 'haze',
  'TS': 'thunderstorm',
  'SH': 'showers',
  'GR': 'hail',
  'GS': 'small hail',
  'FZ': 'freezing',
  'SQ': 'squall',
};

/**
 * Convert a raw METAR string to speech text.
 */
function metarToSpeech(metar, airportName, letter) {
  if (!metar) return null;

  // Strip METAR prefix and ICAO
  let body = metar.replace(/^METAR\s+\w{4}\s+/, '');

  // Strip remarks
  body = body.replace(/\bRMK\b.*$/s, '').trim();

  // Extract observation time
  const timeMatch = body.match(/^(\d{2})(\d{4})Z/);
  let timeStr = '';
  if (timeMatch) {
    timeStr = ` Observed at ${timeMatch[2]} zulu.`;
    body = body.replace(/^\d{6}Z\s*/, '');
  }

  // Expand wind
  body = body
    .replace(/(\d{3})(\d{2,3})KT/g, (_, dir, spd) => `wind ${dir} degrees at ${spd} knots`)
    .replace(/\bG(\d+)\s*knots\b/g, 'gusting $1 knots')
    .replace(/\bVRB(\d{2,3})KT/g, (_, spd) => `variable at ${spd} knots`);

  // Expand visibility
  body = body.replace(/\bP6SM\b/g, 'visibility greater than 6 statute miles');
  body = body.replace(/(\d+)SM\b/g, '$1 statute miles');

  // Expand weather phenomena
  for (const [code, word] of Object.entries(WEATHER_PHENOMENA)) {
    body = body.replace(new RegExp(`\\b${code}\\b`, 'g'), word);
  }

  // Expand cloud layers
  body = body.replace(/\bFEW(\d{3})\b/g, (_, h) => `few clouds at ${parseInt(h) * 100} feet`);
  body = body.replace(/\bSCT(\d{3})\b/g, (_, h) => `scattered clouds at ${parseInt(h) * 100} feet`);
  body = body.replace(/\bBKN(\d{3})\b/g, (_, h) => `ceiling broken ${parseInt(h) * 100} feet`);
  body = body.replace(/\bOVC(\d{3})\b/g, (_, h) => `ceiling overcast ${parseInt(h) * 100} feet`);
  body = body.replace(/\bCLR\b/g, 'sky clear');
  body = body.replace(/\bSKC\b/g, 'sky clear');
  body = body.replace(/\bCAVOK\b/g, 'ceiling and visibility okay');

  // Expand temperature/dewpoint
  body = body.replace(/\bM(\d{2})\b/g, 'minus $1');

  // Expand altimeter
  body = body.replace(/\bA(\d{4})\b/g, (_, a) => `altimeter ${a.slice(0, 2)}.${a.slice(2)}`);

  body = body.trim();

  let speech = `${airportName} information ${letter}.${timeStr} ${body}.`;
  speech += ` Advise on initial contact you have information ${letter}.`;

  return speech;
}

module.exports = { getAtisLetter, metarToSpeech };
