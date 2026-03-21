const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  SIGN_OFFS,
  AVIATION_JOKES,
  ABOUT_TEXT,
  getRandomSignOff,
  getRandomJoke,
} = require('../src/personality');

describe('Personality', () => {
  describe('SIGN_OFFS', () => {
    it('has multiple sign-offs', () => {
      assert.ok(SIGN_OFFS.length >= 3, 'should have at least 3 sign-offs');
    });

    it('sign-offs are non-empty strings', () => {
      for (const signOff of SIGN_OFFS) {
        assert.equal(typeof signOff, 'string');
        assert.ok(signOff.length > 0);
      }
    });
  });

  describe('AVIATION_JOKES', () => {
    it('has multiple jokes', () => {
      assert.ok(AVIATION_JOKES.length >= 3, 'should have at least 3 jokes');
    });

    it('jokes are non-empty strings', () => {
      for (const joke of AVIATION_JOKES) {
        assert.equal(typeof joke, 'string');
        assert.ok(joke.length > 0);
      }
    });
  });

  describe('ABOUT_TEXT', () => {
    it('mentions community project', () => {
      assert.ok(ABOUT_TEXT.includes('community'));
    });

    it('mentions NAV CANADA', () => {
      assert.ok(ABOUT_TEXT.includes('NAV CANADA'));
    });

    it('mentions GA pilots', () => {
      assert.ok(ABOUT_TEXT.includes('GA pilots'));
    });
  });

  describe('getRandomSignOff', () => {
    it('returns a string from SIGN_OFFS', () => {
      const signOff = getRandomSignOff();
      assert.ok(SIGN_OFFS.includes(signOff), `"${signOff}" should be in SIGN_OFFS`);
    });

    it('returns values over multiple calls', () => {
      const seen = new Set();
      for (let i = 0; i < 100; i++) {
        seen.add(getRandomSignOff());
      }
      assert.ok(seen.size > 1, 'should return more than one unique sign-off over 100 calls');
    });
  });

  describe('getRandomJoke', () => {
    it('returns a string from AVIATION_JOKES', () => {
      const joke = getRandomJoke();
      assert.ok(AVIATION_JOKES.includes(joke), `"${joke}" should be in AVIATION_JOKES`);
    });

    it('returns values over multiple calls', () => {
      const seen = new Set();
      for (let i = 0; i < 100; i++) {
        seen.add(getRandomJoke());
      }
      assert.ok(seen.size > 1, 'should return more than one unique joke over 100 calls');
    });
  });
});
