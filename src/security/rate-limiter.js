const fs = require('node:fs');
const path = require('node:path');
const log = require('../logger');
const { hashCaller } = require('../analytics/call-logger');

// Rate limits
const MAX_CALLS_PER_HOUR = 5;
const MAX_CALLS_PER_DAY = 20;

// Monitoring thresholds
const GLOBAL_HOURLY_ALERT_THRESHOLD = 100;
const SINGLE_CALLER_HOURLY_ALERT_THRESHOLD = 10;

// In-memory call tracking: Map<hashedCaller, timestamp[]>
const callTimestamps = new Map();

// Block list file path
const BLOCK_LIST_PATH = path.join(__dirname, '..', '..', 'blocked-numbers.txt');

function getCallTimestamps(callerHash) {
  return callTimestamps.get(callerHash) || [];
}

function recordCall(callerHash) {
  const now = Date.now();
  const timestamps = getCallTimestamps(callerHash);
  timestamps.push(now);
  callTimestamps.set(callerHash, timestamps);
}

function pruneOldEntries(timestamps, cutoff) {
  return timestamps.filter(ts => ts > cutoff);
}

function countCallsInWindow(callerHash, windowMs) {
  const now = Date.now();
  const cutoff = now - windowMs;
  const timestamps = getCallTimestamps(callerHash);
  return timestamps.filter(ts => ts > cutoff).length;
}

function checkRateLimit(callerNumber) {
  const callerHash = hashCaller(callerNumber);

  // Prune old entries (older than 24 hours)
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const timestamps = getCallTimestamps(callerHash);
  const pruned = pruneOldEntries(timestamps, dayAgo);
  callTimestamps.set(callerHash, pruned);

  const hourMs = 60 * 60 * 1000;
  const dayMs = 24 * 60 * 60 * 1000;

  const callsThisHour = countCallsInWindow(callerHash, hourMs);
  const callsToday = countCallsInWindow(callerHash, dayMs);

  if (callsThisHour >= MAX_CALLS_PER_HOUR) {
    return { allowed: false, reason: 'hourly limit exceeded' };
  }
  if (callsToday >= MAX_CALLS_PER_DAY) {
    return { allowed: false, reason: 'daily limit exceeded' };
  }

  // Record this call
  recordCall(callerHash);

  return { allowed: true };
}

function isBlocked(callerNumber) {
  if (!callerNumber) return false;

  try {
    if (!fs.existsSync(BLOCK_LIST_PATH)) return false;
    const contents = fs.readFileSync(BLOCK_LIST_PATH, 'utf8');
    const numbers = contents
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'));
    return numbers.includes(callerNumber);
  } catch (err) {
    log.error('Failed to read block list:', err.message);
    return false;
  }
}

function checkMonitoringAlerts() {
  const now = Date.now();
  const hourAgo = now - 60 * 60 * 1000;
  const alerts = [];

  // Count all calls in the last hour
  let totalHourlyCalls = 0;
  for (const [callerHash, timestamps] of callTimestamps.entries()) {
    const recentCalls = timestamps.filter(ts => ts > hourAgo).length;
    totalHourlyCalls += recentCalls;

    if (recentCalls >= SINGLE_CALLER_HOURLY_ALERT_THRESHOLD) {
      alerts.push({
        type: 'single-caller-spike',
        callerHash,
        count: recentCalls,
        message: `Caller ${callerHash.slice(0, 8)}... made ${recentCalls} calls in the last hour`,
      });
    }
  }

  if (totalHourlyCalls >= GLOBAL_HOURLY_ALERT_THRESHOLD) {
    alerts.push({
      type: 'global-spike',
      count: totalHourlyCalls,
      message: `${totalHourlyCalls} total calls in the last hour`,
    });
  }

  for (const alert of alerts) {
    log.error(`[ALERT] ${alert.message}`);
  }

  return alerts;
}

function resetRateLimiter() {
  callTimestamps.clear();
}

module.exports = {
  checkRateLimit,
  isBlocked,
  checkMonitoringAlerts,
  resetRateLimiter,
  MAX_CALLS_PER_HOUR,
  MAX_CALLS_PER_DAY,
  BLOCK_LIST_PATH,
  GLOBAL_HOURLY_ALERT_THRESHOLD,
  SINGLE_CALLER_HOURLY_ALERT_THRESHOLD,
};
