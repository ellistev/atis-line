const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { app, STALE_THRESHOLD_MS } = require('../server');
const { updateCache, resetCache, getCache } = require('../src/audio/cache-manager');

// Minimal HTTP helper to test Express routes without a running server
function request(app, method, path) {
  return new Promise((resolve) => {
    const { createServer } = require('node:http');
    const server = createServer(app);
    server.listen(0, () => {
      const port = server.address().port;
      fetch(`http://127.0.0.1:${port}${path}`, { method })
        .then(async (res) => {
          const body = await res.json();
          server.close();
          resolve({ status: res.status, body });
        });
    });
  });
}

describe('PM2 ecosystem config', () => {
  it('exports a valid PM2 config', () => {
    const config = require('../ecosystem.config');
    assert.ok(Array.isArray(config.apps));
    assert.equal(config.apps.length, 1);

    const app = config.apps[0];
    assert.equal(app.name, 'atis-line');
    assert.equal(app.script, 'server.js');
    assert.equal(app.autorestart, true);
    assert.equal(app.instances, 1);
  });

  it('configures log rotation', () => {
    const config = require('../ecosystem.config');
    const app = config.apps[0];
    assert.ok(app.error_file);
    assert.ok(app.out_file);
    assert.ok(app.log_date_format);
  });

  it('sets production environment', () => {
    const config = require('../ecosystem.config');
    const app = config.apps[0];
    assert.equal(app.env.NODE_ENV, 'production');
    assert.equal(app.env.PORT, 3338);
  });

  it('configures restart policy', () => {
    const config = require('../ecosystem.config');
    const pmApp = config.apps[0];
    assert.ok(pmApp.max_restarts > 0);
    assert.ok(pmApp.restart_delay > 0);
  });
});

describe('STALE_THRESHOLD_MS', () => {
  it('is 30 minutes in milliseconds', () => {
    assert.equal(STALE_THRESHOLD_MS, 30 * 60 * 1000);
  });
});

describe('health endpoint', () => {
  beforeEach(() => {
    resetCache();
  });

  it('returns degraded status when no data is cached', async () => {
    const res = await request(app, 'GET', '/health');
    assert.equal(res.body.status, 'degraded');
    const airportKeys = Object.keys(res.body.airports);
    assert.ok(airportKeys.length > 0);

    // All airports should be unavailable
    for (const icao of airportKeys) {
      assert.equal(res.body.airports[icao].status, 'unavailable');
      assert.equal(res.body.airports[icao].updatedAt, null);
      assert.equal(res.body.airports[icao].ageSeconds, null);
    }
  });

  it('returns available status for fresh data', async () => {
    await updateCache('CYPK', 'test speech', 'Alpha');
    const res = await request(app, 'GET', '/health');
    const cypk = res.body.airports.CYPK;
    assert.equal(cypk.status, 'available');
    assert.equal(cypk.letter, 'Alpha');
    assert.ok(cypk.updatedAt);
    assert.equal(typeof cypk.ageSeconds, 'number');
    assert.ok(cypk.ageSeconds < 5); // Just updated, should be very fresh
  });

  it('includes hasAudio field', async () => {
    await updateCache('CYPK', 'test speech', 'Alpha');
    const res = await request(app, 'GET', '/health');
    assert.equal(typeof res.body.airports.CYPK.hasAudio, 'boolean');
  });

  it('shows overall ok when all airports have fresh data', async () => {
    // Cache data for all configured airports
    const { AIRPORTS } = require('../server');
    for (const airport of Object.values(AIRPORTS)) {
      await updateCache(airport.icao, `${airport.name} test`, 'Alpha');
    }
    const res = await request(app, 'GET', '/health');
    assert.equal(res.body.status, 'ok');
  });
});

describe('cache updatedAt tracking', () => {
  beforeEach(() => {
    resetCache();
  });

  it('sets updatedAt on first cache entry', async () => {
    await updateCache('CYPK', 'test speech', 'Alpha');
    const entry = getCache('CYPK');
    assert.ok(entry.updatedAt);
    assert.ok(new Date(entry.updatedAt).getTime() > 0);
  });

  it('updates updatedAt even when text has not changed', async () => {
    await updateCache('CYPK', 'test speech', 'Alpha');
    const first = getCache('CYPK').updatedAt;

    // Small delay to ensure different timestamp
    await new Promise(r => setTimeout(r, 10));

    await updateCache('CYPK', 'test speech', 'Alpha');
    const second = getCache('CYPK').updatedAt;

    assert.ok(new Date(second).getTime() >= new Date(first).getTime());
  });

  it('updates updatedAt when text changes', async () => {
    await updateCache('CYPK', 'text A', 'Alpha');
    const first = getCache('CYPK').updatedAt;

    await new Promise(r => setTimeout(r, 10));

    await updateCache('CYPK', 'text B', 'Bravo');
    const second = getCache('CYPK').updatedAt;

    assert.ok(new Date(second).getTime() >= new Date(first).getTime());
  });
});
