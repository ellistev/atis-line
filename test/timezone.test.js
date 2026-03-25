const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { getLocalDateStr, getLocalMonthStr, getLocalWeekStartStr } = require('../src/utils/timezone');
const { computeStats } = require('../src/analytics/dashboard');
const { computeCreditStats } = require('../src/audio/credit-tracker');

describe('timezone utilities', () => {
  describe('getLocalDateStr', () => {
    it('returns YYYY-MM-DD format', () => {
      const date = new Date('2026-03-24T12:00:00Z');
      const result = getLocalDateStr(date, 'America/Vancouver');
      assert.match(result, /^\d{4}-\d{2}-\d{2}$/);
    });

    it('converts UTC date to Pacific date correctly across day boundary', () => {
      // 2026-03-25T03:00:00Z is 2026-03-24 8pm PDT (UTC-7 in March)
      const date = new Date('2026-03-25T03:00:00Z');
      const result = getLocalDateStr(date, 'America/Vancouver');
      assert.equal(result, '2026-03-24');
    });

    it('returns UTC date when timezone is UTC', () => {
      const date = new Date('2026-03-25T03:00:00Z');
      const result = getLocalDateStr(date, 'UTC');
      assert.equal(result, '2026-03-25');
    });

    it('handles DST spring forward (March)', () => {
      // March 8, 2026 is DST transition in Pacific (spring forward)
      // 2026-03-09T02:30:00 PDT doesn't exist, clocks jump to 3am
      // But UTC timestamps still work correctly
      const date = new Date('2026-03-09T09:00:00Z'); // 1am PST or 2am PDT
      const result = getLocalDateStr(date, 'America/Vancouver');
      assert.equal(result, '2026-03-09');
    });

    it('handles DST fall back (November)', () => {
      // November 1, 2026 is DST transition in Pacific (fall back)
      // 2026-11-01T08:30:00Z = 1:30am PDT (before fall back)
      const date = new Date('2026-11-01T08:30:00Z');
      const result = getLocalDateStr(date, 'America/Vancouver');
      assert.equal(result, '2026-11-01');
    });

    it('respects custom timezone parameter', () => {
      // 2026-03-25T03:00:00Z in US/Eastern (UTC-4 in March) = 2026-03-24 11pm
      const date = new Date('2026-03-25T03:00:00Z');
      const result = getLocalDateStr(date, 'America/New_York');
      assert.equal(result, '2026-03-24');
    });
  });

  describe('getLocalMonthStr', () => {
    it('returns YYYY-MM for the local timezone', () => {
      // 2026-04-01T02:00:00Z is still March 31 in Pacific
      const date = new Date('2026-04-01T02:00:00Z');
      const result = getLocalMonthStr(date, 'America/Vancouver');
      assert.equal(result, '2026-03');
    });
  });

  describe('getLocalWeekStartStr', () => {
    it('returns Monday date string', () => {
      // 2026-03-24 is a Tuesday
      const date = new Date('2026-03-24T12:00:00Z');
      const result = getLocalWeekStartStr(date, 'America/Vancouver');
      assert.equal(result, '2026-03-23'); // Monday
    });

    it('returns same day if already Monday', () => {
      // 2026-03-23 is a Monday
      const date = new Date('2026-03-23T12:00:00Z');
      const result = getLocalWeekStartStr(date, 'America/Vancouver');
      assert.equal(result, '2026-03-23');
    });

    it('handles Sunday correctly (goes back to previous Monday)', () => {
      // 2026-03-29 is a Sunday
      const date = new Date('2026-03-29T12:00:00Z');
      const result = getLocalWeekStartStr(date, 'America/Vancouver');
      assert.equal(result, '2026-03-23'); // Previous Monday
    });

    it('respects timezone for week boundary near midnight UTC', () => {
      // 2026-03-24T06:00:00Z is Monday 2026-03-23 11pm PDT
      const date = new Date('2026-03-24T06:00:00Z');
      const result = getLocalWeekStartStr(date, 'America/Vancouver');
      // In Pacific time it's still Monday Mar 23
      assert.equal(result, '2026-03-23');
    });
  });

  describe('computeStats with timezone-aware dates', () => {
    it('counts today calls correctly across UTC day boundary', () => {
      // "now" is 2026-03-24 8pm PDT = 2026-03-25T03:00:00Z
      const now = new Date('2026-03-25T03:00:00Z');

      const entries = [
        // This entry is 2026-03-24 in Pacific (5pm PDT = midnight UTC)
        { timestamp: '2026-03-25T00:00:00Z', airport: 'CYVR', region: 1, caller: 'a', sid: 's1' },
        // This entry is 2026-03-24 in Pacific (6pm PDT)
        { timestamp: '2026-03-25T01:00:00Z', airport: 'CYVR', region: 1, caller: 'b', sid: 's2' },
        // This entry is 2026-03-23 in Pacific (4pm PDT)
        { timestamp: '2026-03-23T23:00:00Z', airport: 'CYVR', region: 1, caller: 'c', sid: 's3' },
      ];

      const stats = computeStats(entries, now);
      // In Pacific time, "today" is 2026-03-24, so entries at midnight and 1am UTC on Mar 25 count
      assert.equal(stats.todayCalls, 2);
    });

    it('classifies new vs returning callers using local dates', () => {
      const now = new Date('2026-03-25T03:00:00Z'); // Mar 24 in Pacific

      const entries = [
        // Caller 'a' first seen on Mar 23 Pacific time
        { timestamp: '2026-03-23T20:00:00Z', airport: 'CYVR', region: 1, caller: 'a', sid: 's1' },
        // Caller 'a' calls again on Mar 24 Pacific time (but Mar 25 UTC)
        { timestamp: '2026-03-25T01:00:00Z', airport: 'CYVR', region: 1, caller: 'a', sid: 's2' },
        // Caller 'b' first seen today (Mar 24 Pacific)
        { timestamp: '2026-03-25T02:00:00Z', airport: 'CYVR', region: 1, caller: 'b', sid: 's3' },
      ];

      const stats = computeStats(entries, now);
      assert.equal(stats.newCallers, 1); // caller 'b'
      assert.equal(stats.returningCallers, 1); // caller 'a'
    });

    it('counts week calls using local timezone week boundary', () => {
      // 2026-03-24 is Tuesday. Monday is 2026-03-23.
      const now = new Date('2026-03-25T03:00:00Z'); // Mar 24 Pacific

      const entries = [
        // Mar 23 Pacific (this week)
        { timestamp: '2026-03-23T20:00:00Z', airport: 'CYVR', region: 1, caller: 'a', sid: 's1' },
        // Mar 22 Pacific (last week, Sunday)
        { timestamp: '2026-03-22T20:00:00Z', airport: 'CYVR', region: 1, caller: 'b', sid: 's2' },
        // Mar 24 Pacific (this week)
        { timestamp: '2026-03-25T01:00:00Z', airport: 'CYVR', region: 1, caller: 'c', sid: 's3' },
      ];

      const stats = computeStats(entries, now);
      assert.equal(stats.weekCalls, 2); // Mar 23 and Mar 24 entries
    });
  });

  describe('computeCreditStats with timezone-aware dates', () => {
    it('counts today generations correctly across UTC day boundary', () => {
      const now = new Date('2026-03-25T03:00:00Z'); // Mar 24 in Pacific

      const entries = [
        // Mar 24 in Pacific (midnight UTC Mar 25)
        { timestamp: '2026-03-25T00:00:00Z', icao: 'CYVR', chars: 100, voice: 'v1', success: true },
        // Mar 24 in Pacific (1am UTC Mar 25)
        { timestamp: '2026-03-25T01:00:00Z', icao: 'CYYJ', chars: 150, voice: 'v1', success: true },
        // Mar 23 in Pacific
        { timestamp: '2026-03-23T23:00:00Z', icao: 'CYVR', chars: 200, voice: 'v1', success: true },
      ];

      const stats = computeCreditStats(entries, now);
      assert.equal(stats.todayGenerations, 2);
      assert.equal(stats.todayChars, 250);
    });

    it('counts month correctly using local timezone', () => {
      // 2026-04-01T02:00:00Z is still March 31 in Pacific
      const now = new Date('2026-04-01T02:00:00Z');

      const entries = [
        // This is March 31 in Pacific
        { timestamp: '2026-04-01T01:00:00Z', icao: 'CYVR', chars: 100, voice: 'v1', success: true },
        // This is March 30 in Pacific
        { timestamp: '2026-03-30T20:00:00Z', icao: 'CYVR', chars: 200, voice: 'v1', success: true },
      ];

      const stats = computeCreditStats(entries, now);
      assert.equal(stats.monthGenerations, 2); // Both are in March (Pacific)
      assert.equal(stats.monthChars, 300);
    });
  });

  describe('TIMEZONE env var', () => {
    it('default timezone is used when env var is not set', () => {
      // Just verify the module loads and uses America/Vancouver as default
      const { DEFAULT_TIMEZONE } = require('../src/utils/timezone');
      // It should be America/Vancouver unless TIMEZONE env var is set
      assert.ok(typeof DEFAULT_TIMEZONE === 'string');
      assert.ok(DEFAULT_TIMEZONE.length > 0);
    });
  });
});
