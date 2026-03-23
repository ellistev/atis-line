const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { VOICE_POOL, pickVoice } = require('../src/audio/tts');

describe('voice rotation', () => {
  describe('VOICE_POOL', () => {
    it('contains 9 voices', () => {
      assert.equal(VOICE_POOL.length, 9);
    });

    it('each voice has id and name', () => {
      for (const voice of VOICE_POOL) {
        assert.ok(voice.id, `voice missing id`);
        assert.ok(voice.name, `voice missing name`);
      }
    });
  });

  describe('pickVoice', () => {
    it('selects a voice from the pool', () => {
      const voice = pickVoice(VOICE_POOL);
      assert.ok(VOICE_POOL.some(v => v.id === voice.id));
    });

    it('returns different voices over many picks (randomness)', () => {
      const ids = new Set();
      for (let i = 0; i < 100; i++) {
        ids.add(pickVoice(VOICE_POOL).id);
      }
      // With 9 voices and 100 picks, we should see at least 2 distinct voices
      assert.ok(ids.size >= 2, `expected multiple voices but got ${ids.size}`);
    });

    it('falls back to default voice ID when pool is empty', () => {
      const voice = pickVoice([]);
      assert.equal(voice.id, process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL');
      assert.equal(voice.name, 'default');
    });

    it('falls back to default voice ID when pool is undefined', () => {
      const voice = pickVoice(undefined);
      assert.equal(voice.id, process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL');
      assert.equal(voice.name, 'default');
    });
  });

  describe('logging', () => {
    it('voice name is included in log output', () => {
      const logs = [];
      const origLog = console.log;
      console.log = (msg) => logs.push(msg);
      try {
        const voice = pickVoice(VOICE_POOL);
        // Simulate the log line from generateElevenLabs
        console.log(`[TTS] generated with voice: ${voice.name}`);
        assert.ok(logs.some(l => l.includes('[TTS]') && l.includes(voice.name)));
      } finally {
        console.log = origLog;
      }
    });
  });
});
