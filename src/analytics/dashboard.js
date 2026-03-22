const fs = require('node:fs');
const path = require('node:path');

const ANALYTICS_PATH = path.join(__dirname, '..', '..', 'analytics.jsonl');

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
function computeStats(entries, now = new Date()) {
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
  }

  // Top airports sorted by count descending
  const topAirports = Object.entries(airportCounts)
    .sort((a, b) => b[1] - a[1]);

  // Hours 0-23
  const hourlyData = Array.from({ length: 24 }, (_, i) => hourCounts[i] || 0);

  // Recent calls (last 20, newest first)
  const recentCalls = entries.slice(-20).reverse();

  return {
    totalCalls: entries.length,
    todayCalls,
    weekCalls,
    avgDuration: durationCount > 0 ? Math.round(totalDuration / durationCount) : 0,
    topAirports,
    hourlyData,
    regionCounts,
    recentCalls,
  };
}

/**
 * Generate the dashboard HTML page.
 */
function renderDashboard(stats) {
  const regionLabels = Object.keys(stats.regionCounts).map(r => `Region ${r}`);
  const regionValues = Object.values(stats.regionCounts);
  const airportLabels = stats.topAirports.map(([code]) => code);
  const airportValues = stats.topAirports.map(([, count]) => count);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ATIS Line Analytics</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; color: #333; padding: 20px; }
  h1 { margin-bottom: 20px; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 24px; }
  .card { background: #fff; border-radius: 8px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  .card .label { font-size: 0.85em; color: #666; margin-bottom: 4px; }
  .card .value { font-size: 1.8em; font-weight: 700; }
  .charts { display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 20px; margin-bottom: 24px; }
  .chart-box { background: #fff; border-radius: 8px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  th, td { padding: 10px 14px; text-align: left; border-bottom: 1px solid #eee; }
  th { background: #f9f9f9; font-weight: 600; font-size: 0.85em; color: #666; }
  td { font-size: 0.9em; }
  h2 { margin-bottom: 12px; font-size: 1.1em; }
</style>
</head>
<body>
<h1>ATIS Line Analytics</h1>

<div class="cards">
  <div class="card"><div class="label">Today</div><div class="value">${stats.todayCalls}</div></div>
  <div class="card"><div class="label">This Week</div><div class="value">${stats.weekCalls}</div></div>
  <div class="card"><div class="label">All Time</div><div class="value">${stats.totalCalls}</div></div>
  <div class="card"><div class="label">Avg Duration</div><div class="value">${stats.avgDuration}s</div></div>
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
</div>

<h2>Recent Calls</h2>
<table>
  <thead><tr><th>Time</th><th>Airport</th><th>Region</th><th>Duration</th><th>Caller</th></tr></thead>
  <tbody>
    ${stats.recentCalls.map(c => `<tr>
      <td>${new Date(c.timestamp).toLocaleString()}</td>
      <td>${c.airport || '—'}</td>
      <td>${c.region != null ? c.region : '—'}</td>
      <td>${c.duration != null ? c.duration + 's' : '—'}</td>
      <td>${c.caller || '—'}</td>
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
  options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
});

new Chart(document.getElementById('regionChart'), {
  type: 'pie',
  data: {
    labels: ${JSON.stringify(regionLabels)},
    datasets: [{ data: ${JSON.stringify(regionValues)}, backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'] }]
  },
  options: { responsive: true }
});
</script>
</body>
</html>`;
}

module.exports = { readAnalytics, computeStats, renderDashboard, ANALYTICS_PATH };
