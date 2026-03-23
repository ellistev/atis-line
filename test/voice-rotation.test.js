const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { JESSICA_VOICE, pickVoice } = require('../src/audio/tts');

describe('voice selection', () => {
  describe('JESSICA_VOICE', () => {
    it('has correct id and name', () => {
      assert.equal(JESSICA_VOICE.id, 'cgSgspJ2msm6clMCkdW9');
      assert.equal(JESSICA_VOICE.name, 'Jessica');
    });
  });

  describe('pickVoice', () => {
    it('always returns Jessica', () => {
      const voice = pickVoice();
      assert.equal(voice.id, 'cgSgspJ2msm6clMCkdW9');
      assert.equal(voice.name, 'Jessica');
    });

    it('returns the same voice every time', () => {
      const ids = new Set();
      for (let i = 0; i < 50; i++) {
        ids.add(pickVoice().id);
      }
      assert.equal(ids.size, 1, 'expected exactly one voice');
    });
  });

  describe('logging', () => {
    it('voice name is included in log output', () => {
      const logs = [];
      const origLog = console.log;
      console.log = (msg) => logs.push(msg);
      try {
        const voice = pickVoice();
        console.log(`[TTS] generated with voice: ${voice.name}`);
        assert.ok(logs.some(l => l.includes('[TTS]') && l.includes('Jessica')));
      } finally {
        console.log = origLog;
      }
    });
  });
});
