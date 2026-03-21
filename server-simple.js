const express = require('express');
const twilio = require('twilio');

const app = express();
const port = 3338;

app.use(express.urlencoded({ extended: false }));

const AIRPORTS = {
  '1': { icao: 'CYPK', name: 'Pitt Meadows' },
  '2': { icao: 'CZBB', name: 'Boundary Bay' },
  '3': { icao: 'CYHC', name: 'Vancouver Harbour' },
  '4': { icao: 'CYNJ', name: 'Langley' },
  '5': { icao: 'CYVR', name: 'Vancouver International' },
};

// Simple cache
const cache = new Map();

async function fetchMetar(icao) {
  try {
    const url = `https://plan.navcanada.ca/weather/api/alpha/?site=${icao}&alpha=metar&metar_choice=3`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.data && data.data.length > 0) {
      return data.data[0].text;
    }
  } catch (err) {
    console.error(`${icao}: ${err.message}`);
  }
  return null;
}

function metarToSpeech(metar, name) {
  if (!metar) return null;
  
  let s = metar
    .replace(/^LWIS\s+/, '')           // strip LWIS prefix
    .replace(/^METAR\s+/, '')          // strip METAR prefix
    .replace(/^SPECI\s+/, '')          // strip SPECI prefix
    .replace(/=\s*$/, '')              // strip trailing =
    .replace(/\bAUTO\b/g, 'automated observation')
    .replace(/\bKT\b/g, 'knots')
    .replace(/\bSM\b/g, 'statute miles')
    .replace(/\bP6SM\b/g, 'greater than 6 statute miles')
    .replace(/\bFEW(\d{3})/g, (_, h) => `few clouds at ${parseInt(h) * 100} feet`)
    .replace(/\bSCT(\d{3})/g, (_, h) => `scattered at ${parseInt(h) * 100} feet`)
    .replace(/\bBKN(\d{3})/g, (_, h) => `ceiling broken ${parseInt(h) * 100} feet`)
    .replace(/\bOVC(\d{3})/g, (_, h) => `ceiling overcast ${parseInt(h) * 100} feet`)
    .replace(/\bCLR\b/g, 'sky clear')
    .replace(/\bSKC\b/g, 'sky clear')
    .replace(/\bVRB(\d{2,3})/g, 'variable at $1')
    .replace(/(\d{3})(\d{2,3})knots/g, '$1 degrees at $2 knots')
    .replace(/G(\d+)/g, 'gusting $1')
    .replace(/(\d{3})V(\d{3})/g, 'variable between $1 and $2')
    .replace(/\b(\d{2})\/(\d{2})\b/g, 'temperature $1, dewpoint $2')
    .replace(/\bM(\d{2})/g, 'minus $1')
    .replace(/\bA(\d{2})(\d{2})\b/g, 'altimeter $1 decimal $2')
    .replace(/\b-RA\b/g, 'light rain')
    .replace(/\b\+RA\b/g, 'heavy rain')
    .replace(/\bRA\b/g, 'rain')
    .replace(/\b-SN\b/g, 'light snow')
    .replace(/\bSN\b/g, 'snow')
    .replace(/\bBR\b/g, 'mist')
    .replace(/\bFG\b/g, 'fog')
    .replace(/\bDZ\b/g, 'drizzle')
    .replace(/\bSHRA\b/g, 'rain showers')
    .replace(/\bTSRA\b/g, 'thunderstorm with rain')
    .replace(/\bRMK\b/g, '. Remarks: ')
    .replace(/\bNOSIG\b/g, 'no significant change');

  return `${name} weather. ${s}`;
}

async function refresh() {
  console.log(`[${new Date().toLocaleTimeString()}] Refreshing...`);
  for (const airport of Object.values(AIRPORTS)) {
    const metar = await fetchMetar(airport.icao);
    if (metar) {
      cache.set(airport.icao, {
        raw: metar,
        speech: metarToSpeech(metar, airport.name),
        time: new Date().toISOString(),
      });
      console.log(`  ${airport.icao}: OK`);
    } else {
      console.log(`  ${airport.icao}: no data`);
    }
  }
}

// IVR
app.post('/voice', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const gather = twiml.gather({ numDigits: 1, action: '/airport', method: 'POST', timeout: 10 });
  gather.say({ voice: 'Polly.Matthew' },
    'Lower Mainland aviation weather. ' +
    'This is an unofficial community service, not affiliated with NAV CANADA. ' +
    'Always verify with official sources. ' +
    'Press 1 for Pitt Meadows. ' +
    'Press 2 for Boundary Bay. ' +
    'Press 3 for Vancouver Harbour. ' +
    'Press 4 for Langley. ' +
    'Press 5 for Vancouver International.');
  twiml.redirect('/voice');
  res.type('text/xml').send(twiml.toString());
});

app.post('/airport', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const airport = AIRPORTS[req.body.Digits];
  
  if (!airport) {
    twiml.say({ voice: 'Polly.Matthew' }, 'Invalid selection.');
    twiml.redirect('/voice');
    return res.type('text/xml').send(twiml.toString());
  }

  const data = cache.get(airport.icao);
  if (!data) {
    twiml.say({ voice: 'Polly.Matthew' }, `${airport.name} weather is currently unavailable.`);
    twiml.redirect('/voice');
    return res.type('text/xml').send(twiml.toString());
  }

  twiml.say({ voice: 'Polly.Matthew' }, data.speech);
  
  const gather = twiml.gather({ numDigits: 1, action: '/airport', method: 'POST', timeout: 5 });
  gather.say({ voice: 'Polly.Matthew' }, 'Press another number, or hang up. Fly safe.');
  twiml.hangup();
  res.type('text/xml').send(twiml.toString());
});

app.get('/health', (req, res) => {
  const status = {};
  for (const a of Object.values(AIRPORTS)) {
    const d = cache.get(a.icao);
    status[a.icao] = d ? { available: true, time: d.time } : { available: false };
  }
  res.json({ ok: true, airports: status });
});

// Start
refresh();
setInterval(refresh, 5 * 60 * 1000);

app.listen(port, () => {
  console.log(`ATIS Line on port ${port}`);
});
