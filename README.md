# Metro Vancouver ATIS Phone Line

Automated ATIS (Automatic Terminal Information Service) phone system for Metro Vancouver airports. Call one number, select your airport, hear the current weather and runway info.

Replaces the deprecated NAV CANADA phone-based ATIS service.

## Airports
- **1** CYPK - Pitt Meadows
- **2** CZBB - Boundary Bay
- **3** CYHC - Vancouver Harbour
- **4** CYNJ - Langley
- **5** CYVR - Vancouver International

## Architecture
- **Twilio** - Phone number + IVR menu (DTMF input)
- **TTS** - ElevenLabs or OpenAI TTS for natural voice playback
- **Data Sources** - NAV CANADA Aeroview (browser), aviationweather.gov API (METAR/TAF)
- **Cache** - ATIS data refreshed every 5 minutes, audio cached
- **Webhook** - Express server handles Twilio callbacks

## Stack
- Node.js / Express
- Twilio Voice API
- ElevenLabs TTS (or OpenAI TTS)
- Browser automation for NAV CANADA Aeroview
- aviationweather.gov REST API for METAR/TAF

## How It Works
1. Caller dials the Twilio number
2. IVR greeting: "Metro Vancouver ATIS. Press 1 for Pitt Meadows..."
3. Caller presses a digit
4. Server looks up cached ATIS data for that airport
5. TTS converts to speech, plays back to caller
6. Data refreshes every 5 minutes from live sources
