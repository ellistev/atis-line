const { describe, it, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const {
  recordSuccess,
  recordFailure,
  checkAlerts,
  ALERT_THRESHOLD_MS,
  _reset,
  _getState,
} = require('../src/monitoring/alerter');

describe('alerter', () => {
  let fetchMock;

  beforeEach(() => {
    _reset();
    process.env.TELEGRAM_BOT_TOKEN = 'test-token';
    process.env.TELEGRAM_CHAT_ID = '12345';
    fetchMock = mock.fn(() => Promise.resolve({ ok: true }));
    globalThis.fetch = fetchMock;
  });

  afterEach(() => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
    mock.restoreAll();
  });

  it('fires alert after 30min threshold', async () => {
    recordFailure('CYVR', 'timeout');
    // Backdate lastSuccessTime to 31 minutes ago
    const s = _getState('CYVR');
    s.lastSuccessTime = Date.now() - ALERT_THRESHOLD_MS - 60_000;

    await checkAlerts();

    assert.equal(fetchMock.mock.calls.length, 1);
    const [url, opts] = fetchMock.mock.calls[0].arguments;
    assert.ok(url.includes('test-token'));
    const body = JSON.parse(opts.body);
    assert.equal(body.chat_id, '12345');
    assert.ok(body.text.includes('CYVR'));
    assert.ok(body.text.includes('timeout'));
  });

  it('does not alert before 30min threshold', async () => {
    recordFailure('CYVR', 'timeout');
    // lastSuccessTime is still recent (just initialized)
    await checkAlerts();
    assert.equal(fetchMock.mock.calls.length, 0);
  });

  it('does not send duplicate alerts within cooldown window', async () => {
    recordFailure('CYVR', 'timeout');
    const s = _getState('CYVR');
    s.lastSuccessTime = Date.now() - ALERT_THRESHOLD_MS - 60_000;

    await checkAlerts();
    assert.equal(fetchMock.mock.calls.length, 1);

    // Second check within cooldown - should not alert again
    await checkAlerts();
    assert.equal(fetchMock.mock.calls.length, 1);
  });

  it('clears alert state after success', async () => {
    recordFailure('CYVR', 'timeout');
    const s = _getState('CYVR');
    s.lastSuccessTime = Date.now() - ALERT_THRESHOLD_MS - 60_000;

    await checkAlerts();
    assert.equal(fetchMock.mock.calls.length, 1);

    // Airport recovers
    recordSuccess('CYVR');
    const updated = _getState('CYVR');
    assert.equal(updated.consecutiveFailures, 0);
    assert.equal(updated.lastAlertTime, null);

    // Should not alert after recovery
    await checkAlerts();
    assert.equal(fetchMock.mock.calls.length, 1);
  });

  it('tracks consecutive failures', () => {
    recordFailure('CYVR', 'err1');
    recordFailure('CYVR', 'err2');
    recordFailure('CYVR', 'err3');
    assert.equal(_getState('CYVR').consecutiveFailures, 3);
    assert.equal(_getState('CYVR').lastError, 'err3');
  });

  it('skips sending when env vars are missing', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;

    recordFailure('CYVR', 'timeout');
    const s = _getState('CYVR');
    s.lastSuccessTime = Date.now() - ALERT_THRESHOLD_MS - 60_000;

    await checkAlerts();
    assert.equal(fetchMock.mock.calls.length, 0);
  });
});
