const express = require('express');
const path = require('node:path');
const twilio = require('twilio');
const log = require('./src/logger');
const { getAtisLetter, formatAtis } = require('./src/speech/formatter');
const { updateCache, getCache, getAudioUrl, AUDIO_DIR } = require('./src/audio/cache-manager');
const { getTwilioVoice } = require('./src/audio/tts');
const { loadAirports, generateGreeting, verifyAirports } = require('./src/config/airports');
const { parseTaf } = require('./src/data/taf-parser');
const { formatTafSpeech } = require('./src/data/taf-formatter');

const app = express();
const port = process.env.PORT || 3338;
const BASE_URL = process.env.BASE_URL || `http://localhost:${port}`;

app.use(express.urlencoded({ extended: false }));

// Serve cached audio files
app.use('/audio', express.static(AUDIO_DIR));

// Airport configuration - loaded from airports.json
const AIRPORTS = loadAirports();

// Twilio webhook - incoming call
app.post('/voice', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const voice = getTwilioVoice();

  const gather = twiml.gather({
    numDigits: 1,
    action: '/select-airport',
    method: 'POST',
    timeout: 10,
  });

  gather.say(voice, generateGreeting(AIRPORTS));

  // If no input, repeat
  twiml.redirect('/voice');

  res.type('text/xml');
  res.send(twiml.toString());
});

// Airport selected - read ATIS
app.post('/select-airport', async (req, res) => {
  const digit = req.body.Digits;
  const airport = AIRPORTS[digit];
  const twiml = new twilio.twiml.VoiceResponse();
  const voice = getTwilioVoice();

  if (!airport) {
    twiml.say(voice, 'Invalid selection.');
    twiml.redirect('/voice');
    res.type('text/xml');
    return res.send(twiml.toString());
  }

  // Get cached ATIS data
  const cached = getCache(airport.icao);

  if (!cached) {
    twiml.say(voice,
      `${airport.name} A-T-I-S is currently unavailable. Please try again later.`);
    twiml.redirect('/voice');
    res.type('text/xml');
    return res.send(twiml.toString());
  }

  // Play cached audio if available, otherwise use live TTS
  const audioUrl = getAudioUrl(airport.icao, BASE_URL);
  if (audioUrl) {
    twiml.play(audioUrl);
  } else {
    twiml.say(voice, cached.speechText);
  }

  // Option to hear another airport
  const gather = twiml.gather({
    numDigits: 1,
    action: '/select-airport',
    method: 'POST',
    timeout: 5,
  });
  gather.say(voice,
    'Press another number for a different airport, or hang up.');

  twiml.say(voice, 'Goodbye.');
  twiml.hangup();

  res.type('text/xml');
  res.send(twiml.toString());
});

// Health check
app.get('/health', (req, res) => {
  const airports = {};
  for (const airport of Object.values(AIRPORTS)) {
    const cached = getCache(airport.icao);
    airports[airport.icao] = {
      status: cached ? 'available' : 'unavailable',
      letter: cached ? cached.letter : null,
      hasAudio: cached ? cached.hasAudio : false,
    };
  }
  res.json({ status: 'ok', airports });
});

// ----- ATIS Data Fetching -----

async function fetchMetar(icao) {
  try {
    const url = `https://aviationweather.gov/api/data/metar?ids=${icao}&format=raw&hours=1`;
    const res = await fetch(url);
    const text = await res.text();
    return text.trim() || null;
  } catch (err) {
    log.error(`METAR fetch failed for ${icao}:`, err.message);
    return null;
  }
}

async function fetchTaf(icao) {
  try {
    const url = `https://aviationweather.gov/api/data/taf?ids=${icao}&format=raw`;
    const res = await fetch(url);
    const text = await res.text();
    return text.trim() || null;
  } catch (err) {
    log.error(`TAF fetch failed for ${icao}:`, err.message);
    return null;
  }
}

function formatMetarForSpeech(metar, airportName) {
  if (!metar) return null;

  // Basic METAR to speech conversion
  let speech = metar
    // Expand common abbreviations
    .replace(/\bKT\b/g, 'knots')
    .replace(/\bSM\b/g, 'statute miles')
    .replace(/\bFEW/g, 'few clouds at ')
    .replace(/\bSCT/g, 'scattered clouds at ')
    .replace(/\bBKN/g, 'broken clouds at ')
    .replace(/\bOVC/g, 'overcast at ')
    .replace(/\bCLR\b/g, 'clear skies')
    .replace(/\bSKC\b/g, 'sky clear')
    .replace(/\bVRB/g, 'variable at ')
    .replace(/\bBR\b/g, 'mist')
    .replace(/\bFG\b/g, 'fog')
    .replace(/\bRA\b/g, 'rain')
    .replace(/\bSN\b/g, 'snow')
    .replace(/\bTS\b/g, 'thunderstorm')
    .replace(/\bSHRA\b/g, 'rain showers')
    .replace(/\bDZ\b/g, 'drizzle')
    .replace(/\b-RA\b/g, 'light rain')
    .replace(/\b\+RA\b/g, 'heavy rain')
    .replace(/\bP6SM\b/g, 'greater than 6 statute miles')
    .replace(/\bCAVOK\b/g, 'ceiling and visibility okay')
    .replace(/\bNOSIG\b/g, 'no significant change')
    .replace(/\bRMK\b/g, '. Remarks: ')
    .replace(/\bA(\d{4})\b/g, 'altimeter $1')
    // Read cloud heights - add "hundred feet"
    .replace(/(\d{3})(?=\s)/g, (match) => {
      const hundreds = parseInt(match);
      return `${hundreds * 100} feet`;
    })
    // Space out wind direction/speed
    .replace(/(\d{3})(\d{2,3})knots/g, '$1 degrees at $2 knots')
    .replace(/G(\d+)/g, 'gusting $1');

  return speech;
}

async function refreshAtisData() {
  log.info(`[${new Date().toISOString()}] Refreshing ATIS data...`);

  for (const [digit, airport] of Object.entries(AIRPORTS)) {
    const metar = await fetchMetar(airport.icao);
    if (metar) {
      // Get ATIS letter (increments on data change)
      const letter = getAtisLetter(airport.icao, metar);
      // Format speech text using basic formatter (formatAtis requires parsed METAR)
      const speech = formatMetarForSpeech(metar, airport.name);

      let fullSpeech = `${airport.name} information ${letter}. ${speech}`;

      // Fetch and append TAF for airports that have terminal forecasts
      if (airport.hasTaf) {
        const rawTaf = await fetchTaf(airport.icao);
        if (rawTaf) {
          const taf = parseTaf(rawTaf);
          if (taf) {
            const tafSpeech = formatTafSpeech(taf);
            if (tafSpeech) {
              fullSpeech += '\n' + tafSpeech;
            }
          }
        }
      }

      // Update audio cache (regenerates audio only if text changed)
      await updateCache(airport.icao, fullSpeech, letter);
      log.info(`  ${airport.icao}: information ${letter}${airport.hasTaf ? ' (with forecast)' : ''}`);
    } else {
      log.info(`  ${airport.icao}: no data`);
    }
  }
}

if (require.main === module) {
  // Verify airports and start refresh cycle
  verifyAirports(AIRPORTS).then(() => {
    refreshAtisData();
    setInterval(refreshAtisData, 5 * 60 * 1000);
  });

  app.listen(port, () => {
    log.info(`ATIS Line server listening on port ${port}`);
    log.info(`Airports: ${Object.values(AIRPORTS).map(a => a.icao).join(', ')}`);
  });
}

module.exports = { app, AIRPORTS, refreshAtisData, fetchMetar, fetchTaf, formatMetarForSpeech };
