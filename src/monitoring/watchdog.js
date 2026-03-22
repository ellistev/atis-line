const { exec } = require('node:child_process');

const CHECK_INTERVAL_MS = 5 * 60 * 1000;     // 5 minutes
const ALL_UNAVAIL_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes all-unavailable before force restart
const MAX_CONSECUTIVE_FAILURES = 2;

let consecutiveFailures = 0;
let allUnavailableSince = null;
let _timer = null;

function getHealthUrl() {
  const port = process.env.PORT || 3338;
  return `http://localhost:${port}/health`;
}

async function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  } catch (err) {
    console.error(`[Watchdog] Telegram alert failed: ${err.message}`);
  }
}

function restartPm2() {
  return new Promise((resolve) => {
    exec('pm2 restart atis-line', (err, stdout, stderr) => {
      if (err) {
        console.error(`[Watchdog] pm2 restart failed: ${err.message}`);
      } else {
        console.log(`[Watchdog] pm2 restart triggered: ${stdout.trim()}`);
      }
      resolve();
    });
  });
}

async function checkHealth() {
  const url = getHealthUrl();
  let response;

  try {
    response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  } catch (err) {
    consecutiveFailures++;
    console.warn(`[Watchdog] Health check failed (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}): ${err.message}`);

    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      const msg = `🚨 ATIS Watchdog: Health endpoint unreachable (${consecutiveFailures} consecutive failures). Restarting...`;
      console.error(`[Watchdog] ${msg}`);
      await sendTelegram(msg);
      await restartPm2();
      consecutiveFailures = 0;
    }
    return;
  }

  // Health endpoint responded — reset failure counter
  consecutiveFailures = 0;

  // Check for all-airports-unavailable condition
  try {
    const data = await response.json();
    const airports = Object.values(data.airports || {});
    const allUnavailable = airports.length > 0 && airports.every(a => a.status === 'unavailable');

    if (allUnavailable) {
      const now = Date.now();
      if (!allUnavailableSince) {
        allUnavailableSince = now;
        console.warn('[Watchdog] All airports unavailable — starting timer');
      } else if (now - allUnavailableSince >= ALL_UNAVAIL_THRESHOLD_MS) {
        const msg = `🚨 ATIS Watchdog: ALL airports unavailable for ${Math.floor((now - allUnavailableSince) / 60_000)} minutes. Force restarting...`;
        console.error(`[Watchdog] ${msg}`);
        await sendTelegram(msg);
        await restartPm2();
        allUnavailableSince = null;
      }
    } else {
      allUnavailableSince = null;
    }
  } catch (err) {
    console.warn(`[Watchdog] Failed to parse health response: ${err.message}`);
  }
}

function startWatchdog() {
  console.log('[Watchdog] Starting health monitor (every 5 min)');
  _timer = setInterval(checkHealth, CHECK_INTERVAL_MS);
  // Run first check after a delay to let server finish starting
  setTimeout(checkHealth, 30_000);
}

function stopWatchdog() {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}

// For testing
function _reset() {
  consecutiveFailures = 0;
  allUnavailableSince = null;
  stopWatchdog();
}

function _getState() {
  return { consecutiveFailures, allUnavailableSince };
}

function _setAllUnavailableSince(value) {
  allUnavailableSince = value;
}

module.exports = {
  startWatchdog,
  stopWatchdog,
  checkHealth,
  CHECK_INTERVAL_MS,
  ALL_UNAVAIL_THRESHOLD_MS,
  MAX_CONSECUTIVE_FAILURES,
  _reset,
  _getState,
  _setAllUnavailableSince,
};
