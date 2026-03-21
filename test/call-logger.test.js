const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { logCall, readLogs, getStats, hashCaller, resetLogs, getLogPath, LOGS_DIR } = require('../src/analytics/call-logger');

describe('call-logger', () => {
  beforeEach(() => {
    resetLogs();
  });

  describe('hashCaller', () => {
    it('returns a SHA256 hex string for a phone number', () => {
      const hash = hashCaller('+16045551234');
      assert.equal(hash.length, 64);
      assert.match(hash, /^[a-f0-9]{64}$/);
    });

    it('returns consistent hashes for the same number', () => {
      assert.equal(hashCaller('+16045551234'), hashCaller('+16045551234'));
    });

    it('returns different hashes for different numbers', () => {
      assert.notEqual(hashCaller('+16045551234'), hashCaller('+16045559999'));
    });

    it('returns anonymous for null/undefined', () => {
      assert.equal(hashCaller(null), 'anonymous');
      assert.equal(hashCaller(undefined), 'anonymous');
    });
  });

  describe('logCall', () => {
    it('writes a JSONL entry with all fields', () => {
      const entry = logCall({
        callSid: 'CA123',
        callerNumber: '+16045551234',
        airportSelected: 'CYVR',
        duration: 45,
      });

      assert.ok(entry.timestamp);
      assert.equal(entry.callSid, 'CA123');
      assert.equal(entry.caller, hashCaller('+16045551234'));
      assert.equal(entry.airport, 'CYVR');
      assert.equal(entry.duration, 45);
    });

    it('creates log file in JSONL format', () => {
      logCall({ callSid: 'CA1', callerNumber: '+1', airportSelected: 'CYVR', duration: 10 });
      logCall({ callSid: 'CA2', callerNumber: '+2', airportSelected: 'CYPK', duration: 20 });

      const logPath = getLogPath();
      assert.ok(fs.existsSync(logPath));

      const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
      assert.equal(lines.length, 2);

      const first = JSON.parse(lines[0]);
      assert.equal(first.callSid, 'CA1');
    });

    it('handles missing fields gracefully', () => {
      const entry = logCall({});
      assert.equal(entry.callSid, 'unknown');
      assert.equal(entry.caller, 'anonymous');
      assert.equal(entry.airport, null);
      assert.equal(entry.duration, null);
    });
  });

  describe('readLogs', () => {
    it('returns empty array when no log file exists', () => {
      const entries = readLogs();
      assert.deepEqual(entries, []);
    });

    it('returns all entries for today', () => {
      logCall({ callSid: 'CA1', callerNumber: '+1', airportSelected: 'CYVR', duration: 10 });
      logCall({ callSid: 'CA2', callerNumber: '+2', airportSelected: 'CYPK', duration: 20 });

      const entries = readLogs();
      assert.equal(entries.length, 2);
    });
  });

  describe('getStats', () => {
    it('returns zeroed stats when no calls logged', () => {
      const stats = getStats();
      assert.equal(stats.totalCalls, 0);
      assert.ok(stats.today);
      assert.deepEqual(stats.byAirport, {});
      assert.equal(stats.peakHour, null);
      assert.equal(stats.uniqueCallers, 0);
    });

    it('counts calls by airport', () => {
      logCall({ callSid: 'CA1', callerNumber: '+1', airportSelected: 'CYVR', duration: 10 });
      logCall({ callSid: 'CA2', callerNumber: '+2', airportSelected: 'CYVR', duration: 15 });
      logCall({ callSid: 'CA3', callerNumber: '+3', airportSelected: 'CYPK', duration: 20 });

      const stats = getStats();
      assert.equal(stats.totalCalls, 3);
      assert.equal(stats.byAirport['CYVR'], 2);
      assert.equal(stats.byAirport['CYPK'], 1);
    });

    it('counts unique callers', () => {
      logCall({ callSid: 'CA1', callerNumber: '+1', airportSelected: 'CYVR', duration: 10 });
      logCall({ callSid: 'CA2', callerNumber: '+1', airportSelected: 'CYPK', duration: 15 });
      logCall({ callSid: 'CA3', callerNumber: '+2', airportSelected: 'CYVR', duration: 20 });

      const stats = getStats();
      assert.equal(stats.uniqueCallers, 2);
    });

    it('identifies peak hour', () => {
      // All calls happen in the current hour
      logCall({ callSid: 'CA1', callerNumber: '+1', airportSelected: 'CYVR', duration: 10 });
      logCall({ callSid: 'CA2', callerNumber: '+2', airportSelected: 'CYVR', duration: 15 });

      const stats = getStats();
      assert.equal(stats.peakHour, new Date().getHours());
    });
  });

  describe('daily rotation', () => {
    it('uses date-stamped filename', () => {
      const logPath = getLogPath();
      const today = new Date().toISOString().slice(0, 10);
      assert.ok(logPath.endsWith(`calls-${today}.jsonl`));
    });

    it('produces different paths for different dates', () => {
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      assert.notEqual(getLogPath(today), getLogPath(tomorrow));
    });
  });
});
