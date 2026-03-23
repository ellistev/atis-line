const { writeFile } = require('node:fs/promises');

/**
 * TTS provider abstraction.
 *
 * 'polly'      - Twilio <Say voice="Polly.Joanna"> at call time. Free, government-robot voice.
 * 'openai'     - OpenAI TTS nova voice. ~$0.015/1K chars. Requires OPENAI_API_KEY.
 * 'elevenlabs' - ElevenLabs Rachel voice. Warm, human, realistic. Requires ELEVENLABS_API_KEY.
 *                Only generates audio when ATIS letter changes - very cheap in practice.
 */

const TTS_PROVIDER = process.env.TTS_PROVIDER || 'polly';

/** ElevenLabs premade voice pool — all included with the plan, no extra cost. */
const VOICE_POOL = [
  { id: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica' },
  { id: 'CwhRBWXzGAHq8TQ4Fs17', name: 'Roger' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George' },
  { id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel' },
  { id: 'cjVigY5qzO86Huf0OWal', name: 'Eric' },
  { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian' },
  { id: 'pqHfZKP75CvOlQylNhV4', name: 'Bill' },
];

/**
 * Pick a random voice from the pool.
 * Falls back to ELEVENLABS_VOICE_ID env var (or Sarah) if pool is empty.
 */
function pickVoice(pool) {
  if (pool && pool.length > 0) {
    return pool[Math.floor(Math.random() * pool.length)];
  }
  const fallbackId = process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL';
  return { id: fallbackId, name: 'default' };
}

/**
 * Generate an audio file from text using the configured TTS provider.
 *
 * @param {string} text - The speech text to convert
 * @param {string} outputPath - Where to write the MP3 file
 * @returns {Promise<boolean>} true if a file was generated, false if using <Say> fallback
 */
async function generateAudio(text, outputPath) {
  if (TTS_PROVIDER === 'elevenlabs') {
    return generateElevenLabs(text, outputPath);
  }
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
 * Generate audio via ElevenLabs TTS API.
 * Uses Rachel voice (21m00Tcm4TlvDq8ikWAM) - warm, professional, human-sounding.
 */
async function generateElevenLabs(text, outputPath) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.error('ELEVENLABS_API_KEY not set, falling back to Polly');
    return false;
  }

  const voice = pickVoice(VOICE_POOL);
  console.log(`[TTS] generated with voice: ${voice.name}`);

  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice.id}`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_turbo_v2',
        voice_settings: {
          stability: 0.75,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true,
        },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`ElevenLabs TTS error: ${res.status} ${err}`);
      // Quota exceeded or any error - fall back to OpenAI
      console.log('Falling back to OpenAI TTS...');
      return generateOpenAI(text, outputPath);
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    await writeFile(outputPath, buffer);
    return true;
  } catch (err) {
    console.error(`ElevenLabs TTS failed: ${err.message}`);
    console.log('Falling back to OpenAI TTS...');
    return generateOpenAI(text, outputPath);
  }
}

/**
 * Get the TTS voice config for Twilio <Say> fallback.
 * Polly.Joanna = that classic government ATIS robot voice. Intentional.
 */
function getTwilioVoice() {
  return { voice: 'Polly.Joanna', language: 'en-US' };
}

module.exports = {
  generateAudio,
  getTwilioVoice,
  TTS_PROVIDER,
  VOICE_POOL,
  pickVoice,
};
