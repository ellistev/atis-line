const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { renderLandingPage, getRegionData } = require('../src/landing/landing');
const { app } = require('../server');

// --- Unit tests for renderLandingPage ---

describe('landing/renderLandingPage', () => {
  const mockRegions = {
    '1': {
      region: 'Lower Mainland',
      airports: [
        { icao: 'CYVR', name: 'Vancouver International', digit: '1', source: 'aeroview' },
        { icao: 'CYXX', name: 'Abbotsford', digit: '2', source: 'aeroview' },
      ],
    },
    '2': {
      region: 'Victoria',
      airports: [
        { icao: 'CYYJ', name: 'Victoria International', digit: '1', source: 'aeroview' },
      ],
    },
    '3': {
      region: 'North Coast',
      airports: [
        { icao: 'CYPR', name: 'Prince Rupert', digit: '1', source: 'metar' },
      ],
    },
  };

  it('returns valid HTML with doctype', () => {
    const html = renderLandingPage(mockRegions);
    assert.ok(html.startsWith('<!DOCTYPE html>'));
    assert.ok(html.includes('</html>'));
  });

  it('includes the service name', () => {
    const html = renderLandingPage(mockRegions);
    assert.ok(html.includes('ATIS Line'));
  });

  it('includes the phone number', () => {
    const html = renderLandingPage(mockRegions);
    assert.ok(html.includes('+1 (778) 200-5935'));
  });

  it('includes the phone number as a tel: link', () => {
    const html = renderLandingPage(mockRegions);
    assert.ok(html.includes('tel:+17782005935'));
  });

  it('includes all region names', () => {
    const html = renderLandingPage(mockRegions);
    assert.ok(html.includes('Lower Mainland'));
    assert.ok(html.includes('Victoria'));
    assert.ok(html.includes('North Coast'));
  });

  it('includes all airport ICAO codes', () => {
    const html = renderLandingPage(mockRegions);
    assert.ok(html.includes('CYVR'));
    assert.ok(html.includes('CYXX'));
    assert.ok(html.includes('CYYJ'));
    assert.ok(html.includes('CYPR'));
  });

  it('includes all airport names', () => {
    const html = renderLandingPage(mockRegions);
    assert.ok(html.includes('Vancouver International'));
    assert.ok(html.includes('Abbotsford'));
    assert.ok(html.includes('Victoria International'));
    assert.ok(html.includes('Prince Rupert'));
  });

  it('shows D-ATIS label for aeroview airports', () => {
    const html = renderLandingPage(mockRegions);
    assert.ok(html.includes('D-ATIS'));
  });

  it('shows METAR label for metar airports', () => {
    const html = renderLandingPage(mockRegions);
    assert.ok(html.includes('METAR'));
  });

  it('includes how it works section', () => {
    const html = renderLandingPage(mockRegions);
    assert.ok(html.includes('How It Works'));
  });

  it('includes data sources info', () => {
    const html = renderLandingPage(mockRegions);
    assert.ok(html.includes('NAV CANADA'));
    assert.ok(html.includes('Aviation Weather'));
  });

  it('includes refresh frequency info', () => {
    const html = renderLandingPage(mockRegions);
    assert.ok(html.includes('15 minutes'));
  });

  it('includes expansion plans note', () => {
    const html = renderLandingPage(mockRegions);
    assert.ok(html.includes('Coming Soon'));
  });

  it('includes link to analytics dashboard', () => {
    const html = renderLandingPage(mockRegions);
    assert.ok(html.includes('/analytics'));
  });

  it('displays region and airport counts', () => {
    const html = renderLandingPage(mockRegions);
    // 3 regions, 4 airports
    assert.ok(html.includes('>3<'));
    assert.ok(html.includes('>4<'));
  });

  it('is responsive (has viewport meta tag)', () => {
    const html = renderLandingPage(mockRegions);
    assert.ok(html.includes('viewport'));
    assert.ok(html.includes('width=device-width'));
  });
});

// --- getRegionData reads from airports.json dynamically ---

describe('landing/getRegionData', () => {
  it('returns regions from airports.json', () => {
    const regions = getRegionData();
    assert.ok(typeof regions === 'object');
    // Should have at least one region
    assert.ok(Object.keys(regions).length > 0);
    // Each region has a name and airports array
    for (const [digit, r] of Object.entries(regions)) {
      assert.ok(r.region);
      assert.ok(Array.isArray(r.airports));
      assert.ok(r.airports.length > 0);
      for (const a of r.airports) {
        assert.ok(a.icao);
        assert.ok(a.name);
        assert.ok(a.digit);
      }
    }
  });
});

// --- HTTP integration tests ---

describe('GET / landing page', () => {
  let server, baseUrl;

  function get(path) {
    return new Promise((resolve, reject) => {
      http.get(`${baseUrl}${path}`, (res) => {
        let text = '';
        res.on('data', (chunk) => { text += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, text, headers: res.headers }));
      }).on('error', reject);
    });
  }

  before(() => {
    return new Promise((resolve) => {
      server = app.listen(0, () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    });
  });

  after(() => {
    return new Promise((resolve) => {
      server.close(resolve);
    });
  });

  it('returns 200', async () => {
    const res = await get('/');
    assert.equal(res.status, 200);
  });

  it('returns HTML content type', async () => {
    const res = await get('/');
    assert.ok(res.headers['content-type'].includes('text/html'));
  });

  it('contains ATIS Line title', async () => {
    const res = await get('/');
    assert.ok(res.text.includes('ATIS Line'));
  });

  it('contains the phone number', async () => {
    const res = await get('/');
    assert.ok(res.text.includes('+1 (778) 200-5935'));
  });

  it('contains airports from airports.json', async () => {
    const res = await get('/');
    assert.ok(res.text.includes('CYVR'));
    assert.ok(res.text.includes('Vancouver International'));
  });

  it('contains link to analytics', async () => {
    const res = await get('/');
    assert.ok(res.text.includes('/analytics'));
  });
});
