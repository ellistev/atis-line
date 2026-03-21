const express = require('express');
const path = require('node:path');
const twilio = require('twilio');
const { getAtisLetter, formatAtis } = require('./src/speech/formatter');
const { updateCache, getCache, getAudioUrl, AUDIO_DIR } = require('./src/audio/cache-manager');
const { getTwilioVoice } = require('./src/audio/tts');
const { logCall } = require('./src/call-logger');

const app = express();
const port = process.env.PORT || 3338;
const BASE_URL = process.env.BASE_URL || `http://localhost:${port}`;

app.use(express.urlencoded({ extended: false }));

// Serve cached audio files
app.use('/audio', express.static(AUDIO_DIR));

// Airport configuration
const AIRPORTS = {
  '1': { icao: 'CYPK', name: 'Pitt Meadows' },
  '2': { icao: 'CZBB', name: 'Boundary Bay' },
  '3': { icao: 'CYHC', name: 'Vancouver Harbour' },
  '4': { icao: 'CYNJ', name: 'Langley' },
  '5': { icao: 'CYVR', name: 'Vancouver International' },
};

// Twilio webhook - incoming call
app.post('/voice', (req, res) => {
  logCall({
    callSid: req.body.CallSid,
    callerNumber: req.body.From,
    timestamp: new Date().toISOString(),
  });

  const twiml = new twilio.twiml.VoiceResponse();
  const voice = getTwilioVoice();

  const gather = twiml.gather({
    numDigits: 1,
    action: '/select-airport',
    method: 'POST',
    timeout: 10,
  });

  gather.say(voice,
    'Metro Vancouver aviation weather. ' +
    'This is an unofficial automated service and is not affiliated with NAV CANADA. ' +
    'Information is provided as a convenience only and should not be used as a sole source for flight planning. ' +
    'Always verify conditions through official sources. ' +
    'Press 1 for Pitt Meadows. ' +
    'Press 2 for Boundary Bay. ' +
    'Press 3 for Vancouver Harbour. ' +
    'Press 4 for Langley. ' +
    'Press 5 for Vancouver International.');

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

  // Log airport selection
  logCall({
    callSid: req.body.CallSid,
    callerNumber: req.body.From,
    airportIcao: airport.icao,
    airportName: airport.name,
    timestamp: new Date().toISOString(),
  });

  // Get cached ATIS data
  const cached = getCache(airport.icao);

  if (!cached) {
    twiml.say(voice,
      `${airport.name} A-T-I-S is currently unavailable. Please try again later.`);
    twiml.redirect('/voice');
    res.type('text/xml');
    return res.send(twiml.toString());
  }

  // Warn if data may be stale (cache older than 15 minutes)
  if (cached.updatedAt && (Date.now() - cached.updatedAt > 15 * 60 * 1000)) {
    twiml.say(voice, 'Note: this information may be outdated.');
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
    console.error(`METAR fetch failed for ${icao}:`, err.message);
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
  console.log(`[${new Date().toISOString()}] Refreshing ATIS data...`);

  for (const [digit, airport] of Object.entries(AIRPORTS)) {
    const metar = await fetchMetar(airport.icao);
    if (metar) {
      // Use the proper formatter which handles LWIS and standard METAR
      const result = formatAtis({ icao: airport.icao, name: airport.name, rawMetar: metar });
      // Update audio cache (regenerates audio only if text changed)
      await updateCache(airport.icao, result.text, result.letter);
      console.log(`  ${airport.icao}: information ${letter}`);
    } else {
      console.log(`  ${airport.icao}: no data`);
    }
  }
}

// Only start server and data refresh when run directly (not when imported for tests)
if (require.main === module) {
  refreshAtisData();
  setInterval(refreshAtisData, 5 * 60 * 1000);

  app.listen(port, () => {
    console.log(`ATIS Line server listening on port ${port}`);
    console.log(`Airports: ${Object.values(AIRPORTS).map(a => a.icao).join(', ')}`);
  });
}

module.exports = { app, AIRPORTS, refreshAtisData, fetchMetar, formatMetarForSpeech, logCall };
