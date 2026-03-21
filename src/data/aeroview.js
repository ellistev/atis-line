/**
 * NAV CANADA Aeroview scraper
 * Scrapes D-ATIS from https://spaces.navcanada.ca/workspace/aeroview/{ICAO}
 * Uses headless Playwright - works standalone on any server with Chromium installed.
 */

const { chromium } = require('playwright');

let _browser = null;

async function getBrowser() {
  if (_browser && _browser.isConnected()) return _browser;
  _browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  return _browser;
}

/**
 * Scrape ATIS for a single airport from NAV CANADA Aeroview.
 * Returns { raw, letter } or null on failure.
 */
async function scrapeAeroview(icao) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.goto(`https://spaces.navcanada.ca/workspace/aeroview/${icao}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    // Aeroview is a React app - wait for data to render
    await page.waitForTimeout(5000);

    const result = await page.evaluate(() => {
      const bodyText = document.body.innerText;

      // D-ATIS format: "CYPK ARR ATIS O 0250Z ..." or "information Oscar ..."
      // Try to find a block starting with ICAO or "information"
      const patterns = [
        // Full D-ATIS line: ICAO + ATIS + letter + time
        /([A-Z]{4}\s+(?:ARR\s+|DEP\s+)?ATIS\s+[A-Z]\s+\d{4}Z[^\n]*(?:\n[^\n]+)*)/i,
        // Information-style: "information Oscar..."
        /information\s+[A-Za-z]+.*?(?=Advise on initial contact|$)/is,
      ];

      for (const pattern of patterns) {
        const match = bodyText.match(pattern);
        if (match) {
          const text = match[0].trim();
          const letterMatch = text.match(/ATIS\s+([A-Z])\s+\d{4}Z/i) ||
                              text.match(/information\s+([A-Za-z]+)/i);
          const letter = letterMatch ? letterMatch[1].charAt(0).toUpperCase() : null;
          return { raw: text, letter };
        }
      }
      return null;
    });

    return result;
  } catch (err) {
    console.error(`[Aeroview] ${icao} scrape failed:`, err.message);
    return null;
  } finally {
    await page.close().catch(() => {});
  }
}

/**
 * Scrape multiple airports concurrently (max 3 at a time to avoid hammering).
 * Returns Map<icao, { raw, letter }|null>
 */
async function scrapeAll(icaos) {
  const results = new Map();
  const CONCURRENCY = 3;

  for (let i = 0; i < icaos.length; i += CONCURRENCY) {
    const batch = icaos.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(batch.map(icao => scrapeAeroview(icao)));
    settled.forEach((r, idx) => {
      results.set(batch[idx], r.status === 'fulfilled' ? r.value : null);
    });
  }
  return results;
}

module.exports = { scrapeAeroview, scrapeAll };
