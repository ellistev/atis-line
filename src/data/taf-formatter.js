/**
 * TAF speech formatter.
 *
 * Converts parsed TAF data into natural aviation phraseology for TTS readback.
 */

const { pronounceNumber, pronounceAltitude, translateWeather } = require('../speech/formatter');

const CLOUD_TYPES = {
  FEW: 'few clouds at',
  SCT: 'scattered clouds at',
  BKN: 'broken',
  OVC: 'overcast',
};

const CHANGE_LABELS = {
  FM: 'From',
  TEMPO: 'Temporarily',
  BECMG: 'Becoming',
  PROB: 'Probability',
  base: 'Forecast',
};

/**
 * Format a TAF time for speech.
 *
 * FM times are ddHHmm (e.g., "181800" -> "1800 zulu")
 * TEMPO/BECMG times are HHHH/HHHH (e.g., "1818/1824" -> "1800 to 2400 zulu")
 *
 * @param {string} time - Raw time string
 * @param {string} type - Period type (FM, TEMPO, BECMG, etc.)
 * @returns {string} Spoken time
 */
function formatTafTime(time, type) {
  if (!time) return '';

  if (type === 'FM') {
    // FM format: ddHHmm -> extract HHmm
    const hhmm = time.slice(2); // skip dd
    return `${pronounceNumber(hhmm)} zulu`;
  }

  // Range format: ddHH/ddHH -> extract HH from each
  const rangeMatch = time.match(/^(\d{2})(\d{2})\/(\d{2})(\d{2})$/);
  if (rangeMatch) {
    const [, , startHH, , endHH] = rangeMatch;
    return `${pronounceNumber(startHH + '00')} to ${pronounceNumber(endHH + '00')} zulu`;
  }

  return pronounceNumber(time) + ' zulu';
}

/**
 * Format wind data for speech.
 */
function formatTafWind(wind) {
  if (!wind) return null;

  const speed = pronounceNumber(String(wind.speed));
  let text;

  if (wind.direction === 'VRB') {
    text = `wind variable at ${speed}`;
  } else {
    text = `wind ${pronounceNumber(wind.direction)} at ${speed}`;
  }

  if (wind.gust) {
    text += ` gusting ${pronounceNumber(String(wind.gust))}`;
  }

  return text;
}

/**
 * Format cloud layers for speech.
 */
function formatTafClouds(clouds) {
  if (!clouds || clouds.length === 0) return null;

  return clouds.map(cloud => {
    if (cloud.type === 'SKC') return 'sky clear';
    if (cloud.type === 'CLR') return 'clear';
    if (cloud.type === 'NSC') return 'no significant clouds';

    const typeText = CLOUD_TYPES[cloud.type] || cloud.type;
    const altText = pronounceAltitude(cloud.altitude);
    let text = `${typeText} ${altText}`;
    if (cloud.cb === 'CB') text += ' cumulonimbus';
    if (cloud.cb === 'TCU') text += ' towering cumulus';
    return text;
  }).join(', ');
}

/**
 * Format a single forecast period for speech.
 */
function formatTafPeriod(period) {
  const parts = [];

  // Change label and time
  const label = CHANGE_LABELS[period.type] || period.type;
  const time = formatTafTime(period.time, period.type);

  if (period.type === 'PROB' && period.probability) {
    parts.push(`${period.probability} percent probability${time ? ' ' + time : ''}`);
  } else if (period.type === 'base') {
    // Skip label for base — it's implicit
  } else if (time) {
    parts.push(`${label} ${time}`);
  }

  // Wind
  const windText = formatTafWind(period.wind);
  if (windText) parts.push(windText);

  // Visibility
  if (period.visibility) parts.push(`visibility ${period.visibility}`);

  // Weather
  if (period.weather && period.weather.length > 0) {
    const wx = period.weather
      .filter(w => w !== 'NSW')
      .map(translateWeather)
      .filter(Boolean);
    if (wx.length > 0) parts.push(wx.join(', '));

    if (period.weather.includes('NSW')) {
      parts.push('no significant weather');
    }
  }

  // Clouds
  const cloudText = formatTafClouds(period.clouds);
  if (cloudText) parts.push(cloudText);

  return parts.join(', ') + '.';
}

/**
 * Format a parsed TAF into speech text.
 * Only includes the next few forecast periods (not the entire 24h TAF).
 *
 * @param {Object} taf - Parsed TAF object from parseTaf()
 * @param {number} [maxPeriods=3] - Maximum number of periods to read
 * @returns {string} Speech text for the forecast
 */
function formatTafSpeech(taf, maxPeriods = 3) {
  if (!taf || !taf.periods || taf.periods.length === 0) return '';

  const parts = ['Forecast.'];

  // Take up to maxPeriods (skip base if there are change periods)
  const periods = taf.periods.slice(0, maxPeriods);

  for (const period of periods) {
    parts.push(formatTafPeriod(period));
  }

  return parts.join('\n');
}

module.exports = {
  formatTafSpeech,
  formatTafPeriod,
  formatTafTime,
  formatTafWind,
  formatTafClouds,
};
