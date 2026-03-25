const { loadAirports, getRegions } = require('../config/airports');

/**
 * Load regions dynamically from airports.json for the landing page.
 */
function getRegionData() {
  const airports = loadAirports();
  return getRegions(airports);
}

/**
 * Render the public landing page HTML.
 * @param {object} regions - Output of getRegions()
 * @returns {string} HTML
 */
function renderLandingPage(regions) {
  const regionEntries = Object.entries(regions).sort(([a], [b]) => a.localeCompare(b));

  const regionSections = regionEntries.map(([, r]) => {
    const airportRows = r.airports
      .map(a => {
        const sourceLabel = a.source === 'metar' ? 'METAR' : 'D-ATIS';
        return `<li><strong>${a.icao}</strong> &mdash; ${a.name} <span class="source">${sourceLabel}</span></li>`;
      })
      .join('\n            ');
    return `
        <div class="region-card">
          <h3>${r.region}</h3>
          <ul>
            ${airportRows}
          </ul>
        </div>`;
  }).join('\n');

  const totalAirports = regionEntries.reduce((sum, [, r]) => sum + r.airports.length, 0);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ATIS Line &mdash; Free Aviation Weather by Phone</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: #0b1929;
    color: #e0e7ef;
    line-height: 1.6;
  }
  a { color: #60a5fa; text-decoration: none; }
  a:hover { text-decoration: underline; }

  .hero {
    text-align: center;
    padding: 60px 20px 40px;
    background: linear-gradient(135deg, #0f2744 0%, #1a365d 100%);
    border-bottom: 2px solid #1e3a5f;
  }
  .hero h1 {
    font-size: 2.4em;
    font-weight: 700;
    color: #fff;
    margin-bottom: 8px;
    letter-spacing: -0.5px;
  }
  .hero .tagline {
    font-size: 1.1em;
    color: #94a3b8;
    margin-bottom: 24px;
  }
  .phone-number {
    display: inline-block;
    font-size: 1.8em;
    font-weight: 700;
    color: #60a5fa;
    background: rgba(96, 165, 250, 0.1);
    border: 2px solid #60a5fa;
    border-radius: 12px;
    padding: 12px 32px;
    letter-spacing: 1px;
  }
  .phone-number a { color: #60a5fa; }

  .container {
    max-width: 960px;
    margin: 0 auto;
    padding: 40px 20px;
  }

  section { margin-bottom: 40px; }
  section h2 {
    font-size: 1.4em;
    color: #fff;
    margin-bottom: 16px;
    padding-bottom: 8px;
    border-bottom: 1px solid #1e3a5f;
  }

  .how-it-works ol {
    padding-left: 24px;
    color: #cbd5e1;
  }
  .how-it-works li {
    margin-bottom: 8px;
  }

  .regions-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 16px;
  }
  .region-card {
    background: #1e293b;
    border-radius: 8px;
    padding: 20px;
    border: 1px solid #334155;
  }
  .region-card h3 {
    color: #60a5fa;
    margin-bottom: 12px;
    font-size: 1.1em;
  }
  .region-card ul {
    list-style: none;
    padding: 0;
  }
  .region-card li {
    padding: 4px 0;
    color: #cbd5e1;
    font-size: 0.95em;
  }
  .source {
    font-size: 0.75em;
    color: #64748b;
    background: #0f172a;
    padding: 2px 6px;
    border-radius: 4px;
    margin-left: 4px;
  }

  .info-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 16px;
  }
  .info-card {
    background: #1e293b;
    border-radius: 8px;
    padding: 20px;
    border: 1px solid #334155;
  }
  .info-card h3 {
    color: #fff;
    margin-bottom: 8px;
    font-size: 1em;
  }
  .info-card p {
    color: #94a3b8;
    font-size: 0.9em;
  }

  .stats {
    display: flex;
    gap: 24px;
    justify-content: center;
    margin-top: 16px;
    flex-wrap: wrap;
  }
  .stat {
    text-align: center;
  }
  .stat .num {
    font-size: 2em;
    font-weight: 700;
    color: #60a5fa;
  }
  .stat .label {
    font-size: 0.85em;
    color: #64748b;
  }

  footer {
    text-align: center;
    padding: 24px 20px;
    color: #475569;
    font-size: 0.85em;
    border-top: 1px solid #1e3a5f;
  }
  footer a { color: #64748b; }

  @media (max-width: 600px) {
    .hero { padding: 40px 16px 30px; }
    .hero h1 { font-size: 1.8em; }
    .phone-number { font-size: 1.3em; padding: 10px 20px; }
    .container { padding: 24px 16px; }
    .regions-grid { grid-template-columns: 1fr; }
    .info-grid { grid-template-columns: 1fr; }
    .stats { gap: 16px; }
  }
</style>
</head>
<body>

<div class="hero">
  <h1>ATIS Line</h1>
  <p class="tagline">Free phone-based aviation weather for Canadian pilots</p>
  <div class="phone-number"><a href="tel:+17782005935">+1 (778) 200-5935</a></div>
  <div class="stats">
    <div class="stat"><div class="num">${regionEntries.length}</div><div class="label">Regions</div></div>
    <div class="stat"><div class="num">${totalAirports}</div><div class="label">Airports</div></div>
  </div>
</div>

<div class="container">
  <section class="how-it-works">
    <h2>How It Works</h2>
    <ol>
      <li>Call <strong>+1 (778) 200-5935</strong></li>
      <li>Pick your region (Lower Mainland, Victoria, North Coast, or Interior)</li>
      <li>Pick your airport to hear the latest weather</li>
    </ol>
  </section>

  <section>
    <h2>Supported Airports</h2>
    <div class="regions-grid">
      ${regionSections}
    </div>
  </section>

  <section>
    <h2>About the Service</h2>
    <div class="info-grid">
      <div class="info-card">
        <h3>Data Sources</h3>
        <p>D-ATIS airports use NAV CANADA Aeroview data. METAR airports use Aviation Weather Center observations. All data is converted to natural speech.</p>
      </div>
      <div class="info-card">
        <h3>Refresh Frequency</h3>
        <p>All airports are checked every 15 minutes. D-ATIS airports update when a new ATIS letter is issued. METAR airports update when weather conditions change.</p>
      </div>
      <div class="info-card">
        <h3>Coming Soon</h3>
        <p>More regions and airports are being added. Have a suggestion? We&rsquo;re always looking to expand coverage across Canada.</p>
      </div>
    </div>
  </section>
</div>

<footer>
  <a href="/analytics">Analytics Dashboard</a>
  &middot; Not affiliated with NAV CANADA &middot; Not official aviation weather
</footer>

</body>
</html>`;
}

module.exports = { renderLandingPage, getRegionData };
