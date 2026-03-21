const { writeFile } = require('node:fs/promises');

/**
 * TTS provider abstraction.
 *
 * Default: 'polly' — relies on Twilio <Say voice="Polly.Joanna"> at call time (FREE).
 *   No audio file is generated; the server falls back to <Say>.
 *
 * Optional: 'openai' — calls OpenAI TTS API to generate an MP3 file.
 *   Requires OPENAI_API_KEY env var. ~$0.015/1K chars, only on data change.
 */

const TTS_PROVIDER = process.env.TTS_PROVIDER || 'polly';

/**
 * Generate an audio file from text using the configured TTS provider.
 *
 * @param {string} text - The speech text to convert
 * @param {string} outputPath - Where to write the MP3 file
 * @returns {Promise<boolean>} true if a file was generated, false if using <Say> fallback
 */
async function generateAudio(text, outputPath) {
  if (TTS_PROVIDER === 'openai') {
    return generateOpenAI(text, outputPath);
  }
  // Default 'polly': no file generation — Twilio <Say> handles TTS at call time for free
  return false;
}

/**
 * Generate audio via OpenAI TTS API.
 * Only used if TTS_PROVIDER=openai and OPENAI_API_KEY is set.
 */
async function generateOpenAI(text, outputPath) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('OPENAI_API_KEY not set, falling back to Polly');
    return false;
  }

  try {
    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: text,
        voice: 'nova',
        response_format: 'mp3',
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`OpenAI TTS error: ${res.status} ${err}`);
      return false;
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    await writeFile(outputPath, buffer);
    return true;
  } catch (err) {
    console.error(`OpenAI TTS failed: ${err.message}`);
    return false;
  }
}

/**
 * Get the TTS voice config for Twilio <Say> fallback.
 */
function getTwilioVoice() {
  return { voice: 'Polly.Joanna', language: 'en-US' };
}

module.exports = {
  generateAudio,
  getTwilioVoice,
  TTS_PROVIDER,
};
