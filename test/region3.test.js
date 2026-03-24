const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { app, REGIONS, AIRPORTS_LIST } = require('../server');

describe('Region 3 - North Coast (METAR)', () => {
  let server;
  let baseUrl;

  function post(path, body = {}) {
    const data = new URLSearchParams(body).toString();
    return new Promise((resolve, reject) => {
      const req = http.request(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }, (res) => {
        let text = '';
        res.on('data', (chunk) => { text += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, text }));
      });
      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }

  before(() => {
    return new Promise((resolve) => {
      server = app.listen(0, () => {
        const { port } = server.address();
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(() => {
    return new Promise((resolve) => {
      server.close(resolve);
    });
  });

  describe('Airport configuration', () => {
    it('has Region 3 (North Coast) in regions', () => {
      assert.ok(REGIONS['3']);
      assert.equal(REGIONS['3'].region, 'North Coast');
    });

    it('has 5 North Coast airports', () => {
      assert.equal(REGIONS['3'].airports.length, 5);
    });

    it('contains all expected METAR airports', () => {
      const icaos = REGIONS['3'].airports.map(a => a.icao);
      assert.ok(icaos.includes('CYPR'));
      assert.ok(icaos.includes('CYXT'));
      assert.ok(icaos.includes('CZMT'));
      assert.ok(icaos.includes('CYZP'));
      assert.ok(icaos.includes('CBBC'));
    });

    it('all North Coast airports have source=metar', () => {
      for (const airport of REGIONS['3'].airports) {
        assert.equal(airport.source, 'metar');
      }
    });

    it('has 18 total airports', () => {
      assert.equal(AIRPORTS_LIST.length, 18);
    });

    it('existing airports have source=aeroview', () => {
      const aeroviewAirports = AIRPORTS_LIST.filter(a => (a.source || 'aeroview') === 'aeroview');
      assert.equal(aeroviewAirports.length, 9);
    });
  });

  describe('IVR routing', () => {
    it('top menu includes North Coast weather', async () => {
      const res = await post('/voice');
      assert.ok(res.text.includes('North Coast weather'));
    });

    it('region 3 shows airport sub-menu', async () => {
      const res = await post('/select-region', { Digits: '3' });
      assert.ok(res.text.includes('Gather'));
      assert.ok(res.text.includes('/select-airport/3'));
    });

    it('region 3 greeting includes METAR disclaimer', async () => {
      const res = await post('/select-region', { Digits: '3' });
      assert.ok(res.text.includes('automated weather observations'));
      assert.ok(res.text.includes('informational purposes only'));
    });

    it('region 3 greeting includes airport names', async () => {
      const res = await post('/select-region', { Digits: '3' });
      assert.ok(res.text.includes('Prince Rupert'));
      assert.ok(res.text.includes('Terrace'));
    });

    it('region 3 airport selection works (unavailable data)', async () => {
      const res = await post('/select-airport/3', { Digits: '1' });
      assert.equal(res.status, 200);
      assert.ok(res.text.includes('Say') || res.text.includes('Play'));
    });
  });

  describe('Health check includes METAR airports', () => {
    it('health endpoint includes all 18 airports', async () => {
      const res = await new Promise((resolve, reject) => {
        http.get(`${baseUrl}/health`, (r) => {
          let text = '';
          r.on('data', (chunk) => { text += chunk; });
          r.on('end', () => resolve({ status: r.statusCode, text }));
        }).on('error', reject);
      });
      const body = JSON.parse(res.text);
      assert.equal(Object.keys(body.airports).length, 18);
      assert.ok(body.airports.CYPR);
      assert.ok(body.airports.CBBC);
    });
  });
});
