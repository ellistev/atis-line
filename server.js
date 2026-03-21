const express = require('express');
const twilio = require('twilio');
const { RefreshService } = require('./src/data/refresh-service');

const app = express();
const port = process.env.PORT || 3338;

app.use(express.urlencoded({ extended: false }));

// Airport configuration
const AIRPORTS = {
  '1': { icao: 'CYPK', name: 'Pitt Meadows' },
  '2': { icao: 'CZBB', name: 'Boundary Bay' },
  '3': { icao: 'CYHC', name: 'Vancouver Harbour' },
  '4': { icao: 'CYNJ', name: 'Langley' },
  '5': { icao: 'CYVR', name: 'Vancouver International' },
};

// Data refresh service - fetches from NAV CANADA API every 5 minutes
const refreshService = new RefreshService({
  formatForSpeech: formatMetarForSpeech,
});

// Twilio webhook - incoming call
app.post('/voice', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  
  const gather = twiml.gather({
    numDigits: 1,
    action: '/select-airport',
    method: 'POST',
    timeout: 10,
  });
  
  gather.say({
    voice: 'Polly.Joanna',
    language: 'en-US',
  }, 'Metro Vancouver aviation weather. ' +
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
  
  if (!airport) {
    twiml.say({ voice: 'Polly.Joanna' }, 'Invalid selection.');
    twiml.redirect('/voice');
    res.type('text/xml');
    return res.send(twiml.toString());
  }
  
  // Get cached ATIS data
  const atis = refreshService.getSpeech(airport.icao);
  
  if (!atis) {
    twiml.say({ voice: 'Polly.Joanna' }, 
      `${airport.name} A-T-I-S is currently unavailable. Please try again later.`);
    twiml.redirect('/voice');
    res.type('text/xml');
    return res.send(twiml.toString());
  }
  
  // Read ATIS
  twiml.say({ voice: 'Polly.Joanna' }, 
    `${airport.name} A-T-I-S. ${atis}`);
  
  // Option to hear another airport
  const gather = twiml.gather({
    numDigits: 1,
    action: '/select-airport',
    method: 'POST',
    timeout: 5,
  });
  gather.say({ voice: 'Polly.Joanna' }, 
    'Press another number for a different airport, or hang up.');
  
  twiml.say({ voice: 'Polly.Joanna' }, 'Goodbye.');
  twiml.hangup();
  
  res.type('text/xml');
  res.send(twiml.toString());
});

// Health check
app.get('/health', (req, res) => {
  const cached = Object.fromEntries(
    [...refreshService.cache.entries()].map(([k, v]) => [k, v ? 'available' : 'unavailable'])
  );
  res.json({ status: 'ok', airports: cached });
});

// ----- ATIS Data -----

function formatMetarForSpeech(metar) {
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

// Start data refresh from NAV CANADA API
refreshService.start();

app.listen(port, () => {
  console.log(`ATIS Line server listening on port ${port}`);
  console.log(`Airports: ${Object.values(AIRPORTS).map(a => a.icao).join(', ')}`);
});
