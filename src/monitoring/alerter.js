const ALERT_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes
const ALERT_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes between alerts per airport

// Per-airport tracking: { lastSuccessTime, consecutiveFailures, lastAlertTime, lastError }
const state = new Map();

function getState(icao) {
  if (!state.has(icao)) {
    state.set(icao, {
      lastSuccessTime: Date.now(),
      consecutiveFailures: 0,
      lastAlertTime: null,
      lastError: null,
    });
  }
  return state.get(icao);
}

function recordSuccess(icao) {
  const s = getState(icao);
  s.lastSuccessTime = Date.now();
  s.consecutiveFailures = 0;
  s.lastError = null;
  s.lastAlertTime = null; // clear alert state on recovery
}

function recordFailure(icao, error) {
  const s = getState(icao);
  s.consecutiveFailures++;
  s.lastError = error instanceof Error ? error.message : String(error || 'Unknown error');
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
    console.error(`[Telegram] Failed to send alert: ${err.message}`);
  }
}

async function checkAlerts() {
  const now = Date.now();
  for (const [icao, s] of state) {
    if (s.consecutiveFailures === 0) continue;

    const failingDuration = now - s.lastSuccessTime;
    if (failingDuration < ALERT_THRESHOLD_MS) continue;

    // Cooldown: don't re-alert within 30 minutes
    if (s.lastAlertTime && (now - s.lastAlertTime) < ALERT_COOLDOWN_MS) continue;

    const failingSince = new Date(s.lastSuccessTime).toISOString();
    const lastSuccess = new Date(s.lastSuccessTime).toISOString();
    const msg = `ATIS Alert: ${icao} scraper failing since ${failingSince}. Last success: ${lastSuccess}. Error: ${s.lastError || 'Unknown'}`;

    await sendTelegram(msg);
    s.lastAlertTime = now;
  }
}

// For testing
function _reset() {
  state.clear();
}

function _getState(icao) {
  return state.get(icao);
}

module.exports = {
  recordSuccess,
  recordFailure,
  checkAlerts,
  ALERT_THRESHOLD_MS,
  ALERT_COOLDOWN_MS,
  _reset,
  _getState,
};
