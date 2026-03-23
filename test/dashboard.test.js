const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const { readAnalytics, computeStats, renderDashboard, ANALYTICS_PATH } = require('../src/analytics/dashboard');

function cleanup() {
  try { fs.unlinkSync(ANALYTICS_PATH); } catch {}
}

function writeEntries(entries) {
  fs.writeFileSync(ANALYTICS_PATH, entries.map(e => JSON.stringify(e)).join('\n') + '\n');
}

describe('analytics/dashboard', () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  describe('readAnalytics', () => {
    it('returns empty array when file does not exist', () => {
      assert.deepEqual(readAnalytics(), []);
    });

    it('parses JSONL entries', () => {
      writeEntries([
        { timestamp: '2026-03-21T10:00:00Z', region: 1, airport: 'CYVR', duration: 30, caller: 'abc123', sid: null },
        { timestamp: '2026-03-21T11:00:00Z', region: 2, airport: 'CYYJ', duration: 45, caller: 'def456', sid: null },
      ]);
      const entries = readAnalytics();
      assert.equal(entries.length, 2);
      assert.equal(entries[0].airport, 'CYVR');
      assert.equal(entries[1].airport, 'CYYJ');
    });

    it('skips malformed lines', () => {
      fs.writeFileSync(ANALYTICS_PATH, '{"airport":"CYVR"}\nnot json\n{"airport":"CYYJ"}\n');
      const entries = readAnalytics();
      assert.equal(entries.length, 2);
    });

    it('returns empty array for empty file', () => {
      fs.writeFileSync(ANALYTICS_PATH, '');
      assert.deepEqual(readAnalytics(), []);
    });
  });

  describe('computeStats', () => {
    it('returns zeroed stats for empty entries', () => {
      const stats = computeStats([]);
      assert.equal(stats.totalCalls, 0);
      assert.equal(stats.todayCalls, 0);
      assert.equal(stats.weekCalls, 0);
      assert.equal(stats.avgDuration, 0);
      assert.deepEqual(stats.topAirports, []);
      assert.deepEqual(stats.recentCalls, []);
    });

    it('counts today and week calls correctly', () => {
      const now = new Date('2026-03-21T15:00:00Z');
      const entries = [
        { timestamp: '2026-03-21T10:00:00Z', region: 1, airport: 'CYVR', duration: 30 },
        { timestamp: '2026-03-21T12:00:00Z', region: 1, airport: 'CYVR', duration: 40 },
        { timestamp: '2026-03-20T10:00:00Z', region: 2, airport: 'CYYJ', duration: 20 },
        { timestamp: '2026-03-10T10:00:00Z', region: 1, airport: 'CYVR', duration: 50 },
      ];
      const stats = computeStats(entries, now);
      assert.equal(stats.totalCalls, 4);
      assert.equal(stats.todayCalls, 2);
      assert.equal(stats.weekCalls, 3); // Mar 16 (Mon) through Mar 21
    });

    it('computes average duration ignoring nulls', () => {
      const entries = [
        { timestamp: '2026-03-21T10:00:00Z', region: 1, airport: 'CYVR', duration: 30 },
        { timestamp: '2026-03-21T11:00:00Z', region: 1, airport: 'CYVR', duration: null },
        { timestamp: '2026-03-21T12:00:00Z', region: 1, airport: 'CYVR', duration: 50 },
      ];
      const stats = computeStats(entries, new Date('2026-03-21T15:00:00Z'));
      assert.equal(stats.avgDuration, 40); // (30+50)/2
    });

    it('ranks top airports by call count', () => {
      const entries = [
        { timestamp: '2026-03-21T10:00:00Z', region: 1, airport: 'CYVR' },
        { timestamp: '2026-03-21T10:00:00Z', region: 1, airport: 'CYVR' },
        { timestamp: '2026-03-21T10:00:00Z', region: 1, airport: 'CYVR' },
        { timestamp: '2026-03-21T10:00:00Z', region: 2, airport: 'CYYJ' },
        { timestamp: '2026-03-21T10:00:00Z', region: 1, airport: 'CYPK' },
        { timestamp: '2026-03-21T10:00:00Z', region: 1, airport: 'CYPK' },
      ];
      const stats = computeStats(entries);
      assert.equal(stats.topAirports[0][0], 'CYVR');
      assert.equal(stats.topAirports[0][1], 3);
      assert.equal(stats.topAirports[1][0], 'CYPK');
      assert.equal(stats.topAirports[1][1], 2);
    });

    it('builds hourly distribution across 24 hours', () => {
      // Use local-time-aware hours to avoid timezone issues
      const h10 = new Date(2026, 2, 21, 10, 0, 0).toISOString();
      const h10b = new Date(2026, 2, 21, 10, 30, 0).toISOString();
      const h14 = new Date(2026, 2, 21, 14, 0, 0).toISOString();
      const entries = [
        { timestamp: h10, region: 1, airport: 'CYVR' },
        { timestamp: h10b, region: 1, airport: 'CYVR' },
        { timestamp: h14, region: 1, airport: 'CYVR' },
      ];
      const stats = computeStats(entries);
      assert.equal(stats.hourlyData.length, 24);
      assert.equal(stats.hourlyData[10], 2);
      assert.equal(stats.hourlyData[14], 1);
      assert.equal(stats.hourlyData[0], 0);
    });

    it('counts region distribution', () => {
      const entries = [
        { timestamp: '2026-03-21T10:00:00Z', region: 1, airport: 'CYVR' },
        { timestamp: '2026-03-21T10:00:00Z', region: 1, airport: 'CYPK' },
        { timestamp: '2026-03-21T10:00:00Z', region: 2, airport: 'CYYJ' },
      ];
      const stats = computeStats(entries);
      assert.equal(stats.regionCounts[1], 2);
      assert.equal(stats.regionCounts[2], 1);
    });

    it('returns last 20 recent calls in reverse order', () => {
      const entries = Array.from({ length: 25 }, (_, i) => ({
        timestamp: new Date(2026, 2, 21, i, 0, 0).toISOString(),
        region: 1,
        airport: 'CYVR',
      }));
      const stats = computeStats(entries);
      assert.equal(stats.recentCalls.length, 20);
      // Most recent first (last entry is i=24, i.e. hour 0 of next day)
      assert.equal(stats.recentCalls[0].timestamp, entries[24].timestamp);
      assert.equal(stats.recentCalls[19].timestamp, entries[5].timestamp);
    });

    it('tracks unique callers per day', () => {
      const entries = [
        { timestamp: '2026-03-21T10:00:00Z', region: 1, airport: 'CYVR', caller: 'aaa' },
        { timestamp: '2026-03-21T11:00:00Z', region: 1, airport: 'CYVR', caller: 'aaa' },
        { timestamp: '2026-03-21T12:00:00Z', region: 1, airport: 'CYVR', caller: 'bbb' },
        { timestamp: '2026-03-22T10:00:00Z', region: 1, airport: 'CYVR', caller: 'ccc' },
      ];
      const stats = computeStats(entries, new Date('2026-03-22T15:00:00Z'));
      assert.equal(stats.uniqueCallersTotal, 3);
      assert.equal(stats.uniqueCallersPerDay.length, 2);
      // Day 1: aaa + bbb = 2 unique, Day 2: ccc = 1 unique
      assert.deepEqual(stats.uniqueCallersPerDay[0], ['2026-03-21', 2]);
      assert.deepEqual(stats.uniqueCallersPerDay[1], ['2026-03-22', 1]);
    });

    it('identifies new vs returning callers for today', () => {
      const entries = [
        { timestamp: '2026-03-20T10:00:00Z', region: 1, airport: 'CYVR', caller: 'aaa' },
        { timestamp: '2026-03-21T10:00:00Z', region: 1, airport: 'CYVR', caller: 'aaa' },
        { timestamp: '2026-03-21T11:00:00Z', region: 1, airport: 'CYVR', caller: 'bbb' },
      ];
      const stats = computeStats(entries, new Date('2026-03-21T15:00:00Z'));
      assert.equal(stats.newCallers, 1);       // bbb is new today
      assert.equal(stats.returningCallers, 1);  // aaa was seen before
    });

    it('computes average lookups per call using sid', () => {
      const entries = [
        { timestamp: '2026-03-21T10:00:00Z', region: 1, airport: 'CYVR', caller: 'aaa', sid: 'call1' },
        { timestamp: '2026-03-21T10:01:00Z', region: 1, airport: 'CYPK', caller: 'aaa', sid: 'call1' },
        { timestamp: '2026-03-21T10:02:00Z', region: 1, airport: 'CYXX', caller: 'aaa', sid: 'call1' },
        { timestamp: '2026-03-21T11:00:00Z', region: 1, airport: 'CYVR', caller: 'bbb', sid: 'call2' },
      ];
      const stats = computeStats(entries);
      // call1: 3 lookups, call2: 1 lookup, avg = 2
      assert.equal(stats.avgLookupsPerCall, 2);
    });

    it('identifies peak hour', () => {
      const h10a = new Date(2026, 2, 21, 10, 0, 0).toISOString();
      const h10b = new Date(2026, 2, 21, 10, 30, 0).toISOString();
      const h10c = new Date(2026, 2, 21, 10, 45, 0).toISOString();
      const h14 = new Date(2026, 2, 21, 14, 0, 0).toISOString();
      const entries = [
        { timestamp: h10a, region: 1, airport: 'CYVR' },
        { timestamp: h10b, region: 1, airport: 'CYVR' },
        { timestamp: h10c, region: 1, airport: 'CYVR' },
        { timestamp: h14, region: 1, airport: 'CYVR' },
      ];
      const stats = computeStats(entries);
      assert.equal(stats.peakHour, 10);
      assert.equal(stats.peakHourCalls, 3);
    });

    it('computes cost breakdown with configurable rates', () => {
      const entries = [
        { timestamp: '2026-03-21T10:00:00Z', region: 1, airport: 'CYVR', duration: 60, caller: 'aaa' },
        { timestamp: '2026-03-21T11:00:00Z', region: 1, airport: 'CYVR', duration: 60, caller: 'bbb' },
      ];
      const stats = computeStats(entries, new Date('2026-03-21T15:00:00Z'));
      assert.ok(stats.costBreakdown);
      assert.ok(stats.costBreakdown.dailyTwilio >= 0);
      assert.ok(stats.costBreakdown.dailyOpenAi >= 0);
      assert.ok(stats.costBreakdown.dailyElevenLabs >= 0);
      assert.ok(stats.costBreakdown.monthlyTotal > 0);
      assert.ok(stats.costBreakdown.costPerCall >= 0);
      assert.equal(stats.monthlyRunRate, 60); // 2 calls/day * 30 days
    });

    it('returns cost breakdown with zeroed values for empty entries', () => {
      const stats = computeStats([]);
      assert.ok(stats.costBreakdown);
      assert.equal(stats.costBreakdown.costPerCall, 0);
    });
  });

  describe('renderDashboard', () => {
    it('returns valid HTML with Chart.js', () => {
      const stats = computeStats([]);
      const html = renderDashboard(stats);
      assert.ok(html.includes('<!DOCTYPE html>'));
      assert.ok(html.includes('chart.js'));
      assert.ok(html.includes('ATIS Line Analytics'));
    });

    it('includes stat values in rendered HTML', () => {
      const stats = {
        totalCalls: 42,
        todayCalls: 5,
        weekCalls: 15,
        avgDuration: 33,
        topAirports: [['CYVR', 20], ['CYYJ', 10]],
        hourlyData: new Array(24).fill(0),
        regionCounts: { 1: 25, 2: 17 },
        recentCalls: [],
        uniqueCallersPerDay: [],
        uniqueCallersTotal: 3,
        newCallers: 1,
        returningCallers: 2,
        avgLookupsPerCall: 1.5,
        peakHour: 10,
        peakHourCalls: 5,
        monthlyRunRate: 180,
        costBreakdown: {
          dailyTwilio: 0.01, dailyOpenAi: 0.00, dailyElevenLabs: 0.00,
          dailyTotal: 0.01, costPerCall: 0.0017,
          monthlyTwilio: 0.45, monthlyOpenAi: 0.01, monthlyElevenLabs: 0.00,
          monthlyTotal: 0.46,
        },
      };
      const html = renderDashboard(stats);
      assert.ok(html.includes('>42<'));
      assert.ok(html.includes('>5<'));
      assert.ok(html.includes('>15<'));
      assert.ok(html.includes('>33s<'));
    });

    it('renders recent calls table rows', () => {
      const stats = {
        totalCalls: 1,
        todayCalls: 1,
        weekCalls: 1,
        avgDuration: 30,
        topAirports: [['CYVR', 1]],
        hourlyData: new Array(24).fill(0),
        regionCounts: { 1: 1 },
        recentCalls: [{ timestamp: '2026-03-21T10:00:00Z', airport: 'CYVR', region: 1, duration: 30, caller: 'abc123' }],
        uniqueCallersPerDay: [['03-21', 1]],
        uniqueCallersTotal: 1,
        newCallers: 1,
        returningCallers: 0,
        avgLookupsPerCall: 1,
        peakHour: 10,
        peakHourCalls: 1,
        monthlyRunRate: 30,
        costBreakdown: {
          dailyTwilio: 0.01, dailyOpenAi: 0.00, dailyElevenLabs: 0.00,
          dailyTotal: 0.01, costPerCall: 0.01,
          monthlyTwilio: 0.45, monthlyOpenAi: 0.00, monthlyElevenLabs: 0.00,
          monthlyTotal: 0.45,
        },
      };
      const html = renderDashboard(stats);
      assert.ok(html.includes('CYVR'));
      assert.ok(html.includes('abc123'));
      assert.ok(html.includes('30s'));
    });
  });
});

describe('GET /analytics route', () => {
  let server;
  let baseUrl;
  const { app } = require('../server');

  beforeEach(() => {
    cleanup();
    return new Promise((resolve) => {
      server = app.listen(0, () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    });
  });

  afterEach(() => {
    cleanup();
    return new Promise((resolve) => {
      server.close(resolve);
    });
  });

  function get(path) {
    return new Promise((resolve, reject) => {
      http.get(`${baseUrl}${path}`, (res) => {
        let text = '';
        res.on('data', (chunk) => { text += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text }));
      }).on('error', reject);
    });
  }

  it('returns 200 with HTML content type', async () => {
    const res = await get('/analytics');
    assert.equal(res.status, 200);
    assert.ok(res.headers['content-type'].includes('text/html'));
  });

  it('returns valid dashboard HTML', async () => {
    const res = await get('/analytics');
    assert.ok(res.text.includes('<!DOCTYPE html>'));
    assert.ok(res.text.includes('ATIS Line Analytics'));
    assert.ok(res.text.includes('chart.js'));
  });

  it('displays analytics data when entries exist', async () => {
    writeEntries([
      { timestamp: '2026-03-21T10:00:00Z', region: 1, airport: 'CYVR', duration: 30, caller: 'test123', sid: null },
    ]);
    const res = await get('/analytics');
    assert.ok(res.text.includes('CYVR'));
  });
});
