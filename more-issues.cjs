const fs = require('fs');
const token = fs.readFileSync('.env', 'utf-8').match(/GITHUB_TOKEN=(.+)/)[1].trim();

async function gh(path, method = 'GET', body = null) {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : null,
  });
  return res.json();
}

async function main() {
  // Close the duplicate #9
  await gh('/repos/ellistev/atis-line/issues/9', 'PATCH', { state: 'closed', state_reason: 'not_planned' });
  console.log('Closed duplicate #9');

  const issues = [
    {
      title: 'Dynamic airport configuration - easy to add/remove airports',
      labels: ['tierzero-agent', 'priority-3'],
      body: `## Summary
Airports should be configurable without code changes. Add a new airport by adding a line to a config file, not by modifying server code.

## Requirements

### 1. Airport Config File (airports.json)
\`\`\`json
[
  { "icao": "CYPK", "name": "Pitt Meadows", "digit": "1", "hasTaf": false },
  { "icao": "CZBB", "name": "Boundary Bay", "digit": "2", "hasTaf": false },
  { "icao": "CYHC", "name": "Vancouver Harbour", "digit": "3", "hasTaf": false },
  { "icao": "CYNJ", "name": "Langley", "digit": "4", "hasTaf": false },
  { "icao": "CYVR", "name": "Vancouver International", "digit": "5", "hasTaf": true }
]
\`\`\`

### 2. Auto-generate IVR Menu
IVR greeting should be generated from the config. Adding an airport to the JSON automatically adds it to the phone menu.

### 3. Validation
- No duplicate digits
- No duplicate ICAO codes
- Verify ICAO code returns data from NAV CANADA API on startup

### 4. Hot Reload (nice to have)
Watch airports.json for changes, reload without restart.

## Acceptance Criteria
- [ ] Adding a new airport requires only editing airports.json
- [ ] IVR menu auto-generated from config
- [ ] Server validates config on startup
- [ ] npm test passes`
    },
    {
      title: 'Call analytics and metrics - who called, what airports, when',
      labels: ['tierzero-agent', 'priority-4'],
      body: `## Summary
Track every call for usage analytics. Which airports are popular? Peak calling times? How many unique callers?

## Cost Constraint
This is a free community project. No paid analytics services. Log to files or SQLite.

## Requirements

### 1. Call Logger (src/analytics/call-logger.js)
Log each call:
\`\`\`json
{
  "timestamp": "2026-03-20T20:00:00Z",
  "callSid": "CA...",
  "callerNumber": "+1778...",  // hash for privacy
  "airportSelected": "CYPK",
  "duration": 45,
  "region": "BC"
}
\`\`\`

### 2. Storage
- Append-only log file: logs/calls.jsonl (one JSON object per line)
- Rotate daily: calls-2026-03-20.jsonl

### 3. Privacy
- Hash caller phone numbers (SHA256) - we don't need the actual number
- Don't log call content (there is none, it's playback only)

### 4. Stats Endpoint (GET /stats)
Return aggregate stats:
\`\`\`json
{
  "totalCalls": 150,
  "today": 12,
  "byAirport": { "CYPK": 45, "CYVR": 60, "CZBB": 20, "CYHC": 15, "CYNJ": 10 },
  "peakHour": "08:00",
  "uniqueCallers": 35
}
\`\`\`

### 5. Twilio Status Callback
Configure Twilio to POST call status (completed, duration) to /call-status endpoint.

## Acceptance Criteria
- [ ] Every call logged with airport selection and duration
- [ ] Caller numbers hashed for privacy
- [ ] Stats endpoint returns aggregate data
- [ ] Log files rotate daily
- [ ] npm test passes`
    },
    {
      title: 'Spam and abuse protection - rate limiting and call screening',
      labels: ['tierzero-agent', 'priority-4'],
      body: `## Summary
Prevent abuse that would run up Twilio costs. Rate limit calls per number, block known spam, set max call duration.

## Cost Constraint
Every call costs ~$0.01/min. A spam bot could rack up real money. Must protect against this cheaply.

## Requirements

### 1. Rate Limiter (src/security/rate-limiter.js)
- Max 5 calls per phone number per hour
- Max 20 calls per phone number per day
- If exceeded: "You've reached the maximum number of calls. Please try again later." then hang up

### 2. Max Call Duration
- Auto-hangup after 3 minutes (generous for listening to 2-3 airports)
- Twilio timeout parameter on the TwiML

### 3. Block List
- File-based block list: blocked-numbers.txt
- One number per line
- Check on every incoming call

### 4. Twilio-side Protection
- Document how to enable Twilio's built-in fraud detection
- Set monthly spend cap in Twilio dashboard ($50/mo)

### 5. Monitoring
- Alert if call volume exceeds 100/hour (probably abuse)
- Alert if single number calls more than 10 times in an hour
- Log blocked calls

## Acceptance Criteria
- [ ] Rate limiting enforced per caller number
- [ ] Calls auto-hangup after 3 minutes
- [ ] Block list prevents known spam numbers
- [ ] Monthly Twilio spend cap documented
- [ ] npm test passes`
    },
  ];

  for (const issue of issues) {
    const created = await gh('/repos/ellistev/atis-line/issues', 'POST', issue);
    console.log(`Created #${created.number}: ${created.title}`);
  }

  console.log('Done!');
}

main().catch(console.error);
