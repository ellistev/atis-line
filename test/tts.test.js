const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { generateAudio, getTwilioVoice, TTS_PROVIDER } = require('../src/audio/tts');

describe('tts', () => {
  describe('TTS_PROVIDER', () => {
    it('defaults to polly', () => {
      // Unless TTS_PROVIDER env var is set, default is polly
      assert.equal(TTS_PROVIDER, process.env.TTS_PROVIDER || 'polly');
    });
  });

  describe('generateAudio', () => {
    it('returns false for polly provider (no file generated)', async () => {
      const result = await generateAudio('test text', '/tmp/test.mp3');
      // Default polly provider does not generate files — Twilio <Say> handles it
      if (TTS_PROVIDER === 'polly') {
        assert.equal(result, false);
      }
    });
  });

  describe('getTwilioVoice', () => {
    it('returns Polly.Joanna voice config', () => {
      const voice = getTwilioVoice();
      assert.equal(voice.voice, 'Polly.Joanna');
      assert.equal(voice.language, 'en-US');
    });
  });
});
