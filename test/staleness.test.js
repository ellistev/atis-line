const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { getStalenessState } = require('../server');

describe('getStalenessState', () => {
  it('returns fresh for data updated less than 2 hours ago', () => {
    const cached = { updatedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString() }; // 30 min ago
    assert.equal(getStalenessState(cached), 'fresh');
  });

  it('returns stale for data updated 2-6 hours ago', () => {
    const cached = { updatedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString() }; // 3 hours ago
    assert.equal(getStalenessState(cached), 'stale');
  });

  it('returns stale at exactly 2 hours', () => {
    const cached = { updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() };
    assert.equal(getStalenessState(cached), 'stale');
  });

  it('returns unavailable for data older than 6 hours', () => {
    const cached = { updatedAt: new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString() }; // 7 hours ago
    assert.equal(getStalenessState(cached), 'unavailable');
  });

  it('returns unavailable at exactly 6 hours', () => {
    const cached = { updatedAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString() };
    assert.equal(getStalenessState(cached), 'unavailable');
  });

  it('returns unavailable when updatedAt is null', () => {
    assert.equal(getStalenessState({ updatedAt: null }), 'unavailable');
  });

  it('returns unavailable when updatedAt is missing', () => {
    assert.equal(getStalenessState({}), 'unavailable');
  });

  it('returns unavailable when cached is null', () => {
    assert.equal(getStalenessState(null), 'unavailable');
  });

  it('returns unavailable when cached is undefined', () => {
    assert.equal(getStalenessState(undefined), 'unavailable');
  });
});
