require('dotenv').config();
const express = require('express');
const twilio = require('twilio');
const { loadAirports, getRegions, generateTopGreeting, generateRegionGreeting } = require('./src/config/airports');
const { scrapeAll, closeBrowser } = require('./src/data/aeroview');
const { fetchMetar } = require('./src/data/metar');
const { updateCache, getCache, getAudioUrl, AUDIO_DIR } = require('./src/audio/cache-manager');
const { getRandomSignOff, getRandomJoke, ABOUT_TEXT } = require('./src/personality');
const { humanizeAtis } = require('./src/speech/humanize');
const { recordSuccess, recordFailure, checkAlerts } = require('./src/monitoring/alerter');
const { startWatchdog } = require('./src/monitoring/watchdog');
const { logCall } = require('./src/analytics/logger');
const { readAnalytics, computeStats, renderDashboard } = require('./src/analytics/dashboard');
const logger = require('./src/logger');

const app = express();
const port = process.env.PORT || 3338;
const BASE_URL = process.env.BASE_URL || `http://localhost:${port}`;

app.use(express.urlencoded({ extended: false }));
app.use('/audio', express.static(AUDIO_DIR));

// --- Airport config ---
const AIRPORTS_LIST = loadAirports();
const REGIONS = getRegions(AIRPORTS_LIST);
const ALL_ICAOS = AIRPORTS_LIST.map(a => a.icao);

// In-memory ATIS data (raw + speech text) - audio file caching handled by cache-manager
const atisData = new Map();

const VOICE = { voice: 'Polly.Joanna', language: 'en-US' };
const VOICE_SLOW = { voice: 'Polly.Joanna', language: 'en-US', rate: '85%' };

const STALE_THRESHOLD_MS = 30 * 60 * 1000;         // 30 minutes (monitoring alert threshold)
const MAX_CALL_DURATION = 180;                     // seconds
const CALLER_STALE_MS = 2 * 60 * 60 * 1000;       // 2 hours (caller-facing staleness warning)
const UNAVAIL_THRESHOLD_MS = 6 * 60 * 60 * 1000;  // 6 hours

/**
 * Determine staleness state from a cache entry.
 * @returns {'fresh'|'stale'|'unavailable'}
 */
function getStalenessState(cached) {
  if (!cached || !cached.updatedAt) return 'unavailable';
  const ageMs = Date.now() - new Date(cached.updatedAt).getTime();
  if (ageMs >= UNAVAIL_THRESHOLD_MS) return 'unavailable';
  if (ageMs >= CALLER_STALE_MS) return 'stale';
  return 'fresh';
}

// --- IVR: top-level menu ---
app.post('/voice', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const gather = twiml.gather({ numDigits: 1, action: '/select-region', method: 'POST', timeout: 10, finishOnKey: '#' });
  gather.say(VOICE, generateTopGreeting(REGIONS));
  twiml.redirect('/voice');
  res.type('text/xml').send(twiml.toString());
});

// --- IVR: region selected -> airport sub-menu ---
app.post('/select-region', (req, res) => {
  const digit = req.body.Digits;
  const twiml = new twilio.twiml.VoiceResponse();

  // # = back to top
  if (!digit || digit === '#') {
    twiml.redirect('/voice');
    return res.type('text/xml').send(twiml.toString());
  }

  // Easter eggs at top level
  if (digit === '9') {
    twiml.say(VOICE, getRandomJoke());
    twiml.pause({ length: 1 });
    twiml.redirect('/voice');
    return res.type('text/xml').send(twiml.toString());
  }
  if (digit === '0') {
    twiml.say(VOICE, ABOUT_TEXT);
    twiml.pause({ length: 1 });
    twiml.redirect('/voice');
    return res.type('text/xml').send(twiml.toString());
  }

  const region = REGIONS[digit];
  if (!region) {
    twiml.say(VOICE, 'Invalid selection.');
    twiml.redirect('/voice');
    return res.type('text/xml').send(twiml.toString());
  }

  const gather = twiml.gather({ numDigits: 1, action: `/select-airport/${digit}`, method: 'POST', timeout: 10, finishOnKey: '#' });
  gather.say(VOICE, generateRegionGreeting(region));
  twiml.redirect('/voice');
  res.type('text/xml').send(twiml.toString());
});

// --- IVR: airport selected -> read ATIS ---
app.post('/select-airport/:regionDigit', (req, res) => {
  const { regionDigit } = req.params;
  const digit = req.body.Digits;
  const twiml = new twilio.twiml.VoiceResponse();

  // # = back to region menu
  if (!digit || digit === '#') {
    twiml.redirect(`/region-menu/${regionDigit}`);
    return res.type('text/xml').send(twiml.toString());
  }

  const region = REGIONS[regionDigit];
  if (!region) {
    twiml.redirect('/voice');
    return res.type('text/xml').send(twiml.toString());
  }

  // * = replay last airport (digit carried via query param)
  const lastAirport = req.query.lastAirport;
  const effectiveDigit = (digit === '*' && lastAirport) ? lastAirport : digit;

  const airport = region.airports.find(a => a.digit === effectiveDigit);
  if (!airport) {
    twiml.say(VOICE, 'Invalid selection.');
    twiml.redirect(`/region-menu/${regionDigit}`);
    return res.type('text/xml').send(twiml.toString());
  }

  // Log call analytics
  logCall({
    region: regionDigit,
    airport: airport.icao,
    duration: req.body.CallDuration ? Number(req.body.CallDuration) : null,
    callerNumber: req.body.From,
    callSid: req.body.CallSid,
  });

  const cached = getCache(airport.icao);

  // Check if we have a pre-generated MP3 on disk (survives restarts before first scrape)
  const audioUrl = getAudioUrl(airport.icao, BASE_URL);

  if (!cached && !audioUrl) {
    twiml.say(VOICE, `${airport.name} ATIS is currently unavailable. Please try again shortly.`);
    twiml.redirect('/voice');
    return res.type('text/xml').send(twiml.toString());
  }

  // Staleness check
  const staleness = getStalenessState(cached);

  if (staleness === 'unavailable') {
    const ageHours = cached && cached.updatedAt
      ? Math.floor((Date.now() - new Date(cached.updatedAt).getTime()) / 3600000)
      : null;
    const ageMsg = ageHours !== null ? ` Last update was ${ageHours} hours ago.` : '';
    twiml.say(VOICE, `${airport.name} weather information is currently unavailable.${ageMsg} Please contact Flight Services for current conditions.`);
    twiml.redirect('/voice');
    return res.type('text/xml').send(twiml.toString());
  }

  // Wrap everything in a Gather so # or digit works during playback
  const playGather = twiml.gather({ numDigits: 1, action: `/select-airport/${regionDigit}?lastAirport=${effectiveDigit}`, method: 'POST', timeout: 8, finishOnKey: '#' });

  if (staleness === 'stale') {
    const ageHours = Math.floor((Date.now() - new Date(cached.updatedAt).getTime()) / 3600000);
    playGather.say(VOICE, `Caution: this weather information was last updated ${ageHours} hours ago. Verify with official sources before flight.`);
  }

  if (audioUrl) {
    playGather.play(`${audioUrl}?t=${Date.now()}`);
  } else {
    playGather.say(VOICE_SLOW, cached.speechText);
  }
  playGather.pause({ length: 1 });
  playGather.say(VOICE, getRandomSignOff());
  playGather.say(VOICE, 'Press star to hear it again, another number for a different airport, or pound to go back to the region menu.');
  twiml.hangup();
  res.type('text/xml').send(twiml.toString());
});

// --- Re-entry: go back to region menu (e.g. after pressing #) ---
app.post('/region-menu/:regionDigit', (req, res) => {
  const { regionDigit } = req.params;
  const region = REGIONS[regionDigit];
  const twiml = new twilio.twiml.VoiceResponse();
  if (!region) {
    twiml.redirect('/voice');
    return res.type('text/xml').send(twiml.toString());
  }
  const gather = twiml.gather({ numDigits: 1, action: `/select-airport/${regionDigit}`, method: 'POST', timeout: 10, finishOnKey: '#' });
  gather.say(VOICE, generateRegionGreeting(region));
  twiml.redirect('/voice');
  res.type('text/xml').send(twiml.toString());
});

// --- Analytics dashboard ---
app.get('/analytics', (req, res) => {
  const entries = readAnalytics();
  const stats = computeStats(entries);
  const { readCreditLog, computeCreditStats } = require('./src/audio/credit-tracker');
  stats.creditStats = computeCreditStats(readCreditLog());
  res.type('text/html').send(renderDashboard(stats));
});

// --- Health check ---
app.get('/health', (req, res) => {
  const airports = {};
  let anyMissing = false;
  for (const { icao } of AIRPORTS_LIST) {
    const d = getCache(icao);
    if (d) {
      const ageSeconds = Math.floor((Date.now() - new Date(d.updatedAt).getTime()) / 1000);
      airports[icao] = { status: 'available', letter: d.letter, hasAudio: d.hasAudio, updatedAt: d.updatedAt, ageSeconds };
    } else {
      airports[icao] = { status: 'unavailable', updatedAt: null, ageSeconds: null };
      anyMissing = true;
    }
  }
  res.json({ status: anyMissing ? 'degraded' : 'ok', airports });
});

// --- Manual refresh trigger ---
app.post('/refresh', async (req, res) => {
  res.json({ ok: true, message: 'Refresh triggered' });
  refreshAtisData();
});

// --- ATIS refresh ---
function formatForSpeech(raw, icao, name, letter) {
  if (!raw) return null;
  // The raw Aeroview text is already fairly readable - clean it up for Polly
  let s = raw
    .replace(/\bKT\b/g, 'knots')
    .replace(/\bSM\b/g, 'statute miles')
    .replace(/\bFEW(\d{3})\b/g, (_, h) => `few clouds at ${parseInt(h) * 100} feet`)
    .replace(/\bSCT(\d{3})\b/g, (_, h) => `scattered at ${parseInt(h) * 100} feet`)
    .replace(/\bBKN(\d{3})\b/g, (_, h) => `ceiling broken at ${parseInt(h) * 100} feet`)
    .replace(/\bOVC(\d{3})\b/g, (_, h) => `ceiling overcast at ${parseInt(h) * 100} feet`)
    .replace(/\bCLR\b/g, 'sky clear')
    .replace(/\bSKC\b/g, 'sky clear')
    .replace(/\bCAVOK\b/g, 'ceiling and visibility okay')
    .replace(/\bP6SM\b/g, 'greater than 6 statute miles')
    .replace(/\bVRB\b/g, 'variable')
    .replace(/\bRMK\b.*$/s, '') // strip remarks
    .replace(/(\d{3})(\d{2,3})knots/g, (_, dir, spd) => `wind ${dir} degrees at ${spd} knots`)
    .replace(/\bG(\d+)knots\b/g, 'gusting $1 knots')
    .replace(/\bM(\d{2})\b/g, 'minus $1')
    .trim();

  if (letter && !s.toLowerCase().includes('advise on initial contact')) {
    s += `. Advise on initial contact you have information ${letter}.`;
  }
  return s;
}

async function refreshAtisData() {
  logger.info(`[${new Date().toISOString()}] Refreshing ATIS data...`);

  // Split airports by source
  const aeroviewAirports = AIRPORTS_LIST.filter(a => (a.source || 'aeroview') === 'aeroview');
  const metarAirports = AIRPORTS_LIST.filter(a => a.source === 'metar');

  // Fetch both sources in parallel
  const [aeroviewResults, metarResults] = await Promise.all([
    aeroviewAirports.length ? scrapeAll(aeroviewAirports.map(a => a.icao)) : new Map(),
    metarAirports.length ? fetchMetar(metarAirports.map(a => a.icao)) : new Map(),
  ]);

  // Process Aeroview airports
  for (const { icao, name } of aeroviewAirports) {
    const result = aeroviewResults.get(icao);
    if (result && result.raw) {
      const cached = getCache(icao);
      if (cached && cached.letter && cached.letter === result.letter) {
        cached.updatedAt = new Date().toISOString();
        recordSuccess(icao);
        logger.info(`  ${icao}: information ${result.letter} (unchanged, skipping TTS)`);
      } else {
        const speechText = await humanizeAtis(result.raw, name);
        await updateCache(icao, speechText, result.letter);
        recordSuccess(icao);
        logger.info(`  ${icao}: information ${result.letter || '?'}`);
      }
    } else {
      recordFailure(icao, 'No data returned from scraper');
      logger.info(`  ${icao}: no data`);
    }
  }

  // Process METAR airports
  for (const { icao, name } of metarAirports) {
    const result = metarResults.get(icao);
    if (result && result.raw) {
      const cached = getCache(icao);
      // Use observation time as change key (like ATIS letter for D-ATIS)
      if (cached && cached.letter && cached.letter === result.observationTime) {
        cached.updatedAt = new Date().toISOString();
        recordSuccess(icao);
        logger.info(`  ${icao}: METAR ${result.observationTime} (unchanged, skipping TTS)`);
      } else {
        const speechText = await humanizeAtis(result.raw, name, { source: 'metar' });
        await updateCache(icao, speechText, result.observationTime);
        recordSuccess(icao);
        logger.info(`  ${icao}: METAR ${result.observationTime}`);
      }
    } else {
      // No fresh METAR — keep last known weather if we have it
      const cached = getCache(icao);
      if (cached && cached.updatedAt) {
        logger.info(`  ${icao}: no fresh METAR, keeping last known from ${cached.updatedAt}`);
      } else {
        recordFailure(icao, 'No METAR data returned');
        logger.info(`  ${icao}: no METAR data (never received)`);
      }
    }
  }

  await checkAlerts();
}

// --- Graceful shutdown (PM2 sends SIGINT/SIGTERM on restart) ---
async function shutdown(signal) {
  console.log(`[${signal}] Shutting down, closing Playwright browser...`);
  await closeBrowser();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// --- Start ---
if (require.main === module) {
  refreshAtisData();
  setInterval(refreshAtisData, 15 * 60 * 1000);
  startWatchdog();

  app.listen(port, () => {
    console.log(`ATIS Line listening on port ${port}`);
    console.log(`Regions: ${Object.entries(REGIONS).map(([d, r]) => `${d}=${r.region}`).join(', ')}`);
    console.log(`Airports: ${ALL_ICAOS.join(', ')}`);
  });
}

module.exports = { app, REGIONS, AIRPORTS_LIST, AIRPORTS: AIRPORTS_LIST, refreshAtisData, formatForSpeech, getStalenessState, STALE_THRESHOLD_MS, MAX_CALL_DURATION };

