const express = require('express');
const twilio = require('twilio');
const log = require('./src/logger');

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

const cache = new Map();
const ATIS_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LETTER_NAMES = ['Alpha','Bravo','Charlie','Delta','Echo','Foxtrot','Golf','Hotel',
  'India','Juliet','Kilo','Lima','Mike','November','Oscar','Papa','Quebec','Romeo',
  'Sierra','Tango','Uniform','Victor','Whiskey','X-ray','Yankee','Zulu'];
const letterIndex = new Map();

function getAtisLetter(icao, metar) {
  const prev = letterIndex.get(icao);
  if (prev && prev.metar === metar) return prev.letter;
  const idx = prev ? (prev.idx + 1) % 26 : 0;
  letterIndex.set(icao, { idx, letter: LETTER_NAMES[idx], metar });
  return LETTER_NAMES[idx];
}

async function fetchMetar(icao) {
  try {
    const res = await fetch(`https://plan.navcanada.ca/weather/api/alpha/?site=${icao}&alpha=metar&metar_choice=3`);
    const data = await res.json();
    if (data.data && data.data.length > 0) return data.data[0].text;
  } catch (err) {
    log.error(`${icao}: ${err.message}`);
  }
  return null;
}

function metarToSpeech(metar, name, letter) {
  if (!metar) return null;
  
  // Extract observation time
  const timeMatch = metar.match(/(\d{2})(\d{2})(\d{2})Z/);
  const obsTime = timeMatch ? `${timeMatch[2]}${timeMatch[3]} zulu` : '';

  let s = metar
    .replace(/^LWIS\s+/, '')
    .replace(/^METAR\s+/, '')
    .replace(/^SPECI\s+/, '')
    .replace(/=\s*$/, '')
    .replace(/\b\w{4}\s+\d{6}Z\s*/, '')  // strip station + time (we announce separately)
    .replace(/\bAUTO\b\s*/g, '')          // strip AUTO (we mention it differently)
    .replace(/\bKT\b/g, 'knots')
    .replace(/\bP6SM\b/g, 'visibility greater than 6')
    .replace(/(\d+)SM\b/g, 'visibility $1 statute miles')
    .replace(/\bFEW(\d{3})/g, (_, h) => `few clouds at ${parseInt(h) * 100} feet`)
    .replace(/\bSCT(\d{3})/g, (_, h) => `scattered at ${parseInt(h) * 100} feet`)
    .replace(/\bBKN(\d{3})/g, (_, h) => `ceiling broken ${parseInt(h) * 100} feet`)
    .replace(/\bOVC(\d{3})/g, (_, h) => `ceiling overcast ${parseInt(h) * 100} feet`)
    .replace(/\bCLR\b/g, 'sky clear')
    .replace(/\bSKC\b/g, 'sky clear')
    .replace(/\bCAVOK\b/g, 'ceiling and visibility okay')
    .replace(/\bVRB(\d{2,3})/g, 'variable at $1')
    .replace(/(\d{3})(\d{2,3})knots/g, (_, dir, spd) => `wind ${dir} degrees at ${spd} knots`)
    .replace(/G(\d+)/g, 'gusting $1')
    .replace(/(\d{3})V(\d{3})/g, 'variable between $1 and $2')
    .replace(/\b(\d{2})\/(\d{2})\b/g, 'temperature $1, dewpoint $2')
    .replace(/\bM(\d{2})/g, 'minus $1')
    .replace(/\bA(\d{2})(\d{2})\b/g, 'altimeter $1 point $2')
    .replace(/\b-RA\b/g, 'light rain')
    .replace(/\b\+RA\b/g, 'heavy rain')
    .replace(/\bRA\b/g, 'rain')
    .replace(/\b-SN\b/g, 'light snow')
    .replace(/\b\+SN\b/g, 'heavy snow')
    .replace(/\bSN\b/g, 'snow')
    .replace(/\bBR\b/g, 'mist')
    .replace(/\bFG\b/g, 'fog')
    .replace(/\bHZ\b/g, 'haze')
    .replace(/\bDZ\b/g, 'drizzle')
    .replace(/\b-DZ\b/g, 'light drizzle')
    .replace(/\bSHRA\b/g, 'rain showers')
    .replace(/\bTSRA\b/g, 'thunderstorm with rain')
    .replace(/\bTS\b/g, 'thunderstorm')
    .replace(/\bRMK\b.*$/, '')  // strip remarks for cleaner readback
    .replace(/\bNOSIG\b/g, 'no significant change')
    .trim();

  return `${name} information ${letter}. ${obsTime}. ${s}. ` +
    `Advise on initial contact you have information ${letter}.`;
}

async function refresh() {
  log.info(`[${new Date().toLocaleTimeString()}] Refreshing...`);
  for (const airport of Object.values(AIRPORTS)) {
    const metar = await fetchMetar(airport.icao);
    if (metar) {
      const letter = getAtisLetter(airport.icao, metar);
      cache.set(airport.icao, {
        raw: metar,
        speech: metarToSpeech(metar, airport.name, letter),
        letter,
        time: new Date().toISOString(),
      });
      log.info(`  ${airport.icao}: information ${letter}`);
    } else {
      log.info(`  ${airport.icao}: no data`);
    }
  }
}

// IVR
app.post('/voice', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const gather = twiml.gather({ numDigits: 1, action: '/airport', method: 'POST', timeout: 10 });
  gather.say({ voice: 'Polly.Joanna', rate: '85%' },
    'Lower Mainland aviation weather. ' +
    'Unofficial community service. Not affiliated with NAV CANADA. ' +
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
    twiml.say({ voice: 'Polly.Joanna' }, 'Invalid selection.');
    twiml.redirect('/voice');
    return res.type('text/xml').send(twiml.toString());
  }

  const data = cache.get(airport.icao);
  if (!data) {
    twiml.say({ voice: 'Polly.Joanna' }, `${airport.name} weather is currently unavailable.`);
    twiml.redirect('/voice');
    return res.type('text/xml').send(twiml.toString());
  }

  // Slow, clear readback
  twiml.pause({ length: 1 });
  twiml.say({ voice: 'Polly.Joanna', rate: '80%' }, data.speech);
  twiml.pause({ length: 1 });
  
  const gather = twiml.gather({ numDigits: 1, action: '/airport', method: 'POST', timeout: 5 });
  gather.say({ voice: 'Polly.Joanna' }, 'Press another number for a different airport, or hang up. Fly safe.');
  twiml.hangup();
  res.type('text/xml').send(twiml.toString());
});

app.get('/health', (req, res) => {
  const status = {};
  for (const a of Object.values(AIRPORTS)) {
    const d = cache.get(a.icao);
    status[a.icao] = d ? { available: true, letter: d.letter, time: d.time } : { available: false };
  }
  res.json({ ok: true, airports: status });
});

if (require.main === module) {
  refresh();
  setInterval(refresh, 5 * 60 * 1000);

  app.listen(port, () => {
    log.info(`ATIS Line on port ${port}`);
  });
}

module.exports = { app, AIRPORTS, getAtisLetter, metarToSpeech, fetchMetar };
