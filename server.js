const express = require('express');
const twilio = require('twilio');
const { loadAirports, getRegions, generateTopGreeting, generateRegionGreeting } = require('./src/config/airports');
const { scrapeAll } = require('./src/data/aeroview');
const { getRandomSignOff, getRandomJoke, ABOUT_TEXT } = require('./src/personality');

const app = express();
const port = process.env.PORT || 3338;
const BASE_URL = process.env.BASE_URL || `http://localhost:${port}`;

app.use(express.urlencoded({ extended: false }));

// --- Airport config ---
const AIRPORTS_LIST = loadAirports();
const REGIONS = getRegions(AIRPORTS_LIST);
const ALL_ICAOS = AIRPORTS_LIST.map(a => a.icao);

// --- ATIS cache: Map<icao, { raw, letter, speechText, updatedAt }> ---
const cache = new Map();

const VOICE = { voice: 'Polly.Joanna', language: 'en-US' };

// --- IVR: top-level menu ---
app.post('/voice', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const gather = twiml.gather({ numDigits: 1, action: '/select-region', method: 'POST', timeout: 10 });
  gather.say(VOICE, generateTopGreeting(REGIONS));
  twiml.redirect('/voice');
  res.type('text/xml').send(twiml.toString());
});

// --- IVR: region selected -> airport sub-menu ---
app.post('/select-region', (req, res) => {
  const digit = req.body.Digits;
  const twiml = new twilio.twiml.VoiceResponse();

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

  const gather = twiml.gather({ numDigits: 1, action: `/select-airport/${digit}`, method: 'POST', timeout: 10 });
  gather.say(VOICE, generateRegionGreeting(region));
  twiml.redirect('/voice');
  res.type('text/xml').send(twiml.toString());
});

// --- IVR: airport selected -> read ATIS ---
app.post('/select-airport/:regionDigit', (req, res) => {
  const { regionDigit } = req.params;
  const digit = req.body.Digits;
  const twiml = new twilio.twiml.VoiceResponse();

  const region = REGIONS[regionDigit];
  if (!region) {
    twiml.redirect('/voice');
    return res.type('text/xml').send(twiml.toString());
  }

  const airport = region.airports.find(a => a.digit === digit);
  if (!airport) {
    twiml.say(VOICE, 'Invalid selection.');
    twiml.redirect(`/select-region`);
    return res.type('text/xml').send(twiml.toString());
  }

  const data = cache.get(airport.icao);
  if (!data) {
    twiml.say(VOICE, `${airport.name} ATIS is currently unavailable. Please try again shortly.`);
    twiml.redirect('/voice');
    return res.type('text/xml').send(twiml.toString());
  }

  twiml.say(VOICE, data.speechText);
  twiml.pause({ length: 1 });
  twiml.say(VOICE, getRandomSignOff());

  const gather = twiml.gather({ numDigits: 1, action: `/select-airport/${regionDigit}`, method: 'POST', timeout: 5 });
  gather.say(VOICE, 'Press another number for a different airport, or hang up.');
  twiml.hangup();
  res.type('text/xml').send(twiml.toString());
});

// --- Health check ---
app.get('/health', (req, res) => {
  const airports = {};
  let anyMissing = false;
  for (const { icao, name } of AIRPORTS_LIST) {
    const d = cache.get(icao);
    if (d) {
      airports[icao] = { status: 'available', letter: d.letter, updatedAt: d.updatedAt };
    } else {
      airports[icao] = { status: 'unavailable' };
      anyMissing = true;
    }
  }
  res.json({ status: anyMissing ? 'degraded' : 'ok', airports });
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
  console.log(`[${new Date().toISOString()}] Refreshing ATIS from Aeroview...`);
  const results = await scrapeAll(ALL_ICAOS);

  for (const { icao, name } of AIRPORTS_LIST) {
    const result = results.get(icao);
    if (result && result.raw) {
      const speechText = formatForSpeech(result.raw, icao, name, result.letter);
      cache.set(icao, {
        raw: result.raw,
        letter: result.letter,
        speechText,
        updatedAt: new Date().toISOString(),
      });
      console.log(`  ${icao}: information ${result.letter || '?'}`);
    } else {
      console.log(`  ${icao}: no data`);
    }
  }
}

// --- Start ---
if (require.main === module) {
  refreshAtisData();
  setInterval(refreshAtisData, 15 * 60 * 1000);

  app.listen(port, () => {
    console.log(`ATIS Line listening on port ${port}`);
    console.log(`Regions: ${Object.entries(REGIONS).map(([d, r]) => `${d}=${r.region}`).join(', ')}`);
    console.log(`Airports: ${ALL_ICAOS.join(', ')}`);
  });
}

module.exports = { app, REGIONS, AIRPORTS_LIST, refreshAtisData, formatForSpeech };
