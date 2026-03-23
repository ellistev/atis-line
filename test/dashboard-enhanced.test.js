const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { computeStats, renderDashboard, COST_DEFAULTS } = require('../src/analytics/dashboard');

describe('enhanced computeStats', () => {
  const now = new Date('2026-03-22T15:00:00Z');

  function makeEntries(overrides = []) {
    return overrides.map((o, i) => ({
      timestamp: '2026-03-22T10:00:00Z',
      region: 1,
      airport: 'CYVR',
      duration: 45,
      caller: 'caller' + i,
      sid: 'sid' + i,
      ...o,
    }));
  }

  describe('unique callers per day', () => {
    it('counts unique callers per day', () => {
      const entries = makeEntries([
        { timestamp: '2026-03-21T10:00:00Z', caller: 'alice' },
        { timestamp: '2026-03-21T11:00:00Z', caller: 'alice' },
        { timestamp: '2026-03-21T12:00:00Z', caller: 'bob' },
        { timestamp: '2026-03-22T10:00:00Z', caller: 'alice' },
        { timestamp: '2026-03-22T11:00:00Z', caller: 'charlie' },
      ]);
      const stats = computeStats(entries, now);
      assert.deepEqual(stats.uniqueCallersPerDay, [
        ['2026-03-21', 2],
        ['2026-03-22', 2],
      ]);
    });

    it('returns empty array with no entries', () => {
      const stats = computeStats([], now);
      assert.deepEqual(stats.uniqueCallersPerDay, []);
    });
  });

  describe('unique callers total', () => {
    it('counts total unique callers across all time', () => {
      const entries = makeEntries([
        { caller: 'alice' },
        { caller: 'alice' },
        { caller: 'bob' },
      ]);
      const stats = computeStats(entries, now);
      assert.equal(stats.uniqueCallersTotal, 2);
    });

    it('returns 0 with no entries', () => {
      const stats = computeStats([], now);
      assert.equal(stats.uniqueCallersTotal, 0);
    });
  });

  describe('new vs returning callers', () => {
    it('identifies new callers seen first today', () => {
      const entries = makeEntries([
        { timestamp: '2026-03-22T10:00:00Z', caller: 'newbie' },
      ]);
      const stats = computeStats(entries, now);
      assert.equal(stats.newCallers, 1);
      assert.equal(stats.returningCallers, 0);
    });

    it('identifies returning callers seen before today', () => {
      const entries = makeEntries([
        { timestamp: '2026-03-20T10:00:00Z', caller: 'regular' },
        { timestamp: '2026-03-22T10:00:00Z', caller: 'regular' },
      ]);
      const stats = computeStats(entries, now);
      assert.equal(stats.newCallers, 0);
      assert.equal(stats.returningCallers, 1);
    });

    it('handles mix of new and returning', () => {
      const entries = makeEntries([
        { timestamp: '2026-03-20T10:00:00Z', caller: 'regular' },
        { timestamp: '2026-03-22T10:00:00Z', caller: 'regular' },
        { timestamp: '2026-03-22T11:00:00Z', caller: 'newbie' },
      ]);
      const stats = computeStats(entries, now);
      assert.equal(stats.newCallers, 1);
      assert.equal(stats.returningCallers, 1);
    });

    it('returns zeros when no calls today', () => {
      const entries = makeEntries([
        { timestamp: '2026-03-20T10:00:00Z', caller: 'old' },
      ]);
      const stats = computeStats(entries, now);
      assert.equal(stats.newCallers, 0);
      assert.equal(stats.returningCallers, 0);
    });
  });

  describe('average lookups per call', () => {
    it('computes average airport lookups per call sid', () => {
      const entries = makeEntries([
        { sid: 'call1', airport: 'CYVR' },
        { sid: 'call1', airport: 'CYYJ' },
        { sid: 'call1', airport: 'CYPK' },
        { sid: 'call2', airport: 'CYVR' },
      ]);
      const stats = computeStats(entries, now);
      // call1: 3 lookups, call2: 1 lookup => avg 2.0
      assert.equal(stats.avgLookupsPerCall, 2);
    });

    it('returns 0 with no entries', () => {
      const stats = computeStats([], now);
      assert.equal(stats.avgLookupsPerCall, 0);
    });

    it('handles entries without sids', () => {
      const entries = makeEntries([
        { sid: null, airport: 'CYVR' },
        { sid: null, airport: 'CYYJ' },
      ]);
      const stats = computeStats(entries, now);
      assert.equal(stats.avgLookupsPerCall, 0);
    });
  });

  describe('peak hour', () => {
    it('identifies the hour with most calls', () => {
      const h10 = new Date(2026, 2, 22, 10, 0, 0).toISOString();
      const h14 = new Date(2026, 2, 22, 14, 0, 0).toISOString();
      const entries = makeEntries([
        { timestamp: h10 },
        { timestamp: h10 },
        { timestamp: h10 },
        { timestamp: h14 },
      ]);
      const stats = computeStats(entries, now);
      assert.equal(stats.peakHour, 10);
      assert.equal(stats.peakHourCalls, 3);
    });

    it('returns hour 0 with 0 calls when empty', () => {
      const stats = computeStats([], now);
      assert.equal(stats.peakHour, 0);
      assert.equal(stats.peakHourCalls, 0);
    });
  });

  describe('monthly run rate', () => {
    it('projects monthly calls from daily average', () => {
      // 2 days, 6 calls total => 3/day => 90/month
      const entries = makeEntries([
        { timestamp: '2026-03-21T10:00:00Z', caller: 'a' },
        { timestamp: '2026-03-21T11:00:00Z', caller: 'b' },
        { timestamp: '2026-03-21T12:00:00Z', caller: 'c' },
        { timestamp: '2026-03-22T10:00:00Z', caller: 'a' },
        { timestamp: '2026-03-22T11:00:00Z', caller: 'b' },
        { timestamp: '2026-03-22T12:00:00Z', caller: 'c' },
      ]);
      const stats = computeStats(entries, now);
      assert.equal(stats.monthlyRunRate, 90); // 3/day * 30
    });

    it('returns 0 for empty entries', () => {
      const stats = computeStats([], now);
      assert.equal(stats.monthlyRunRate, 0);
    });
  });

  describe('cost breakdown', () => {
    it('computes twilio and openai costs for given entries', () => {
      // 1 day, 10 calls, avg 45s duration
      const entries = makeEntries(
        Array.from({ length: 10 }, (_, i) => ({
          timestamp: '2026-03-22T10:00:00Z',
          caller: 'caller' + i,
          duration: 45,
        }))
      );
      const stats = computeStats(entries, now);

      // Daily Twilio: 10 calls * (45/60) min * 0.0085 = 0.06375 => 0.06
      assert.equal(stats.costBreakdown.dailyTwilio, 0.06);
      // Daily OpenAI: 10 * 0.00012 = 0.0012 => 0.0
      assert.equal(stats.costBreakdown.dailyOpenAi, 0);
      // Daily ElevenLabs: 30 gens * 130 chars * 0.00018 = 0.702 => 0.7
      assert.equal(stats.costBreakdown.dailyElevenLabs, 0.7);
      // Monthly Twilio: 0.15 + 0.06375*30 = 2.0625 => 2.06
      assert.equal(stats.costBreakdown.monthlyTwilio, 2.06);
    });

    it('includes elevenlabs in daily total', () => {
      const stats = computeStats([], now);
      // ElevenLabs: 30 * 130 * 0.00018 = 0.702 => 0.7
      assert.equal(stats.costBreakdown.dailyElevenLabs, 0.7);
      // Daily total = 0 (twilio) + 0 (openai) + 0.702 (elevenlabs) => 0.7
      assert.equal(stats.costBreakdown.dailyTotal, 0.7);
    });

    it('returns base twilio cost for empty entries', () => {
      const stats = computeStats([], now);
      assert.equal(stats.costBreakdown.monthlyTwilio, 0.15); // base cost only
      assert.equal(stats.costBreakdown.costPerCall, 0);
    });

    it('accepts custom cost config', () => {
      const entries = makeEntries([
        { timestamp: '2026-03-22T10:00:00Z', duration: 60 },
      ]);
      const stats = computeStats(entries, now, {
        twilioPerMinuteInbound: 0.01,
        twilioBaseMonthlyCost: 1.00,
        elevenLabsGenerationsPerDay: 0,
      });
      // 1 call, 1 minute, $0.01/min => daily twilio = 0.01
      assert.equal(stats.costBreakdown.dailyTwilio, 0.01);
      // Monthly: 1.00 + 0.01*30 = 1.30
      assert.equal(stats.costBreakdown.monthlyTwilio, 1.3);
    });

    it('computes cost per call', () => {
      const entries = makeEntries(
        Array.from({ length: 5 }, (_, i) => ({
          timestamp: '2026-03-22T10:00:00Z',
          caller: 'c' + i,
          duration: 60,
        }))
      );
      const stats = computeStats(entries, now);
      // costPerCall = dailyTotal / dailyAvgCalls
      assert.ok(stats.costBreakdown.costPerCall > 0);
    });
  });
});

describe('enhanced renderDashboard', () => {
  function makeStats() {
    return {
      totalCalls: 42,
      todayCalls: 5,
      weekCalls: 15,
      avgDuration: 33,
      topAirports: [['CYVR', 20], ['CYYJ', 10]],
      hourlyData: new Array(24).fill(0),
      regionCounts: { 1: 25, 2: 17 },
      recentCalls: [],
      uniqueCallersPerDay: [['03-21', 3], ['03-22', 5]],
      uniqueCallersTotal: 8,
      newCallers: 2,
      returningCallers: 3,
      avgLookupsPerCall: 1.5,
      peakHour: 14,
      peakHourCalls: 12,
      monthlyRunRate: 150,
      costBreakdown: {
        dailyTwilio: 0.06,
        dailyOpenAi: 0.01,
        dailyElevenLabs: 0.70,
        dailyTotal: 0.77,
        monthlyTwilio: 2.06,
        monthlyOpenAi: 0.30,
        monthlyElevenLabs: 21.06,
        monthlyTotal: 23.42,
        costPerCall: 0.0065,
      },
    };
  }

  it('includes auto-refresh meta tag', () => {
    const html = renderDashboard(makeStats());
    assert.ok(html.includes('http-equiv="refresh" content="60"'));
  });

  it('renders monthly run rate', () => {
    const html = renderDashboard(makeStats());
    assert.ok(html.includes('>150<'));
    assert.ok(html.includes('Monthly Run Rate'));
  });

  it('renders unique callers total', () => {
    const html = renderDashboard(makeStats());
    assert.ok(html.includes('>8<'));
    assert.ok(html.includes('Unique Callers'));
  });

  it('renders peak hour', () => {
    const html = renderDashboard(makeStats());
    assert.ok(html.includes('>14:00<'));
    assert.ok(html.includes('Peak Hour'));
  });

  it('renders avg lookups per call', () => {
    const html = renderDashboard(makeStats());
    assert.ok(html.includes('>1.5<'));
    assert.ok(html.includes('Avg Lookups/Call'));
  });

  it('renders new and returning caller counts', () => {
    const html = renderDashboard(makeStats());
    assert.ok(html.includes('>2<'));
    assert.ok(html.includes('>3<'));
    assert.ok(html.includes('New Callers'));
    assert.ok(html.includes('Returning'));
  });

  it('renders cost breakdown section', () => {
    const html = renderDashboard(makeStats());
    assert.ok(html.includes('Cost Breakdown'));
    assert.ok(html.includes('$0.06'));
    assert.ok(html.includes('$2.06'));
    assert.ok(html.includes('$23.42'));
    assert.ok(html.includes('$0.0065'));
    assert.ok(html.includes('$0.70'));
    assert.ok(html.includes('Projected Monthly Total'));
    assert.ok(html.includes('Cost per Call'));
    assert.ok(html.includes('ElevenLabs'));
  });

  it('renders unique callers per day chart', () => {
    const html = renderDashboard(makeStats());
    assert.ok(html.includes('callersChart'));
    assert.ok(html.includes('Unique Callers per Day'));
  });

  it('renders peak hours heatmap chart', () => {
    const html = renderDashboard(makeStats());
    assert.ok(html.includes('heatmapChart'));
    assert.ok(html.includes('Peak Hours Heatmap'));
  });

  it('renders new vs returning callers chart', () => {
    const html = renderDashboard(makeStats());
    assert.ok(html.includes('callerTypeChart'));
    assert.ok(html.includes('New vs Returning'));
  });

  it('is mobile-friendly with responsive viewport', () => {
    const html = renderDashboard(makeStats());
    assert.ok(html.includes('width=device-width'));
    assert.ok(html.includes('@media (max-width: 600px)'));
  });
});

describe('COST_DEFAULTS export', () => {
  it('exports expected cost defaults', () => {
    assert.equal(COST_DEFAULTS.twilioBaseMonthlyCost, 0.15);
    assert.equal(COST_DEFAULTS.twilioPerMinuteInbound, 0.0085);
    assert.equal(COST_DEFAULTS.elevenLabsCharsPerGeneration, 130);
    assert.equal(COST_DEFAULTS.openaiPerHumanizerCall, 0.00012);
    assert.equal(COST_DEFAULTS.averageCallDurationSeconds, 45);
  });
});
