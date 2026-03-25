const fs = require('node:fs');
const { appendFile } = require('node:fs/promises');
const path = require('node:path');
const { getLocalDateStr, getLocalMonthStr } = require('../utils/timezone');

const CREDITS_LOG_PATH = path.join(__dirname, '..', '..', 'elevenlabs-credits.jsonl');

/**
 * Log an ElevenLabs TTS generation for credit tracking.
 *
 * @param {string} icao - Airport code (or identifier)
 * @param {number} chars - Number of characters sent to ElevenLabs
 * @param {string} voice - Voice name used
 * @param {boolean} success - Whether generation succeeded
 */
async function logGeneration(icao, chars, voice, success) {
  const entry = {
    timestamp: new Date().toISOString(),
    icao,
    chars,
    voice,
    success,
  };
  try {
    await appendFile(CREDITS_LOG_PATH, JSON.stringify(entry) + '\n');
  } catch (err) {
    console.error(`[CreditTracker] Failed to log: ${err.message}`);
  }
}

/**
 * Read all credit log entries.
 * @returns {Array<Object>}
 */
function readCreditLog(filePath = CREDITS_LOG_PATH) {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, 'utf8').trim();
  if (!content) return [];
  return content.split('\n').filter(Boolean).map(line => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
}

/**
 * Compute credit usage stats from the log.
 * @param {Array<Object>} entries - Credit log entries
 * @param {Date} now - Current time
 * @returns {Object} Usage stats
 */
function computeCreditStats(entries, now = new Date()) {
  const todayStr = getLocalDateStr(now);
  const monthStr = getLocalMonthStr(now);

  let totalChars = 0;
  let totalGenerations = 0;
  let todayChars = 0;
  let todayGenerations = 0;
  let monthChars = 0;
  let monthGenerations = 0;
  const dailyChars = {}; // dateStr -> chars
  const airportChars = {}; // icao -> chars

  for (const entry of entries) {
    if (!entry.success) continue;
    const entryDate = new Date(entry.timestamp);
    const dateStr = getLocalDateStr(entryDate);
    const entryMonth = getLocalMonthStr(entryDate);

    totalChars += entry.chars;
    totalGenerations++;

    if (dateStr === todayStr) {
      todayChars += entry.chars;
      todayGenerations++;
    }

    if (entryMonth === monthStr) {
      monthChars += entry.chars;
      monthGenerations++;
    }

    dailyChars[dateStr] = (dailyChars[dateStr] || 0) + entry.chars;

    if (entry.icao) {
      airportChars[entry.icao] = (airportChars[entry.icao] || 0) + entry.chars;
    }
  }

  const activeDays = Object.keys(dailyChars).length || 1;
  const avgDailyChars = Math.round(totalChars / activeDays);

  // Sort daily for trend
  const dailyTrend = Object.entries(dailyChars)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, chars]) => ({ date, chars }));

  // Top airports by credit usage
  const topAirports = Object.entries(airportChars)
    .sort((a, b) => b[1] - a[1]);

  return {
    totalChars,
    totalGenerations,
    todayChars,
    todayGenerations,
    monthChars,
    monthGenerations,
    avgDailyChars,
    projectedMonthlyChars: avgDailyChars * 30,
    activeDays,
    dailyTrend,
    topAirports,
  };
}

module.exports = {
  logGeneration,
  readCreditLog,
  computeCreditStats,
  CREDITS_LOG_PATH,
};
