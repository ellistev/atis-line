/**
 * NAV CANADA Aeroview scraper
 * Scrapes D-ATIS from https://spaces.navcanada.ca/workspace/aeroview/{ICAO}
 *
 * Two modes:
 *  - CDP mode (default on Windows dev): connects to OpenClaw's managed Chrome
 *    at CDP_URL (127.0.0.1:18792) which holds NAV CANADA session cookies.
 *  - Headless mode (production/Linux): launches its own Chromium. Aeroview
 *    shows weather data to unauthenticated users - login only needed for some
 *    features, not the ATIS block itself.
 *
 * Set CDP_URL=disabled to force headless mode even on Windows.
 */

const { chromium } = require('playwright');

const CDP_URL = process.env.CDP_URL || 'http://127.0.0.1:18792';
const USE_CDP = CDP_URL !== 'disabled';
let _browser = null;

async function getBrowser() {
  if (_browser) {
    try {
      if (_browser.isConnected()) {
        // Health check: try a simple operation to verify the browser is responsive
        await Promise.race([
          _browser.contexts(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('health check timeout')), 3000)),
        ]);
        return _browser;
      }
    } catch (err) {
      console.warn(`[Aeroview] Browser unresponsive (${err.message}), recreating...`);
      await closeBrowser();
    }
  }
  if (USE_CDP) {
    try {
      _browser = await chromium.connectOverCDP(CDP_URL);
      return _browser;
    } catch (err) {
      console.warn(`[Aeroview] CDP connect failed (${err.message}), falling back to headless`);
    }
  }
  // Headless fallback - works on Linux servers
  _browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  return _browser;
}

/** Close the browser instance gracefully. Called on process shutdown. */
async function closeBrowser() {
  const browser = _browser;
  _browser = null;
  if (browser) {
    try {
      await browser.close();
    } catch {
      // already dead, ignore
    }
  }
}

/**
 * Scrape ATIS for a single airport from NAV CANADA Aeroview.
 * Returns { raw, letter } or null on failure.
 */
async function scrapeAeroview(icao) {
  let browser;
  try {
    browser = await getBrowser();
  } catch (err) {
    console.error(`[Aeroview] ${icao} browser launch failed:`, err.message);
    return null;
  }
  // connectOverCDP uses existing contexts - open a fresh page in the first context
  let context, page;
  try {
    context = browser.contexts()[0] || await browser.newContext();
    page = await context.newPage();
  } catch (err) {
    // Browser died between getBrowser() and page creation - reset and bail
    console.warn(`[Aeroview] ${icao} browser died during page setup, resetting:`, err.message);
    await closeBrowser();
    return null;
  }
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
    // If the browser crashed mid-scrape, reset so next call gets a fresh one
    if (!_browser || !_browser.isConnected()) {
      await closeBrowser();
    }
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

module.exports = { scrapeAeroview, scrapeAll, closeBrowser, getBrowser };
