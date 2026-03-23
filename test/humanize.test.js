const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const modulePath = path.resolve(__dirname, '../src/speech/humanize.js');

function loadWithoutApiKey() {
  const saved = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete require.cache[modulePath];
  const mod = require(modulePath);
  if (saved !== undefined) process.env.OPENAI_API_KEY = saved;
  return mod;
}

describe('humanizeAtis', () => {
  describe('basicCleanup fallback (no API key)', () => {
    it('returns a non-empty string', async () => {
      const { humanizeAtis } = loadWithoutApiKey();
      const result = await humanizeAtis(
        'CYPR 221800Z 31008KT 15SM FEW040 BKN100 12/08 A2992 RMK CU2SC4',
        'Prince Rupert'
      );
      assert.ok(typeof result === 'string');
      assert.ok(result.length > 0);
    });

    it('expands standalone KT to knots', async () => {
      const { humanizeAtis } = loadWithoutApiKey();
      const result = await humanizeAtis('CYPR 221800Z wind 8 KT VIS 15SM', 'Prince Rupert');
      assert.ok(result.includes('knots'));
    });

    it('expands standalone SM to statute miles', async () => {
      const { humanizeAtis } = loadWithoutApiKey();
      const result = await humanizeAtis('CYPR 221800Z VIS 15 SM', 'Prince Rupert');
      assert.ok(result.includes('statute miles'));
    });

    it('expands cloud layers', async () => {
      const { humanizeAtis } = loadWithoutApiKey();
      const result = await humanizeAtis('CYPR 221800Z BKN020 OVC050 SCT100 FEW010', 'Prince Rupert');
      assert.ok(result.includes('broken ceiling at 2000 feet'));
      assert.ok(result.includes('overcast ceiling at 5000 feet'));
      assert.ok(result.includes('scattered at 10000 feet'));
      assert.ok(result.includes('few clouds at 1000 feet'));
    });

    it('expands altimeter', async () => {
      const { humanizeAtis } = loadWithoutApiKey();
      const result = await humanizeAtis('CYPR 221800Z A2992', 'Prince Rupert');
      assert.ok(result.includes('altimeter 29 point 92'));
    });

    it('strips runway table', async () => {
      const { humanizeAtis } = loadWithoutApiKey();
      const result = await humanizeAtis(
        'CYPR 221800Z 31008KT\nRunway 13/31 in use',
        'Prince Rupert'
      );
      assert.ok(!result.includes('Runway'));
    });

    it('handles metar source option', async () => {
      const { humanizeAtis } = loadWithoutApiKey();
      const result = await humanizeAtis(
        'CYPR 221800Z 31008KT 15SM',
        'Prince Rupert',
        { source: 'metar' }
      );
      assert.ok(typeof result === 'string');
      assert.ok(result.length > 0);
    });
  });
});
