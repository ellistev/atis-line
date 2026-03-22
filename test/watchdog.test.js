const { describe, it, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const {
  checkHealth,
  MAX_CONSECUTIVE_FAILURES,
  ALL_UNAVAIL_THRESHOLD_MS,
  _reset,
  _getState,
  _setAllUnavailableSince,
} = require('../src/monitoring/watchdog');

describe('watchdog', () => {
  let fetchMock;
  let execMock;

  beforeEach(() => {
    _reset();
    process.env.PORT = '3338';
    process.env.TELEGRAM_BOT_TOKEN = 'test-token';
    process.env.TELEGRAM_CHAT_ID = '12345';
  });

  afterEach(() => {
    delete process.env.PORT;
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
    mock.restoreAll();
  });

  function mockFetch(response) {
    fetchMock = mock.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve(response),
    }));
    globalThis.fetch = fetchMock;
  }

  function mockFetchFail(err) {
    fetchMock = mock.fn(() => Promise.reject(err || new Error('ECONNREFUSED')));
    globalThis.fetch = fetchMock;
  }

  it('resets failure counter on successful health check', async () => {
    mockFetch({
      status: 'ok',
      airports: { CYVR: { status: 'available' }, CYYJ: { status: 'available' } },
    });

    await checkHealth();
    assert.equal(_getState().consecutiveFailures, 0);
  });

  it('increments failure counter on fetch error', async () => {
    mockFetchFail();

    await checkHealth();
    assert.equal(_getState().consecutiveFailures, 1);
  });

  it('triggers restart after consecutive failures', async () => {
    mockFetchFail();

    // First failure
    await checkHealth();
    assert.equal(_getState().consecutiveFailures, 1);

    // Second failure triggers restart + telegram
    await checkHealth();
    // After restart, counter resets
    assert.equal(_getState().consecutiveFailures, 0);

    // fetch called: 2 health checks + 1 telegram alert = 3 total
    assert.equal(fetchMock.mock.calls.length, 3);
    // Telegram call is the 3rd
    const telegramCall = fetchMock.mock.calls[2].arguments;
    assert.ok(telegramCall[0].includes('test-token'));
    const body = JSON.parse(telegramCall[1].body);
    assert.ok(body.text.includes('unreachable'));
  });

  it('tracks all-airports-unavailable timer', async () => {
    mockFetch({
      status: 'degraded',
      airports: { CYVR: { status: 'unavailable' }, CYYJ: { status: 'unavailable' } },
    });

    await checkHealth();
    const state = _getState();
    assert.ok(state.allUnavailableSince !== null, 'should set allUnavailableSince');
  });

  it('clears all-unavailable timer when airports recover', async () => {
    // First check: all unavailable
    mockFetch({
      status: 'degraded',
      airports: { CYVR: { status: 'unavailable' } },
    });
    await checkHealth();
    assert.ok(_getState().allUnavailableSince !== null);

    // Second check: one available
    mockFetch({
      status: 'ok',
      airports: { CYVR: { status: 'available' } },
    });
    await checkHealth();
    assert.equal(_getState().allUnavailableSince, null);
  });

  it('force restarts after all-unavailable exceeds threshold', async () => {
    mockFetch({
      status: 'degraded',
      airports: { CYVR: { status: 'unavailable' }, CYYJ: { status: 'unavailable' } },
    });

    await checkHealth();

    // Backdate the allUnavailableSince to exceed threshold
    _setAllUnavailableSince(Date.now() - ALL_UNAVAIL_THRESHOLD_MS - 1000);

    // Need a fresh mock that is still all unavailable
    mockFetch({
      status: 'degraded',
      airports: { CYVR: { status: 'unavailable' }, CYYJ: { status: 'unavailable' } },
    });

    await checkHealth();

    // Should have sent telegram alert
    assert.ok(fetchMock.mock.calls.length >= 2); // health check + telegram
    // allUnavailableSince should be reset after restart
    assert.equal(_getState().allUnavailableSince, null);
  });

  it('does not restart if only some airports unavailable', async () => {
    mockFetch({
      status: 'degraded',
      airports: { CYVR: { status: 'unavailable' }, CYYJ: { status: 'available' } },
    });

    await checkHealth();
    assert.equal(_getState().allUnavailableSince, null);
  });

  it('skips telegram when env vars missing', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
    mockFetchFail();

    await checkHealth();
    await checkHealth(); // triggers restart
    // Only 2 calls (the failed health checks), no telegram
    assert.equal(fetchMock.mock.calls.length, 2);
  });

  it('handles empty airports object gracefully', async () => {
    mockFetch({ status: 'ok', airports: {} });
    await checkHealth();
    assert.equal(_getState().allUnavailableSince, null);
    assert.equal(_getState().consecutiveFailures, 0);
  });
});
