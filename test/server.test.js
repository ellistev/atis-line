const { describe, it, before, after, mock } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { app, REGIONS, formatForSpeech } = require('../server');

// --- formatForSpeech unit tests ---

describe('formatForSpeech', () => {
  it('returns null for null raw', () => {
    assert.equal(formatForSpeech(null, 'CXXX', 'Test', 'A'), null);
  });

  it('expands cloud abbreviations', () => {
    const speech = formatForSpeech(
      'CYPK 181953Z 27015KT P6SM FEW040 BKN100',
      'CYPK', 'Pitt Meadows', 'A',
    );
    assert.ok(speech.includes('few clouds at'));
    assert.ok(speech.includes('ceiling broken at'));
  });

  it('expands P6SM', () => {
    const speech = formatForSpeech(
      'CYPK 181953Z 27015KT P6SM CLR',
      'CYPK', 'Test', 'A',
    );
    assert.ok(speech.includes('greater than 6 statute miles'));
  });

  it('expands sky clear', () => {
    const speech = formatForSpeech(
      'CYPK 181953Z 27015KT P6SM CLR',
      'CYPK', 'Test', 'A',
    );
    assert.ok(speech.includes('sky clear'));
  });

  it('expands CAVOK', () => {
    const speech = formatForSpeech(
      'CYPK 181953Z 27015KT CAVOK',
      'CYPK', 'Test', 'A',
    );
    assert.ok(speech.includes('ceiling and visibility okay'));
  });

  it('strips remarks', () => {
    const speech = formatForSpeech(
      'CYPK 181953Z 27015KT P6SM CLR RMK CU2',
      'CYPK', 'Test', 'A',
    );
    assert.ok(!speech.includes('RMK'));
    assert.ok(!speech.includes('CU2'));
  });

  it('adds advise on contact when letter is provided', () => {
    const speech = formatForSpeech(
      'CYPK 181953Z 27015KT P6SM CLR',
      'CYPK', 'Test', 'B',
    );
    assert.ok(speech.includes('Advise on initial contact you have information B'));
  });

  it('does not duplicate advise on contact if already present', () => {
    const speech = formatForSpeech(
      'CYPK 181953Z 27015KT P6SM CLR Advise on initial contact',
      'CYPK', 'Test', 'B',
    );
    const matches = speech.match(/advise on initial contact/gi);
    assert.equal(matches.length, 1);
  });

  it('expands VRB when standalone', () => {
    const speech = formatForSpeech(
      'CYPK 181953Z VRB 05KT P6SM CLR',
      'CYPK', 'Test', 'A',
    );
    assert.ok(speech.includes('variable'));
  });
});

// --- Route tests ---

describe('IVR routes', () => {
  let server;
  let baseUrl;

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

  describe('/voice (top-level menu)', () => {
    it('returns TwiML with Gather for region selection', async () => {
      const res = await post('/voice');
      assert.equal(res.status, 200);
      assert.ok(res.text.includes('Gather'));
      assert.ok(res.text.includes('/select-region'));
    });

    it('includes region names in greeting', async () => {
      const res = await post('/voice');
      assert.ok(res.text.includes('Lower Mainland'));
    });
  });

  describe('/select-region', () => {
    it('redirects to /voice when no digit pressed', async () => {
      const res = await post('/select-region', {});
      assert.ok(res.text.includes('/voice'));
    });

    it('shows region sub-menu for valid region digit', async () => {
      const res = await post('/select-region', { Digits: '1' });
      assert.ok(res.text.includes('Gather'));
      assert.ok(res.text.includes('/select-airport/1'));
    });

    it('says invalid selection for unknown region digit', async () => {
      const res = await post('/select-region', { Digits: '7' });
      assert.ok(res.text.includes('Invalid selection'));
      assert.ok(res.text.includes('/voice'));
    });

    it('returns joke for digit 9', async () => {
      const res = await post('/select-region', { Digits: '9' });
      // Should say something and redirect to /voice
      assert.ok(res.text.includes('/voice'));
      assert.ok(res.text.includes('Say'));
    });

    it('returns about text for digit 0', async () => {
      const res = await post('/select-region', { Digits: '0' });
      assert.ok(res.text.includes('/voice'));
      assert.ok(res.text.includes('Say'));
    });

    it('# key redirects back to top-level menu', async () => {
      const res = await post('/select-region', { Digits: '#' });
      assert.ok(res.text.includes('/voice'));
      assert.ok(res.text.includes('Redirect'));
    });
  });

  describe('/select-airport/:regionDigit', () => {
    it('redirects to region menu when # pressed', async () => {
      const res = await post('/select-airport/1', { Digits: '#' });
      assert.ok(res.text.includes('/region-menu/1'));
    });

    it('redirects to region menu when no digit pressed', async () => {
      const res = await post('/select-airport/1', {});
      assert.ok(res.text.includes('/region-menu/1'));
    });

    it('says invalid selection for unknown airport digit', async () => {
      const res = await post('/select-airport/1', { Digits: '8' });
      assert.ok(res.text.includes('Invalid selection'));
      assert.ok(res.text.includes('/region-menu/1'));
    });

    it('redirects to /voice for invalid regionDigit', async () => {
      const res = await post('/select-airport/9', { Digits: '1' });
      assert.ok(res.text.includes('/voice'));
    });

    it('handles valid airport selection (unavailable data)', async () => {
      const res = await post('/select-airport/1', { Digits: '1' });
      assert.equal(res.status, 200);
      // Should contain either ATIS data or unavailable message
      assert.ok(res.text.includes('Say') || res.text.includes('Play'));
    });
  });

  describe('/region-menu/:regionDigit', () => {
    it('shows region greeting with Gather', async () => {
      const res = await post('/region-menu/1');
      assert.ok(res.text.includes('Gather'));
      assert.ok(res.text.includes('/select-airport/1'));
    });

    it('redirects to /voice for invalid region', async () => {
      const res = await post('/region-menu/9');
      assert.ok(res.text.includes('/voice'));
    });
  });

  describe('# key back navigation', () => {
    it('# from region selection goes back to top menu', async () => {
      const res = await post('/select-region', { Digits: '#' });
      assert.ok(res.text.includes('Redirect'));
      assert.ok(res.text.includes('/voice'));
    });

    it('# from airport selection goes back to region menu', async () => {
      const res = await post('/select-airport/2', { Digits: '#' });
      assert.ok(res.text.includes('Redirect'));
      assert.ok(res.text.includes('/region-menu/2'));
    });
  });

  describe('/health', () => {
    it('returns JSON health status', async () => {
      const res = await new Promise((resolve, reject) => {
        http.get(`${baseUrl}/health`, (r) => {
          let text = '';
          r.on('data', (chunk) => { text += chunk; });
          r.on('end', () => resolve({ status: r.statusCode, text }));
        }).on('error', reject);
      });
      assert.equal(res.status, 200);
      const body = JSON.parse(res.text);
      assert.ok(body.status);
      assert.ok(body.airports);
    });
  });
});
