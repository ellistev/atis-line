# ATIS Line - Agent Context

Free phone-based aviation weather (ATIS/METAR) for British Columbia pilots. Call +1 (778) 200-5935, pick a region, pick an airport, hear current weather.

## Stack

Node.js / Express / Twilio Voice API. No TypeScript, no build step. Tests via `node --test`.

## Project Layout

```
server.js                 Main Express app + Twilio IVR routes + ATIS refresh loop
airports.json             All airports, regions, digits, data source (aeroview|metar)
src/
  config/airports.js      Loads airports.json, builds region map, generates IVR greetings
  data/aeroview.js        Playwright browser scraper for NAV CANADA Aeroview D-ATIS
  data/metar.js           HTTP fetch from aviationweather.gov for METAR data
  data/taf-parser.js      TAF parsing
  data/taf-formatter.js   TAF to speech
  audio/tts.js            TTS generation (ElevenLabs or OpenAI, provider param)
  audio/cache-manager.js  Audio file caching (MP3 on disk), change detection
  audio/credit-tracker.js ElevenLabs credit usage logging
  speech/humanize.js      LLM-powered ATIS-to-speech conversion (natural language)
  speech/formatter.js     METAR abbreviation expansion
  monitoring/alerter.js   Staleness detection, failure tracking
  monitoring/watchdog.js  Periodic health checks
  analytics/logger.js     Call logging
  analytics/dashboard.js  /analytics HTML dashboard
  security/rate-limiter.js  Per-caller rate limiting
  personality.js          Sign-offs, jokes, about text
  logger.js               Structured logging
test/                     24 test files, all co-located in test/
```

## Architecture

### IVR Menu (Twilio DTMF)

```
Caller dials in
  -> /voice (top menu: "Press 1 for Lower Mainland, 2 for Victoria...")
    -> /select-region (picks region by digit)
      -> /region-menu/:regionDigit (sub-menu: "Press 1 for Vancouver, 2 for Abbotsford...")
        -> /select-airport/:regionDigit (picks airport, plays ATIS)
```

Key controls during playback:
- `*` = replay current report
- `#` = back to region menu
- Any digit = pick different airport in same region

### Data Sources (two types)

1. **Aeroview (browser scrape)** - D-ATIS from NAV CANADA. Uses Playwright to scrape `spaces.navcanada.ca`. Higher quality, has ATIS letter. Used for Lower Mainland + Victoria airports.
2. **METAR (HTTP API)** - From `aviationweather.gov`. Simple HTTP GET. Used for North Coast + Interior airports.

Configured per-airport in `airports.json` via the `source` field.

### TTS Pipeline (two providers)

- **ElevenLabs** - Used for aeroview airports (premium quality, monthly credit budget)
- **OpenAI TTS** - Used for METAR airports (cheaper, ~$0.015/1K chars)

Provider is passed through `updateCache()` -> `tts.js`. The `provider` field in `updateCache` options controls which TTS API is called.

### Change Detection (avoids unnecessary TTS regeneration)

- **Aeroview**: Compares ATIS letter (A, B, C...). Same letter = skip TTS.
- **METAR**: Strips observation timestamp from raw METAR, hashes weather content only. Same weather with new timestamp = skip TTS. Stored as `weatherKey` on cache entry.

### Refresh Cycle

`refreshAtisData()` runs every 15 minutes. Fetches all airports in parallel (aeroview scrape + METAR HTTP), updates cache only when content changes, generates new TTS audio when needed.

## Deployment

- **Server:** 178.156.208.66 (Hetzner), path `/var/www/atis-line`
- **Process:** PM2 as `atis-line`
- **Auto-deploy:** Push to `main` triggers GitHub Actions -> SSH -> `git pull && npm install && pm2 restart`
- **Manual deploy:** `ssh root@178.156.208.66 "cd /var/www/atis-line && git pull && pm2 restart atis-line"`

## Regions & Airports (18 total)

| Region | Digit | Airports | Source |
|--------|-------|----------|--------|
| Lower Mainland | 1 | CYVR, CYXX, CYPK, CZBB, CYHC, CYNJ | aeroview |
| Victoria | 2 | CYYJ, CYCD, CYWH | aeroview |
| North Coast | 3 | CYPR, CYXT, CZMT, CYZP, CBBC | metar |
| Interior | 4 | CYLW, CYKA, CYXS, CYQQ | metar |

To add airports: edit `airports.json`. No code changes needed. Region grouping and IVR menus are generated dynamically.

## Key Twilio Behaviors

- `finishOnKey` on a `Gather`: if that key is pressed with zero digits collected, Twilio skips the action URL and falls through to the next TwiML verb. Don't use `finishOnKey: '#'` if you want `#` to trigger the action handler.
- `numDigits: 1`: Gather fires immediately on first keypress, no need to wait for timeout.
- Audio playback inside a Gather can be interrupted by any keypress.

## Testing

```bash
npm test                    # runs all 24 test files (376+ tests)
node --test test/server.test.js  # run specific test
```

Tests use `node:test` + `node:assert/strict`. No external test framework. Tests mock HTTP/browser dependencies.

## Environment Variables

```
PORT=3338
BASE_URL=https://atis-line.example.com
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID=...
OPENAI_API_KEY=...
```

## Quality Gates

- All tests must pass before deploy
- Never push directly to server - always go through git + GitHub Actions
- Test after every change
