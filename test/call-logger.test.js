const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { logCall, getCallLog, clearCallLog } = require('../src/call-logger');

describe('call-logger', () => {
  beforeEach(() => {
    clearCallLog();
  });

  describe('logCall', () => {
    it('logs a call with all fields', () => {
      const entry = logCall({
        callSid: 'CA123',
        callerNumber: '+16045551234',
        airportIcao: 'CYVR',
        airportName: 'Vancouver International',
        timestamp: '2026-03-20T12:00:00.000Z',
      });
      assert.equal(entry.callSid, 'CA123');
      assert.equal(entry.callerNumber, '+16045551234');
      assert.equal(entry.airportIcao, 'CYVR');
      assert.equal(entry.airportName, 'Vancouver International');
      assert.equal(entry.timestamp, '2026-03-20T12:00:00.000Z');
    });

    it('defaults missing fields', () => {
      const entry = logCall();
      assert.equal(entry.callSid, null);
      assert.equal(entry.callerNumber, 'unknown');
      assert.equal(entry.airportIcao, null);
      assert.equal(entry.airportName, null);
      assert.equal(typeof entry.timestamp, 'string');
    });

    it('logs a menu-only call (no airport)', () => {
      const entry = logCall({
        callSid: 'CA456',
        callerNumber: '+16045559999',
      });
      assert.equal(entry.callSid, 'CA456');
      assert.equal(entry.airportIcao, null);
    });
  });

  describe('getCallLog', () => {
    it('returns empty array initially', () => {
      assert.deepEqual(getCallLog(), []);
    });

    it('accumulates log entries', () => {
      logCall({ callSid: 'CA1' });
      logCall({ callSid: 'CA2' });
      logCall({ callSid: 'CA3' });
      assert.equal(getCallLog().length, 3);
    });
  });

  describe('clearCallLog', () => {
    it('clears all entries', () => {
      logCall({ callSid: 'CA1' });
      logCall({ callSid: 'CA2' });
      clearCallLog();
      assert.deepEqual(getCallLog(), []);
    });
  });
});
