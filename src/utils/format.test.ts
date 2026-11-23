import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatUptime, truncate } from './format.js';

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
