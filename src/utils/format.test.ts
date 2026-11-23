import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatDuration, formatUptime, truncate } from './format.js';

describe('formatDuration', () => {
  it('formats seconds and minutes', () => {
    assert.equal(formatDuration(0), '0:00');
    assert.equal(formatDuration(65_000), '1:05');
    assert.equal(formatDuration(3_661_000), '1:01:01');
  });

  it('is safe for invalid values', () => {
    assert.equal(formatDuration(-5), '0:00');
    assert.equal(formatDuration(Number.NaN), '0:00');
  });
});

describe('truncate', () => {
  it('adds an ellipsis only when needed', () => {
    assert.equal(truncate('PAN BOT', 10), 'PAN BOT');
    assert.equal(truncate('PAN BOT', 4), 'PAN…');
  });
});

describe('formatUptime', () => {
  it('drops zero-valued leading units', () => {
    assert.equal(formatUptime(9_000), '9s');
    assert.equal(formatUptime(90_061), '1m 30s');
  });
});
