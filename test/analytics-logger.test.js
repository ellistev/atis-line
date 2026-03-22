const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { logCall, hashCaller, ANALYTICS_PATH } = require('../src/analytics/logger');

function cleanup() {
  try { fs.unlinkSync(ANALYTICS_PATH); } catch {}
}

describe('analytics/logger', () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  describe('hashCaller', () => {
    it('returns truncated SHA256 hex for a phone number', () => {
      const hash = hashCaller('+16045551234');
      assert.equal(hash.length, 12);
      assert.match(hash, /^[a-f0-9]{12}$/);
    });

    it('returns anonymous for missing number', () => {
      assert.equal(hashCaller(null), 'anonymous');
      assert.equal(hashCaller(undefined), 'anonymous');
    });
  });

  describe('logCall', () => {
    it('writes a JSONL entry with all fields', () => {
      const entry = logCall({
        region: '1',
        airport: 'CYVR',
        duration: 45,
        callerNumber: '+16045551234',
        callSid: 'CA123abc',
      });

      assert.equal(entry.region, 1);
      assert.equal(entry.airport, 'CYVR');
      assert.equal(entry.duration, 45);
      assert.equal(entry.sid, 'CA123abc');
      assert.equal(entry.caller, hashCaller('+16045551234'));
      assert.ok(entry.timestamp);

      const lines = fs.readFileSync(ANALYTICS_PATH, 'utf8').trim().split('\n');
      assert.equal(lines.length, 1);
      const parsed = JSON.parse(lines[0]);
      assert.equal(parsed.airport, 'CYVR');
    });

    it('appends multiple entries', () => {
      logCall({ region: '1', airport: 'CYVR' });
      logCall({ region: '2', airport: 'CYYJ' });

      const lines = fs.readFileSync(ANALYTICS_PATH, 'utf8').trim().split('\n');
      assert.equal(lines.length, 2);
    });

    it('handles missing fields gracefully', () => {
      const entry = logCall({});
      assert.equal(entry.region, null);
      assert.equal(entry.airport, null);
      assert.equal(entry.duration, null);
      assert.equal(entry.caller, 'anonymous');
      assert.equal(entry.sid, null);
    });
  });
});
