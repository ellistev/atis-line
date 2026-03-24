/**
 * Public landing page for ATIS Line.
 * Exports a render function returning an HTML string (same pattern as dashboard.js).
 */

function renderLandingPage(airports, regions) {
  const regionSections = Object.entries(regions)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([digit, r]) => {
      const source = r.airports.every(a => a.source === 'metar') ? 'METAR' : 'D-ATIS';
      const airportItems = r.airports
        .map(a => `<li><span class="icao">${a.icao}</span> ${a.name}</li>`)
        .join('\n              ');
      return `
          <div class="region-card">
            <h3>Press ${digit} — ${r.region} <span class="source-badge">${source}</span></h3>
            <ul>
              ${airportItems}
            </ul>
          </div>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ATIS Line — Free Aviation Weather by Phone</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0a1628;
      color: #e2e8f0;
      line-height: 1.6;
    }
    a { color: #3b82f6; text-decoration: none; }
    a:hover { text-decoration: underline; }

    .hero {
      text-align: center;
      padding: 4rem 1.5rem 3rem;
      background: linear-gradient(180deg, #0f2035 0%, #0a1628 100%);
    }
    .hero h1 {
      font-size: 2.5rem;
      font-weight: 700;
      color: #fff;
      letter-spacing: -0.02em;
    }
    .tagline {
      font-size: 1.15rem;
      color: #94a3b8;
      margin-top: 0.5rem;
      max-width: 480px;
      margin-left: auto;
      margin-right: auto;
    }
    .phone {
      display: inline-block;
      margin-top: 1.5rem;
      font-size: 1.75rem;
      font-weight: 700;
      color: #3b82f6;
      background: rgba(59,130,246,0.1);
      border: 2px solid #3b82f6;
      border-radius: 12px;
      padding: 0.6rem 1.5rem;
      transition: background 0.2s;
    }
    .phone:hover { background: rgba(59,130,246,0.2); text-decoration: none; }

    .container { max-width: 800px; margin: 0 auto; padding: 0 1.5rem; }

    section { padding: 2.5rem 0; }
    section h2 {
      font-size: 1.4rem;
      color: #fff;
      margin-bottom: 1rem;
      padding-bottom: 0.5rem;
      border-bottom: 2px solid #1e3a5f;
    }

    .how-it-works ol {
      list-style: none;
      counter-reset: step;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 1rem;
    }
    .how-it-works li {
      counter-increment: step;
      background: #111d32;
      border-radius: 10px;
      padding: 1.25rem 1rem;
      text-align: center;
    }
    .how-it-works li::before {
      content: counter(step);
      display: block;
      font-size: 1.5rem;
      font-weight: 700;
      color: #3b82f6;
      margin-bottom: 0.3rem;
    }

    .regions-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 1rem;
    }
    .region-card {
      background: #111d32;
      border-radius: 10px;
      padding: 1.25rem;
    }
    .region-card h3 {
      font-size: 1rem;
      color: #fff;
      margin-bottom: 0.75rem;
    }
    .source-badge {
      font-size: 0.7rem;
      font-weight: 600;
      background: #1e3a5f;
      color: #93c5fd;
      padding: 0.15rem 0.5rem;
      border-radius: 4px;
      vertical-align: middle;
    }
    .region-card ul { list-style: none; }
    .region-card li {
      padding: 0.25rem 0;
      font-size: 0.95rem;
      color: #cbd5e1;
    }
    .icao {
      font-family: 'SF Mono', 'Fira Code', monospace;
      font-size: 0.8rem;
      font-weight: 600;
      color: #3b82f6;
      background: rgba(59,130,246,0.1);
      padding: 0.1rem 0.35rem;
      border-radius: 3px;
      margin-right: 0.25rem;
    }

    .info-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 1rem;
    }
    .info-card {
      background: #111d32;
      border-radius: 10px;
      padding: 1.25rem;
    }
    .info-card h3 {
      font-size: 0.95rem;
      color: #3b82f6;
      margin-bottom: 0.5rem;
    }
    .info-card p {
      font-size: 0.9rem;
      color: #94a3b8;
    }

    .coming-soon {
      text-align: center;
      padding: 1.5rem;
      color: #64748b;
      font-style: italic;
    }

    footer {
      text-align: center;
      padding: 2rem 1.5rem;
      border-top: 1px solid #1e3a5f;
      margin-top: 1rem;
      color: #64748b;
      font-size: 0.85rem;
    }
    footer a { margin: 0 0.5rem; }
  </style>
</head>
<body>
  <div class="hero">
    <h1>ATIS Line</h1>
    <p class="tagline">Free phone-based aviation weather for Canadian pilots</p>
    <a class="phone" href="tel:+17782005935">+1 (778) 200-5935</a>
  </div>

  <div class="container">
    <section class="how-it-works">
      <h2>How It Works</h2>
      <ol>
        <li>Call the number</li>
        <li>Pick your region</li>
        <li>Pick your airport</li>
        <li>Hear current weather</li>
      </ol>
    </section>

    <section>
      <h2>Available Airports</h2>
      <div class="regions-grid">
${regionSections}
      </div>
      <p class="coming-soon">More regions coming soon</p>
    </section>

    <section>
      <h2>About the Service</h2>
      <div class="info-grid">
        <div class="info-card">
          <h3>Data Sources</h3>
          <p>NAV CANADA Aeroview D-ATIS for tower airports, plus Aviation Weather Centre METARs for remote stations.</p>
        </div>
        <div class="info-card">
          <h3>Update Frequency</h3>
          <p>Aeroview airports refresh every 15 minutes. METAR airports update hourly.</p>
        </div>
        <div class="info-card">
          <h3>Always Free</h3>
          <p>No signup, no app, no ads. Just call and get your weather.</p>
        </div>
      </div>
    </section>
  </div>

  <footer>
    Built for pilots, by pilots
    <br>
    <a href="/analytics">Analytics Dashboard</a>
  </footer>
</body>
</html>`;
}

module.exports = { renderLandingPage };
