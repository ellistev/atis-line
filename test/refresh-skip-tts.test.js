const { describe, it, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// We need to intercept modules before server.js loads them.
// Monkey-patch the required modules by pre-loading and replacing their exports.

// Pre-load and patch humanize
const humanizeMod = require('../src/speech/humanize');
const originalHumanize = humanizeMod.humanizeAtis;
let humanizeCallCount = 0;
humanizeMod.humanizeAtis = async (raw, name) => {
  humanizeCallCount++;
  return `Humanized ATIS for ${name}`;
};

// Pre-load and patch aeroview scraper
const aeroviewMod = require('../src/data/aeroview');
let scrapeAllImpl = async () => new Map();
aeroviewMod.scrapeAll = async (...args) => scrapeAllImpl(...args);
aeroviewMod.closeBrowser = async () => {};

// Pre-load and patch TTS
const ttsMod = require('../src/audio/tts');
let generateAudioCallCount = 0;
const origGenerateAudio = ttsMod.generateAudio;
ttsMod.generateAudio = async (text, file) => {
  generateAudioCallCount++;
  return true;
};

// Pre-load and patch alerter
const alerterMod = require('../src/monitoring/alerter');
alerterMod.recordSuccess = () => {};
alerterMod.recordFailure = () => {};
alerterMod.checkAlerts = async () => {};

// Pre-load and patch analytics logger
const loggerMod = require('../src/analytics/logger');
loggerMod.logCall = () => {};

// Now require server (will use patched modules from require cache)
const { refreshAtisData } = require('../server');
const { getCache, resetCache } = require('../src/audio/cache-manager');

describe('refreshAtisData skips TTS when letter unchanged', () => {
  beforeEach(() => {
    resetCache();
    humanizeCallCount = 0;
    generateAudioCallCount = 0;
  });

  it('calls humanizeAtis on first scrape (no cache)', async () => {
    const results = new Map();
    results.set('CYPK', { raw: 'CYPK 181953Z 27015KT P6SM CLR', letter: 'B' });
    scrapeAllImpl = async () => results;

    await refreshAtisData();

    assert.equal(humanizeCallCount, 1, 'humanizeAtis should be called once per airport with data');
    assert.equal(generateAudioCallCount, 1, 'generateAudio should be called once');
  });

  it('skips humanizeAtis when ATIS letter is unchanged', async () => {
    // First scrape — letter B
    const results1 = new Map();
    results1.set('CYPK', { raw: 'CYPK 181953Z 27015KT P6SM CLR', letter: 'B' });
    scrapeAllImpl = async () => results1;
    await refreshAtisData();

    humanizeCallCount = 0;
    generateAudioCallCount = 0;

    // Second scrape — same letter B
    const results2 = new Map();
    results2.set('CYPK', { raw: 'CYPK 182053Z 28010KT P6SM CLR', letter: 'B' });
    scrapeAllImpl = async () => results2;
    await refreshAtisData();

    assert.equal(humanizeCallCount, 0, 'humanizeAtis should NOT be called when letter unchanged');
    assert.equal(generateAudioCallCount, 0, 'generateAudio should NOT be called when letter unchanged');
  });

  it('calls humanizeAtis when ATIS letter changes', async () => {
    // First scrape — letter B
    const results1 = new Map();
    results1.set('CYPK', { raw: 'CYPK 181953Z 27015KT P6SM CLR', letter: 'B' });
    scrapeAllImpl = async () => results1;
    await refreshAtisData();

    humanizeCallCount = 0;
    generateAudioCallCount = 0;

    // Second scrape — letter C (changed)
    const results2 = new Map();
    results2.set('CYPK', { raw: 'CYPK 182053Z 28010KT P6SM CLR', letter: 'C' });
    scrapeAllImpl = async () => results2;
    await refreshAtisData();

    assert.equal(humanizeCallCount, 1, 'humanizeAtis should be called when letter changes');
  });

  it('updates updatedAt timestamp even when skipping TTS', async () => {
    // First scrape
    const results1 = new Map();
    results1.set('CYPK', { raw: 'CYPK 181953Z 27015KT P6SM CLR', letter: 'B' });
    scrapeAllImpl = async () => results1;
    await refreshAtisData();

    const firstUpdatedAt = getCache('CYPK').updatedAt;

    // Small delay to ensure timestamp differs
    await new Promise(r => setTimeout(r, 10));

    // Second scrape — same letter
    const results2 = new Map();
    results2.set('CYPK', { raw: 'CYPK 182053Z 28010KT P6SM CLR', letter: 'B' });
    scrapeAllImpl = async () => results2;
    await refreshAtisData();

    const secondUpdatedAt = getCache('CYPK').updatedAt;
    assert.notEqual(firstUpdatedAt, secondUpdatedAt, 'updatedAt should be refreshed even when TTS is skipped');
  });

  it('logs skip message when letter is unchanged', async () => {
    // First scrape
    const results1 = new Map();
    results1.set('CYPK', { raw: 'CYPK 181953Z 27015KT P6SM CLR', letter: 'B' });
    scrapeAllImpl = async () => results1;
    await refreshAtisData();

    // Capture logs on second scrape
    const logged = [];
    const originalLog = console.log;
    console.log = (...args) => { logged.push(args.join(' ')); };

    const results2 = new Map();
    results2.set('CYPK', { raw: 'CYPK 182053Z 28010KT P6SM CLR', letter: 'B' });
    scrapeAllImpl = async () => results2;
    await refreshAtisData();

    console.log = originalLog;

    const skipMsg = logged.find(m => m.includes('unchanged, skipping TTS'));
    assert.ok(skipMsg, 'should log skip message containing "unchanged, skipping TTS"');
    assert.ok(skipMsg.includes('CYPK'), 'skip message should include ICAO code');
  });
});
