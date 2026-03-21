const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const log = require('../logger');

const LOGS_DIR = path.join(__dirname, '..', '..', 'logs');

function getLogPath(date = new Date()) {
  const dateStr = date.toISOString().slice(0, 10); // YYYY-MM-DD
  return path.join(LOGS_DIR, `calls-${dateStr}.jsonl`);
}

function hashCaller(phoneNumber) {
  if (!phoneNumber) return 'anonymous';
  return crypto.createHash('sha256').update(phoneNumber).digest('hex');
}

function logCall({ callSid, callerNumber, airportSelected, duration }) {
  const entry = {
    timestamp: new Date().toISOString(),
    callSid: callSid || 'unknown',
    caller: hashCaller(callerNumber),
    airport: airportSelected || null,
    duration: duration != null ? Number(duration) : null,
  };

  try {
    if (!fs.existsSync(LOGS_DIR)) {
      fs.mkdirSync(LOGS_DIR, { recursive: true });
    }
    fs.appendFileSync(getLogPath(), JSON.stringify(entry) + '\n');
  } catch (err) {
    log.error('Failed to write call log:', err.message);
  }

  return entry;
}

function readLogs(date = new Date()) {
  const logPath = getLogPath(date);
  if (!fs.existsSync(logPath)) return [];

  const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
  return lines.filter(Boolean).map((line) => JSON.parse(line));
}

function getStats() {
  const today = new Date();
  const todayEntries = readLogs(today);

  const totalCalls = todayEntries.length;

  // Count by airport
  const byAirport = {};
  const hourCounts = {};
  const uniqueCallers = new Set();

  for (const entry of todayEntries) {
    // By airport
    if (entry.airport) {
      byAirport[entry.airport] = (byAirport[entry.airport] || 0) + 1;
    }

    // Peak hour
    const hour = new Date(entry.timestamp).getHours();
    hourCounts[hour] = (hourCounts[hour] || 0) + 1;

    // Unique callers
    uniqueCallers.add(entry.caller);
  }

  // Find peak hour
  let peakHour = null;
  let peakCount = 0;
  for (const [hour, count] of Object.entries(hourCounts)) {
    if (count > peakCount) {
      peakHour = Number(hour);
      peakCount = count;
    }
  }

  return {
    totalCalls,
    today: today.toISOString().slice(0, 10),
    byAirport,
    peakHour,
    uniqueCallers: uniqueCallers.size,
  };
}

function resetLogs() {
  if (fs.existsSync(LOGS_DIR)) {
    for (const file of fs.readdirSync(LOGS_DIR)) {
      if (file.endsWith('.jsonl')) {
        fs.unlinkSync(path.join(LOGS_DIR, file));
      }
    }
  }
}

module.exports = { logCall, readLogs, getStats, hashCaller, resetLogs, getLogPath, LOGS_DIR };
