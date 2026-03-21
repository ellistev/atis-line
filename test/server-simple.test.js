const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { app, AIRPORTS, metarToSpeech, cache } = require('../server-simple');

function postRequest(server, path, body = {}) {
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

describe('server-simple', () => {
  let server;

  it('AIRPORTS has 5 entries mapped to digits 1-5', () => {
    assert.equal(Object.keys(AIRPORTS).length, 5);
    for (let i = 1; i <= 5; i++) {
      assert.ok(AIRPORTS[String(i)]);
      assert.ok(AIRPORTS[String(i)].icao);
      assert.ok(AIRPORTS[String(i)].name);
    }
  });

  describe('metarToSpeech', () => {
    it('returns null for null input', () => {
      assert.equal(metarToSpeech(null, 'Test'), null);
    });

    it('converts wind knots when standalone', () => {
      const result = metarToSpeech('WIND 10 KT GUST 20 KT', 'Test');
      assert.ok(result.includes('knots'));
    });

    it('converts visibility', () => {
      const result = metarToSpeech('P6SM', 'Test');
      assert.ok(result.includes('greater than 6 statute miles'));
    });

    it('converts cloud layers', () => {
      const result = metarToSpeech('FEW030', 'Test');
      assert.ok(result.includes('few clouds at 3000 feet'));
    });

    it('converts weather phenomena', () => {
      const result = metarToSpeech('OVC010 BR FG', 'Test');
      assert.ok(result.includes('mist'));
      assert.ok(result.includes('fog'));
    });

    it('converts remarks', () => {
      const result = metarToSpeech('RMK SLP', 'Test');
      assert.ok(result.includes('Remarks'));
    });

    it('prefixes with airport name', () => {
      const result = metarToSpeech('CLR', 'Pitt Meadows');
      assert.ok(result.startsWith('Pitt Meadows weather.'));
    });
  });

  describe('IVR endpoints', () => {
    it('POST /voice returns TwiML with Gather', async () => {
      server = await new Promise((resolve) => {
        const s = app.listen(0, () => resolve(s));
      });

      try {
        const res = await postRequest(server, '/voice', {});
        assert.equal(res.status, 200);
        assert.ok(res.body.includes('<Response>'));
        assert.ok(res.body.includes('<Gather'));
        assert.ok(res.body.includes('numDigits="1"'));
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    });

    it('POST /airport returns weather when cached', async () => {
      cache.set('CYPK', {
        raw: 'METAR',
        speech: 'Pitt Meadows weather. sky clear',
        time: new Date().toISOString(),
      });

      server = await new Promise((resolve) => {
        const s = app.listen(0, () => resolve(s));
      });

      try {
        const res = await postRequest(server, '/airport', { Digits: '1' });
        assert.equal(res.status, 200);
        assert.ok(res.body.includes('Pitt Meadows weather'));
      } finally {
        cache.clear();
        await new Promise((resolve) => server.close(resolve));
      }
    });

    it('POST /airport handles invalid digit', async () => {
      server = await new Promise((resolve) => {
        const s = app.listen(0, () => resolve(s));
      });

      try {
        const res = await postRequest(server, '/airport', { Digits: '9' });
        assert.ok(res.body.includes('Invalid selection'));
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    });

    it('POST /airport handles unavailable data', async () => {
      server = await new Promise((resolve) => {
        const s = app.listen(0, () => resolve(s));
      });

      try {
        const res = await postRequest(server, '/airport', { Digits: '1' });
        assert.ok(res.body.includes('unavailable'));
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    });
  });
});
