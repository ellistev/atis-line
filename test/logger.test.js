const { describe, it, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');

describe('logger', () => {
  let logger;
  let originalInfo, originalWarn, originalError;

  beforeEach(() => {
    originalInfo = console.info;
    originalWarn = console.warn;
    originalError = console.error;
    console.info = mock.fn();
    console.warn = mock.fn();
    console.error = mock.fn();
    // Re-require to get fresh module with mocked console
    delete require.cache[require.resolve('../src/logger')];
    logger = require('../src/logger');
  });

  afterEach(() => {
    console.info = originalInfo;
    console.warn = originalWarn;
    console.error = originalError;
  });

  it('info delegates to console.info', () => {
    logger.info('test message', 42);
    assert.equal(console.info.mock.calls.length, 1);
    assert.deepEqual(console.info.mock.calls[0].arguments, ['test message', 42]);
  });

  it('warn delegates to console.warn', () => {
    logger.warn('warning!');
    assert.equal(console.warn.mock.calls.length, 1);
    assert.deepEqual(console.warn.mock.calls[0].arguments, ['warning!']);
  });

  it('error delegates to console.error', () => {
    logger.error('err', { code: 500 });
    assert.equal(console.error.mock.calls.length, 1);
    assert.deepEqual(console.error.mock.calls[0].arguments, ['err', { code: 500 }]);
  });
});
