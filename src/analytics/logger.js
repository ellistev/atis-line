const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const log = require('../logger');

const ANALYTICS_PATH = path.join(__dirname, '..', '..', 'analytics.jsonl');

function hashCaller(phoneNumber) {
  if (!phoneNumber) return 'anonymous';
  return crypto.createHash('sha256').update(phoneNumber).digest('hex').slice(0, 12);
}

function logCall({ region, airport, duration, timestamp, callerNumber, callSid }) {
  const entry = {
    timestamp: timestamp || new Date().toISOString(),
    region: region != null ? Number(region) : null,
    airport: airport || null,
    duration: duration != null ? Number(duration) : null,
    caller: hashCaller(callerNumber),
    sid: callSid || null,
  };

  try {
    fs.appendFileSync(ANALYTICS_PATH, JSON.stringify(entry) + '\n');
  } catch (err) {
    log.error('Failed to write analytics log:', err.message);
  }

  return entry;
}

module.exports = { logCall, hashCaller, ANALYTICS_PATH };
