const fs = require('node:fs');
const path = require('node:path');

const ANALYTICS_PATH = path.join(__dirname, '..', '..', 'analytics.jsonl');

/** Cost constants (configurable) */
const COST_DEFAULTS = {
  twilioBaseMonthlyCost: 0.15,
  twilioPerMinuteInbound: 0.0085,
  elevenLabsMonthlyCost: 330,         // $330/mo Scale plan
  elevenLabsMonthlyCredits: 2000000,  // 2M credits/month
  elevenLabsCharsPerGeneration: 130,  // avg chars per ATIS TTS generation
  elevenLabsGenerationsPerDay: 30,    // ~2 updates/airport/day across 15 airports
  openaiPerHumanizerCall: 0.00012,
  averageCallDurationSeconds: 45,
};

/**
 * Read all entries from analytics.jsonl.
 */
function readAnalytics(filePath = ANALYTICS_PATH) {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, 'utf8').trim();
  if (!content) return [];
  return content.split('\n').filter(Boolean).map(line => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
}

/**
 * Compute dashboard statistics from analytics entries.
 */
function computeStats(entries, now = new Date(), costConfig = {}) {
  const costs = { ...COST_DEFAULTS, ...costConfig };
  const todayStr = now.toISOString().slice(0, 10);

  // Week start (Monday)
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1));
  weekStart.setHours(0, 0, 0, 0);

  let todayCalls = 0;
  let weekCalls = 0;
  const airportCounts = {};
  const hourCounts = {};
  const regionCounts = {};
  let totalDuration = 0;
  let durationCount = 0;

  // New tracking
  const allCallers = new Set();
  const dailyCallers = {};  // dateStr -> Set of callers
  const callerFirstSeen = {}; // caller -> dateStr (first appearance)
  const callerSids = {}; // caller -> Set of sids (for lookups-per-call)

  for (const entry of entries) {
    const ts = new Date(entry.timestamp);
    const dateStr = entry.timestamp.slice(0, 10);

    if (dateStr === todayStr) todayCalls++;
    if (ts >= weekStart) weekCalls++;

    // Airport counts
    if (entry.airport) {
      airportCounts[entry.airport] = (airportCounts[entry.airport] || 0) + 1;
    }

    // Hour distribution (all time)
    const hour = ts.getHours();
    hourCounts[hour] = (hourCounts[hour] || 0) + 1;

    // Region distribution
    if (entry.region != null) {
      regionCounts[entry.region] = (regionCounts[entry.region] || 0) + 1;
    }

    // Duration
    if (entry.duration != null) {
      totalDuration += entry.duration;
      durationCount++;
    }

    // Caller tracking
    if (entry.caller) {
      allCallers.add(entry.caller);

      if (!dailyCallers[dateStr]) dailyCallers[dateStr] = new Set();
      dailyCallers[dateStr].add(entry.caller);

      if (!callerFirstSeen[entry.caller] || dateStr < callerFirstSeen[entry.caller]) {
        callerFirstSeen[entry.caller] = dateStr;
      }

      // Track unique sids per caller for lookups-per-call
      if (entry.sid) {
        if (!callerSids[entry.caller]) callerSids[entry.caller] = new Set();
        callerSids[entry.caller].add(entry.sid);
      }
    }
  }

  // Top airports sorted by count descending
  const topAirports = Object.entries(airportCounts)
    .sort((a, b) => b[1] - a[1]);

  // Hours 0-23
  const hourlyData = Array.from({ length: 24 }, (_, i) => hourCounts[i] || 0);

  // Recent calls (last 20, newest first)
  const recentCalls = entries.slice(-20).reverse();

  // Unique callers per day (sorted by date)
  const uniqueCallersPerDay = Object.entries(dailyCallers)
    .map(([date, callers]) => [date, callers.size])
    .sort((a, b) => a[0].localeCompare(b[0]));

  // New vs returning callers
  let newCallers = 0;
  let returningCallers = 0;
  for (const [caller, firstDate] of Object.entries(callerFirstSeen)) {
    if (firstDate === todayStr) {
      newCallers++;
    } else {
      // Check if they called today too
      if (dailyCallers[todayStr] && dailyCallers[todayStr].has(caller)) {
        returningCallers++;
      }
    }
  }

  // Average lookups per call
  // Each unique sid is one call; entries with that sid are lookups within it
  const sidLookups = {};
  for (const entry of entries) {
    if (entry.sid) {
      sidLookups[entry.sid] = (sidLookups[entry.sid] || 0) + 1;
    }
  }
  const sidCounts = Object.values(sidLookups);
  const avgLookupsPerCall = sidCounts.length > 0
    ? Math.round((sidCounts.reduce((a, b) => a + b, 0) / sidCounts.length) * 10) / 10
    : 0;

  // Peak hour
  let peakHour = 0;
  let peakHourCalls = 0;
  for (let h = 0; h < 24; h++) {
    if ((hourCounts[h] || 0) > peakHourCalls) {
      peakHourCalls = hourCounts[h];
      peakHour = h;
    }
  }

  // Cost calculations
  const activeDays = Object.keys(dailyCallers).length || 1;
  const dailyAvgCalls = entries.length / activeDays;
  const avgDuration = durationCount > 0 ? totalDuration / durationCount : costs.averageCallDurationSeconds;
  const avgDurationMinutes = avgDuration / 60;

  // Daily costs
  const dailyTwilioCost = dailyAvgCalls * avgDurationMinutes * costs.twilioPerMinuteInbound;
  const dailyOpenAiCost = dailyAvgCalls * costs.openaiPerHumanizerCall;
  const dailyElevenLabsCost = costs.elevenLabsMonthlyCost / 30; // flat monthly rate spread daily
  const dailyElevenLabsCreditsUsed = costs.elevenLabsGenerationsPerDay * costs.elevenLabsCharsPerGeneration;
  const dailyTotalCost = dailyTwilioCost + dailyOpenAiCost + dailyElevenLabsCost;

  // Monthly projections (30 days)
  const monthlyTwilioCost = costs.twilioBaseMonthlyCost + (dailyTwilioCost * 30);
  const monthlyOpenAiCost = dailyOpenAiCost * 30;
  const monthlyElevenLabsCost = costs.elevenLabsMonthlyCost; // flat rate
  const monthlyElevenLabsCreditsUsed = dailyElevenLabsCreditsUsed * 30;
  const monthlyTotalCost = monthlyTwilioCost + monthlyOpenAiCost + monthlyElevenLabsCost;
  const monthlyRunRate = dailyAvgCalls * 30;

  const costPerCall = entries.length > 0
    ? (dailyTotalCost / dailyAvgCalls)
    : 0;

  return {
    totalCalls: entries.length,
    todayCalls,
    weekCalls,
    avgDuration: durationCount > 0 ? Math.round(totalDuration / durationCount) : 0,
    topAirports,
    hourlyData,
    regionCounts,
    recentCalls,
    // New metrics
    uniqueCallersPerDay,
    uniqueCallersTotal: allCallers.size,
    newCallers,
    returningCallers,
    avgLookupsPerCall,
    peakHour,
    peakHourCalls,
    monthlyRunRate: Math.round(monthlyRunRate),
    costBreakdown: {
      dailyTwilio: round2(dailyTwilioCost),
      dailyOpenAi: round2(dailyOpenAiCost),
      dailyElevenLabs: round2(dailyElevenLabsCost),
      dailyTotal: round2(dailyTotalCost),
      monthlyTwilio: round2(monthlyTwilioCost),
      monthlyOpenAi: round2(monthlyOpenAiCost),
      monthlyElevenLabs: round2(monthlyElevenLabsCost),
      monthlyTotal: round2(monthlyTotalCost),
      costPerCall: round4(costPerCall),
      dailyElevenLabsCredits: Math.round(dailyElevenLabsCreditsUsed),
      monthlyElevenLabsCredits: Math.round(monthlyElevenLabsCreditsUsed),
      elevenLabsMonthlyCredits: costs.elevenLabsMonthlyCredits,
      elevenLabsCreditUtilization: round2((monthlyElevenLabsCreditsUsed / costs.elevenLabsMonthlyCredits) * 100),
    },
  };
}

function round2(n) { return Math.round(n * 100) / 100; }
function round4(n) { return Math.round(n * 10000) / 10000; }

/**
 * Generate the dashboard HTML page.
 */
function renderDashboard(stats) {
  const regionLabels = Object.keys(stats.regionCounts).map(r => `Region ${r}`);
  const regionValues = Object.values(stats.regionCounts);
  const airportLabels = stats.topAirports.map(([code]) => code);
  const airportValues = stats.topAirports.map(([, count]) => count);
  const uniqueCallersPerDay = stats.uniqueCallersPerDay || [];
  const callerDayLabels = uniqueCallersPerDay.map(([date]) => date.slice(5));
  const callerDayValues = uniqueCallersPerDay.map(([, count]) => count);
  const cb = stats.costBreakdown || {
    dailyTwilio: 0, dailyOpenAi: 0, dailyElevenLabs: 0, dailyTotal: 0,
    monthlyTwilio: 0, monthlyOpenAi: 0, monthlyElevenLabs: 0, monthlyTotal: 0, costPerCall: 0,
  };
  const monthlyRunRate = stats.monthlyRunRate || 0;
  const uniqueCallersTotal = stats.uniqueCallersTotal || 0;
  const peakHour = stats.peakHour || 0;
  const peakHourCalls = stats.peakHourCalls || 0;
  const avgLookupsPerCall = stats.avgLookupsPerCall || 0;
  const newCallers = stats.newCallers || 0;
  const returningCallers = stats.returningCallers || 0;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="refresh" content="60">
<title>ATIS Line Analytics</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; color: #333; padding: 20px; }
  h1 { margin-bottom: 20px; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 24px; }
  .card { background: #fff; border-radius: 8px; padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  .card .label { font-size: 0.8em; color: #666; margin-bottom: 4px; }
  .card .value { font-size: 1.6em; font-weight: 700; }
  .card .sub { font-size: 0.75em; color: #999; margin-top: 2px; }
  .charts { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 20px; margin-bottom: 24px; }
  .chart-box { background: #fff; border-radius: 8px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  .cost-section { background: #fff; border-radius: 8px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 24px; }
  .cost-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-top: 12px; }
  .cost-item { padding: 12px; background: #f9f9f9; border-radius: 6px; }
  .cost-item .cost-label { font-size: 0.8em; color: #666; }
  .cost-item .cost-value { font-size: 1.3em; font-weight: 700; color: #059669; }
  .cost-item .sub { font-size: 0.75em; color: #999; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  th, td { padding: 10px 14px; text-align: left; border-bottom: 1px solid #eee; }
  th { background: #f9f9f9; font-weight: 600; font-size: 0.85em; color: #666; }
  td { font-size: 0.9em; }
  h2 { margin-bottom: 12px; font-size: 1.1em; }
  @media (max-width: 600px) {
    body { padding: 12px; }
    .cards { grid-template-columns: repeat(2, 1fr); gap: 8px; }
    .charts { grid-template-columns: 1fr; }
    .cost-grid { grid-template-columns: 1fr 1fr; }
    .card .value { font-size: 1.3em; }
  }
</style>
</head>
<body>
<h1>ATIS Line Analytics</h1>

<div class="cards">
  <div class="card"><div class="label">Today</div><div class="value">${stats.todayCalls}</div></div>
  <div class="card"><div class="label">This Week</div><div class="value">${stats.weekCalls}</div></div>
  <div class="card"><div class="label">All Time</div><div class="value">${stats.totalCalls}</div></div>
  <div class="card"><div class="label">Avg Duration</div><div class="value">${stats.avgDuration}s</div></div>
  <div class="card"><div class="label">Monthly Run Rate</div><div class="value">${monthlyRunRate}</div><div class="sub">calls/month projected</div></div>
  <div class="card"><div class="label">Unique Callers</div><div class="value">${uniqueCallersTotal}</div></div>
  <div class="card"><div class="label">Peak Hour</div><div class="value">${peakHour}:00</div><div class="sub">${peakHourCalls} calls</div></div>
  <div class="card"><div class="label">Avg Lookups/Call</div><div class="value">${avgLookupsPerCall}</div></div>
  <div class="card"><div class="label">Today: New Callers</div><div class="value">${newCallers}</div></div>
  <div class="card"><div class="label">Today: Returning</div><div class="value">${returningCallers}</div></div>
</div>

<div class="cost-section">
  <h2>Cost Breakdown</h2>
  <div class="cost-grid">
    <div class="cost-item"><div class="cost-label">Daily Twilio</div><div class="cost-value">\$${cb.dailyTwilio.toFixed(2)}</div></div>
    <div class="cost-item"><div class="cost-label">Daily OpenAI</div><div class="cost-value">\$${cb.dailyOpenAi.toFixed(2)}</div></div>
    <div class="cost-item"><div class="cost-label">Daily ElevenLabs</div><div class="cost-value">\$${cb.dailyElevenLabs.toFixed(2)}</div><div class="sub">${(cb.dailyElevenLabsCredits || 0).toLocaleString()} credits/day</div></div>
    <div class="cost-item"><div class="cost-label">Daily Total</div><div class="cost-value">\$${cb.dailyTotal.toFixed(2)}</div></div>
    <div class="cost-item"><div class="cost-label">Cost per Call</div><div class="cost-value">\$${cb.costPerCall.toFixed(4)}</div></div>
    <div class="cost-item"><div class="cost-label">Monthly Twilio</div><div class="cost-value">\$${cb.monthlyTwilio.toFixed(2)}</div></div>
    <div class="cost-item"><div class="cost-label">Monthly OpenAI</div><div class="cost-value">\$${cb.monthlyOpenAi.toFixed(2)}</div></div>
    <div class="cost-item"><div class="cost-label">Monthly ElevenLabs</div><div class="cost-value">\$${cb.monthlyElevenLabs.toFixed(2)}</div><div class="sub">${(cb.monthlyElevenLabsCredits || 0).toLocaleString()} / ${(cb.elevenLabsMonthlyCredits || 0).toLocaleString()} credits (${cb.elevenLabsCreditUtilization || 0}%)</div></div>
    <div class="cost-item"><div class="cost-label">Projected Monthly Total</div><div class="cost-value">\$${cb.monthlyTotal.toFixed(2)}</div></div>
  </div>
</div>

<div class="charts">
  <div class="chart-box">
    <h2>Calls per Hour</h2>
    <canvas id="hourlyChart"></canvas>
  </div>
  <div class="chart-box">
    <h2>Top Airports</h2>
    <canvas id="airportChart"></canvas>
  </div>
  <div class="chart-box">
    <h2>Region Distribution</h2>
    <canvas id="regionChart"></canvas>
  </div>
  <div class="chart-box">
    <h2>Unique Callers per Day</h2>
    <canvas id="callersChart"></canvas>
  </div>
  <div class="chart-box">
    <h2>Peak Hours Heatmap</h2>
    <canvas id="heatmapChart"></canvas>
  </div>
  <div class="chart-box">
    <h2>New vs Returning Callers (Today)</h2>
    <canvas id="callerTypeChart"></canvas>
  </div>
</div>

<h2>Recent Calls</h2>
<table>
  <thead><tr><th>Time</th><th>Airport</th><th>Region</th><th>Duration</th><th>Caller</th></tr></thead>
  <tbody>
    ${stats.recentCalls.map(c => `<tr>
      <td>${new Date(c.timestamp).toLocaleString()}</td>
      <td>${c.airport || '\u2014'}</td>
      <td>${c.region != null ? c.region : '\u2014'}</td>
      <td>${c.duration != null ? c.duration + 's' : '\u2014'}</td>
      <td>${c.caller || '\u2014'}</td>
    </tr>`).join('\n    ')}
  </tbody>
</table>

<script>
new Chart(document.getElementById('hourlyChart'), {
  type: 'line',
  data: {
    labels: ${JSON.stringify(Array.from({ length: 24 }, (_, i) => i + ':00'))},
    datasets: [{ label: 'Calls', data: ${JSON.stringify(stats.hourlyData)}, borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.1)', fill: true, tension: 0.3 }]
  },
  options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
});

new Chart(document.getElementById('airportChart'), {
  type: 'bar',
  data: {
    labels: ${JSON.stringify(airportLabels)},
    datasets: [{ label: 'Calls', data: ${JSON.stringify(airportValues)}, backgroundColor: '#3b82f6' }]
  },
  options: { responsive: true, indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } } }
});

new Chart(document.getElementById('regionChart'), {
  type: 'pie',
  data: {
    labels: ${JSON.stringify(regionLabels)},
    datasets: [{ data: ${JSON.stringify(regionValues)}, backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'] }]
  },
  options: { responsive: true }
});

new Chart(document.getElementById('callersChart'), {
  type: 'line',
  data: {
    labels: ${JSON.stringify(callerDayLabels)},
    datasets: [{ label: 'Unique Callers', data: ${JSON.stringify(callerDayValues)}, borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)', fill: true, tension: 0.3 }]
  },
  options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
});

new Chart(document.getElementById('heatmapChart'), {
  type: 'bar',
  data: {
    labels: ${JSON.stringify(Array.from({ length: 24 }, (_, i) => i + ':00'))},
    datasets: [{ label: 'Calls', data: ${JSON.stringify(stats.hourlyData)}, backgroundColor: ${JSON.stringify(stats.hourlyData.map(v => {
      const max = Math.max(...stats.hourlyData, 1);
      const intensity = Math.round((v / max) * 200 + 55);
      return 'rgba(' + intensity + ', ' + Math.round(intensity * 0.4) + ', 50, 0.8)';
    }))} }]
  },
  options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
});

new Chart(document.getElementById('callerTypeChart'), {
  type: 'doughnut',
  data: {
    labels: ['New Callers', 'Returning Callers'],
    datasets: [{ data: [${newCallers}, ${returningCallers}], backgroundColor: ['#3b82f6', '#f59e0b'] }]
  },
  options: { responsive: true }
});
</script>
</body>
</html>`;
}

module.exports = { readAnalytics, computeStats, renderDashboard, ANALYTICS_PATH, COST_DEFAULTS };
