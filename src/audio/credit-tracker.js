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
  const airportGens = {}; // icao -> { count, chars, lastGen, todayCount, todayChars }
  const todayLog = []; // individual generation entries for today
  const hourlyGens = {}; // hour -> count (today only)

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
      todayLog.push(entry);
      const hour = new Date(entry.timestamp).getUTCHours();
      hourlyGens[hour] = (hourlyGens[hour] || 0) + 1;
    }

    if (entryMonth === monthStr) {
      monthChars += entry.chars;
      monthGenerations++;
    }

    dailyChars[dateStr] = (dailyChars[dateStr] || 0) + entry.chars;

    if (entry.icao) {
      airportChars[entry.icao] = (airportChars[entry.icao] || 0) + entry.chars;

      if (!airportGens[entry.icao]) {
        airportGens[entry.icao] = { count: 0, chars: 0, lastGen: null, todayCount: 0, todayChars: 0 };
      }
      const ag = airportGens[entry.icao];
      ag.count++;
      ag.chars += entry.chars;
      ag.lastGen = entry.timestamp;
      if (dateStr === todayStr) {
        ag.todayCount++;
        ag.todayChars += entry.chars;
      }
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

  // Per-airport breakdown sorted by today's chars desc
  const airportBreakdown = Object.entries(airportGens)
    .map(([icao, ag]) => ({
      icao,
      totalGens: ag.count,
      totalChars: ag.chars,
      todayGens: ag.todayCount,
      todayChars: ag.todayChars,
      avgChars: ag.count > 0 ? Math.round(ag.chars / ag.count) : 0,
      lastGen: ag.lastGen,
    }))
    .sort((a, b) => b.todayChars - a.todayChars);

  // Today's generation log (newest first)
  const todayGenerationLog = todayLog.reverse();

  // Hourly generation heatmap (0-23 UTC)
  const hourlyGenerations = Array.from({ length: 24 }, (_, i) => hourlyGens[i] || 0);

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
    airportBreakdown,
    todayGenerationLog,
    hourlyGenerations,
  };
}

module.exports = {
  logGeneration,
  readCreditLog,
  computeCreditStats,
  CREDITS_LOG_PATH,
};
