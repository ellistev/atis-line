const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { updateCache, getCache, getAudioUrl, resetCache, hashText } = require('../src/audio/cache-manager');

describe('cache-manager', () => {
  beforeEach(() => {
    resetCache();
  });

  describe('hashText', () => {
    it('produces consistent hashes for the same text', () => {
      const hash1 = hashText('hello');
      const hash2 = hashText('hello');
      assert.equal(hash1, hash2);
    });

    it('produces different hashes for different text', () => {
      const hash1 = hashText('hello');
      const hash2 = hashText('world');
      assert.notEqual(hash1, hash2);
    });

    it('returns a hex string', () => {
      const hash = hashText('test');
      assert.match(hash, /^[0-9a-f]{64}$/);
    });
  });

  describe('updateCache', () => {
    it('creates a cache entry for a new airport', async () => {
      const entry = await updateCache('CYPK', 'Pitt Meadows information Alpha.', 'Alpha');
      assert.equal(entry.speechText, 'Pitt Meadows information Alpha.');
      assert.equal(entry.letter, 'Alpha');
      assert.equal(typeof entry.speechHash, 'string');
      assert.equal(entry.hasAudio, false); // default polly provider
    });

    it('returns same entry when text has not changed', async () => {
      const text = 'Pitt Meadows information Alpha.';
      const entry1 = await updateCache('CYPK', text, 'Alpha');
      const entry2 = await updateCache('CYPK', text, 'Alpha');
      assert.equal(entry1.speechHash, entry2.speechHash);
    });

    it('regenerates when text changes', async () => {
      const entry1 = await updateCache('CYPK', 'info Alpha', 'Alpha');
      const entry2 = await updateCache('CYPK', 'info Bravo', 'Bravo');
      assert.notEqual(entry1.speechHash, entry2.speechHash);
      assert.equal(entry2.letter, 'Bravo');
    });

    it('tracks airports independently', async () => {
      await updateCache('CYPK', 'text A', 'Alpha');
      await updateCache('CZBB', 'text B', 'Alpha');
      const cypk = getCache('CYPK');
      const czbb = getCache('CZBB');
      assert.equal(cypk.speechText, 'text A');
      assert.equal(czbb.speechText, 'text B');
    });
  });

  describe('getCache', () => {
    it('returns undefined for unknown airport', () => {
      assert.equal(getCache('XXXX'), undefined);
    });

    it('returns cached entry after update', async () => {
      await updateCache('CYPK', 'some text', 'Alpha');
      const entry = getCache('CYPK');
      assert.ok(entry);
      assert.equal(entry.speechText, 'some text');
    });
  });

  describe('getAudioUrl', () => {
    it('returns null when no cache exists', () => {
      assert.equal(getAudioUrl('CYPK', 'http://localhost:3338'), null);
    });

    it('returns null when hasAudio is false (polly provider)', async () => {
      await updateCache('CYPK', 'text', 'Alpha');
      assert.equal(getAudioUrl('CYPK', 'http://localhost:3338'), null);
    });
  });

  describe('resetCache', () => {
    it('clears all cached entries', async () => {
      await updateCache('CYPK', 'text', 'Alpha');
      resetCache();
      assert.equal(getCache('CYPK'), undefined);
    });
  });
});
