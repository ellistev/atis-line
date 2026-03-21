const { describe, it, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { app, AIRPORTS } = require('../server');
const { updateCache, resetCache } = require('../src/audio/cache-manager');
const { clearCallLog, getCallLog } = require('../src/call-logger');

// Helper to make a POST request to the Express app
function postRequest(path, body = {}) {
  return new Promise((resolve, reject) => {
    const urlencoded = new URLSearchParams(body).toString();
    const { request } = require('node:http');
    const addr = server.address();
    const req = request(
      {
        hostname: '127.0.0.1',
        port: addr.port,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(urlencoded),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      }
    );
    req.on('error', reject);
    req.write(urlencoded);
    req.end();
  });
}

let server;

describe('server', () => {
  // Use a random port for tests
  beforeEach((_, done) => {
    resetCache();
    clearCallLog();
    if (!server || !server.listening) {
      server = app.listen(0, done);
    } else {
      done();
    }
  });

  after((_, done) => {
    if (server && server.listening) {
      server.close(done);
    } else {
      done();
    }
  });

  describe('AIRPORTS config', () => {
    it('has 5 airports mapped to digits 1-5', () => {
      assert.equal(Object.keys(AIRPORTS).length, 5);
      for (let i = 1; i <= 5; i++) {
        assert.ok(AIRPORTS[String(i)]);
        assert.ok(AIRPORTS[String(i)].icao);
        assert.ok(AIRPORTS[String(i)].name);
      }
    });

    it('includes expected ICAO codes', () => {
      const icaos = Object.values(AIRPORTS).map((a) => a.icao);
      assert.ok(icaos.includes('CYVR'));
      assert.ok(icaos.includes('CZBB'));
      assert.ok(icaos.includes('CYPK'));
    });
  });

  describe('POST /voice - greeting', () => {
    it('returns valid TwiML with Gather', async () => {
      const res = await postRequest('/voice', { From: '+16045551234', CallSid: 'CA100' });
      assert.equal(res.status, 200);
      assert.ok(res.body.includes('<Response>'));
      assert.ok(res.body.includes('<Gather'));
      assert.ok(res.body.includes('numDigits="1"'));
      assert.ok(res.body.includes('/select-airport'));
    });

    it('includes all airport options in greeting', async () => {
      const res = await postRequest('/voice', {});
      assert.ok(res.body.includes('Pitt Meadows'));
      assert.ok(res.body.includes('Boundary Bay'));
      assert.ok(res.body.includes('Vancouver Harbour'));
      assert.ok(res.body.includes('Langley'));
      assert.ok(res.body.includes('Vancouver International'));
    });

    it('includes disclaimer', async () => {
      const res = await postRequest('/voice', {});
      assert.ok(res.body.includes('unofficial'));
      assert.ok(res.body.includes('not affiliated with NAV CANADA'));
    });

    it('redirects to /voice on no input', async () => {
      const res = await postRequest('/voice', {});
      assert.ok(res.body.includes('<Redirect>/voice</Redirect>'));
    });

    it('logs the incoming call', async () => {
      await postRequest('/voice', { From: '+16045551234', CallSid: 'CA200' });
      const log = getCallLog();
      assert.ok(log.length >= 1);
      assert.equal(log[0].callerNumber, '+16045551234');
      assert.equal(log[0].callSid, 'CA200');
    });
  });

  describe('POST /select-airport - airport selection', () => {
    it('returns ATIS when data is cached', async () => {
      await updateCache('CYPK', 'Pitt Meadows information Alpha. Wind calm.', 'Alpha');
      const res = await postRequest('/select-airport', { Digits: '1', From: '+16045551234', CallSid: 'CA300' });
      assert.equal(res.status, 200);
      assert.ok(res.body.includes('Pitt Meadows information Alpha'));
    });

    it('says unavailable when no cache exists', async () => {
      const res = await postRequest('/select-airport', { Digits: '1', From: '+16045551234', CallSid: 'CA301' });
      assert.ok(res.body.includes('unavailable'));
      assert.ok(res.body.includes('<Redirect>/voice</Redirect>'));
    });

    it('handles invalid digit input', async () => {
      const res = await postRequest('/select-airport', { Digits: '9', From: '+16045551234', CallSid: 'CA302' });
      assert.ok(res.body.includes('Invalid selection'));
      assert.ok(res.body.includes('<Redirect>/voice</Redirect>'));
    });

    it('offers to hear another airport after ATIS', async () => {
      await updateCache('CZBB', 'Boundary Bay information Bravo.', 'Bravo');
      const res = await postRequest('/select-airport', { Digits: '2', From: '+16045551234', CallSid: 'CA303' });
      assert.ok(res.body.includes('another'));
      assert.ok(res.body.includes('<Gather'));
    });

    it('includes goodbye and hangup', async () => {
      await updateCache('CYVR', 'Vancouver info Charlie.', 'Charlie');
      const res = await postRequest('/select-airport', { Digits: '5', From: '+16045551234', CallSid: 'CA304' });
      assert.ok(res.body.includes('Goodbye'));
      assert.ok(res.body.includes('<Hangup'));
    });

    it('logs airport selection', async () => {
      await updateCache('CYPK', 'Pitt Meadows info.', 'Alpha');
      await postRequest('/select-airport', { Digits: '1', From: '+16045559999', CallSid: 'CA305' });
      const log = getCallLog();
      const airportLog = log.find((e) => e.airportIcao === 'CYPK');
      assert.ok(airportLog);
      assert.equal(airportLog.callerNumber, '+16045559999');
      assert.equal(airportLog.airportName, 'Pitt Meadows');
    });

    it('does not log airport for invalid selection', async () => {
      await postRequest('/select-airport', { Digits: '9', CallSid: 'CA306' });
      const log = getCallLog();
      const airportLogs = log.filter((e) => e.airportIcao !== null);
      assert.equal(airportLogs.length, 0);
    });
  });

  describe('stale data warning', () => {
    it('warns when cache is older than 15 minutes', async () => {
      await updateCache('CYPK', 'Pitt Meadows info Alpha.', 'Alpha');
      // Manually make the cache stale
      const { getCache } = require('../src/audio/cache-manager');
      const entry = getCache('CYPK');
      entry.updatedAt = Date.now() - 16 * 60 * 1000;

      const res = await postRequest('/select-airport', { Digits: '1', CallSid: 'CA400' });
      assert.ok(res.body.includes('outdated'));
    });

    it('does not warn when cache is fresh', async () => {
      await updateCache('CYPK', 'Pitt Meadows info Alpha.', 'Alpha');
      const res = await postRequest('/select-airport', { Digits: '1', CallSid: 'CA401' });
      assert.ok(!res.body.includes('outdated'));
    });
  });
});
