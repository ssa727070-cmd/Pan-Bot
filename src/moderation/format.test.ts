import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatDurationSpanish,
  sanitizeReason,
  timeoutDurationMs,
  validateClearAmount,
} from './format.js';

describe('sanitizeReason', () => {
  it('uses a default reason for empty values', () => {
    assert.equal(sanitizeReason(null), 'Sin razón especificada');
    assert.equal(sanitizeReason('   '), 'Sin razón especificada');
  });

  it('trims and truncates long reasons', () => {
    assert.equal(sanitizeReason('  spam  '), 'spam');
    assert.equal(sanitizeReason('x'.repeat(500)).length, 400);
  });
});

describe('timeoutDurationMs', () => {
  it('clamps invalid values to one minute', () => {
    assert.equal(timeoutDurationMs(0), 60_000);
    assert.equal(timeoutDurationMs(Number.NaN), 60_000);
  });

  it('converts minutes and enforces the 28-day limit', () => {
    assert.equal(timeoutDurationMs(5), 300_000);
    assert.equal(timeoutDurationMs(999_999), 28 * 24 * 60 * 60 * 1000);
  });
});

describe('formatDurationSpanish', () => {
  it('formats minutes and hours correctly', () => {
    assert.equal(formatDurationSpanish(60_000), '1 minuto');
    assert.equal(formatDurationSpanish(120_000), '2 minutos');
    assert.equal(formatDurationSpanish(3_600_000), '1 hora');
    assert.equal(formatDurationSpanish(5_400_000), '1 hora y 30 minutos');
  });
});

describe('validateClearAmount', () => {
  it('accepts 1 to 100', () => {
    assert.equal(validateClearAmount(1), null);
    assert.equal(validateClearAmount(100), null);
  });

  it('rejects out-of-range and non-integer values', () => {
    assert.match(validateClearAmount(0)!, /entre 1 y 100/);
    assert.match(validateClearAmount(101)!, /entre 1 y 100/);
    assert.match(validateClearAmount(1.5)!, /entre 1 y 100/);
  });
});
