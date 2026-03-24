const { createHash } = require('node:crypto');
const path = require('node:path');
const { existsSync } = require('node:fs');
const { mkdir } = require('node:fs/promises');
const { generateAudio } = require('./tts');

const AUDIO_DIR = path.join(__dirname, '..', '..', 'audio');

// Per-airport cache state
// { speechText, speechHash, audioFile, hasAudio, letter }
const cache = new Map();

/**
 * Hash speech text for change detection.
 */
function hashText(text) {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * Update the cache for an airport. Regenerates audio only if the speech text changed.
 *
 * @param {string} icao - Airport ICAO code
 * @param {string} speechText - Formatted ATIS speech text
 * @param {string} letter - Current ATIS letter (e.g., "Bravo")
 * @param {Object} [options] - Optional overrides
 * @param {string} [options.provider] - Force a specific TTS provider ('elevenlabs'|'openai'|'polly')
 * @returns {Promise<Object>} Cache entry { speechText, speechHash, audioFile, hasAudio, letter }
 */
async function updateCache(icao, speechText, letter, options = {}) {
  const newHash = hashText(speechText);
  const existing = cache.get(icao);

  // No change — update timestamp and return existing cache
  if (existing && existing.speechHash === newHash) {
    existing.updatedAt = new Date().toISOString();
    return existing;
  }

  // Data changed — regenerate audio
  await mkdir(AUDIO_DIR, { recursive: true });
  const audioFile = path.join(AUDIO_DIR, `${icao}.mp3`);

  const hasAudio = await generateAudio(speechText, audioFile, { provider: options.provider });
  if (hasAudio) {
    console.log(`${icao} ATIS updated to information ${letter} (audio cached via ${options.provider || 'default'})`);
  } else {
    console.log(`${icao} ATIS updated to information ${letter} (using live TTS)`);
  }

  const entry = {
    speechText,
    speechHash: newHash,
    audioFile,
    hasAudio,
    letter,
    updatedAt: new Date().toISOString(),
  };
  cache.set(icao, entry);
  return entry;
}

/**
 * Get the cached entry for an airport.
 *
 * @param {string} icao - Airport ICAO code
 * @returns {Object|undefined} Cache entry or undefined
 */
function getCache(icao) {
  return cache.get(icao);
}

/**
 * Get the audio URL path for an airport (for Twilio <Play>).
 * Returns null if no cached audio file exists.
 *
 * @param {string} icao - Airport ICAO code
 * @param {string} baseUrl - Server base URL
 * @returns {string|null}
 */
function getAudioUrl(icao, baseUrl) {
  const entry = cache.get(icao);
  if (!entry) {
    // No in-memory cache — fall back to disk check (survives restarts)
    if (!cacheReset) {
      const audioFile = path.join(AUDIO_DIR, `${icao}.mp3`);
      if (existsSync(audioFile)) return `${baseUrl}/audio/${icao}.mp3`;
    }
    return null;
  }
  if (!entry.hasAudio) return null;
  return `${baseUrl}/audio/${icao}.mp3`;
}

/**
 * Clear all cached state (for testing).
 */
function resetCache() {
  cache.clear();
  cacheReset = true;
}

// Track whether cache has been explicitly reset (disables disk fallback)
let cacheReset = false;

module.exports = {
  updateCache,
  getCache,
  getAudioUrl,
  resetCache,
  hashText,
  AUDIO_DIR,
};
