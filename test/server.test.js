const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { app, refreshService, formatMetarForSpeech, AIRPORTS } = require('../server');

// Minimal supertest-like helper using native http
const http = require('node:http');

function request(app) {
  const server = app.listen(0);
  const { port } = server.address();

  function makeRequest(method, path, { body, contentType } = {}) {
    return new Promise((resolve, reject) => {
      const payload = body ? (typeof body === 'string' ? body : new URLSearchParams(body).toString()) : null;
      const req = http.request({
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: {
          ...(contentType ? { 'Content-Type': contentType } : {}),
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          resolve({ status: res.statusCode, headers: res.headers, body: data });
        });
      });
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  }

  return {
    get: (path) => makeRequest('GET', path).finally(() => server.close()),
    post: (path, opts) => makeRequest('POST', path, {
      body: opts?.body,
      contentType: 'application/x-www-form-urlencoded',
    }).finally(() => server.close()),
  };
}

describe('Server', () => {
  describe('AIRPORTS config', () => {
    it('has 5 airports configured', () => {
      assert.equal(Object.keys(AIRPORTS).length, 5);
    });

    it('maps digit keys to ICAO codes', () => {
      assert.equal(AIRPORTS['1'].icao, 'CYPK');
      assert.equal(AIRPORTS['5'].icao, 'CYVR');
    });
  });

  describe('GET /health', () => {
    it('returns ok status', async () => {
      const res = await request(app).get('/health');
      assert.equal(res.status, 200);
      const json = JSON.parse(res.body);
      assert.equal(json.status, 'ok');
      assert.ok(json.airports);
    });
  });

  describe('POST /voice', () => {
    it('returns TwiML with gather and airport menu', async () => {
      const res = await request(app).post('/voice');
      assert.equal(res.status, 200);
      assert.ok(res.headers['content-type'].includes('text/xml'));
      assert.ok(res.body.includes('<Gather'));
      assert.ok(res.body.includes('Pitt Meadows'));
      assert.ok(res.body.includes('Vancouver International'));
    });
  });

  describe('POST /select-airport', () => {
    it('redirects on invalid digit', async () => {
      const res = await request(app).post('/select-airport', { body: { Digits: '9' } });
      assert.equal(res.status, 200);
      assert.ok(res.body.includes('Invalid selection'));
      assert.ok(res.body.includes('<Redirect'));
    });

    it('shows unavailable when cache is empty', async () => {
      const res = await request(app).post('/select-airport', { body: { Digits: '1' } });
      assert.equal(res.status, 200);
      assert.ok(res.body.includes('unavailable'));
    });
  });

  describe('formatMetarForSpeech', () => {
    it('expands abbreviations in a full METAR string', () => {
      const speech = formatMetarForSpeech(
        'METAR CYVR 210300Z 24008KT 15SM FEW040 09/04 A3010'
      );
      assert.ok(speech.includes('few clouds at'));
      assert.ok(speech.includes('altimeter'));
    });

    it('expands visibility abbreviations', () => {
      assert.ok(formatMetarForSpeech('vis P6SM clouds').includes('greater than 6 statute miles'));
    });

    it('expands cloud abbreviations', () => {
      const speech = formatMetarForSpeech('FEW040 SCT080 BKN120 OVC200');
      assert.ok(speech.includes('few clouds at'));
      assert.ok(speech.includes('scattered clouds at'));
      assert.ok(speech.includes('broken clouds at'));
      assert.ok(speech.includes('overcast at'));
    });

    it('expands weather phenomena', () => {
      assert.ok(formatMetarForSpeech('vis BR fog').includes('mist'));
      assert.ok(formatMetarForSpeech('vis FG end').includes('fog'));
    });

    it('expands CAVOK and NOSIG', () => {
      assert.ok(formatMetarForSpeech('CAVOK').includes('ceiling and visibility okay'));
      assert.ok(formatMetarForSpeech('NOSIG').includes('no significant change'));
    });

    it('returns null for falsy input', () => {
      assert.equal(formatMetarForSpeech(null), null);
      assert.equal(formatMetarForSpeech(''), null);
    });
  });
});
