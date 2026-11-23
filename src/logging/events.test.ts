import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LOG_EVENTS, LOG_EVENT_LABELS, isLogEvent } from './events.js';

describe('log events catalogue', () => {
  it('covers every configurable event with a Spanish label', () => {
    assert.equal(LOG_EVENTS.length, 14);
    for (const event of LOG_EVENTS) {
      assert.ok(LOG_EVENT_LABELS[event], `Missing label for ${event}`);
      assert.ok(isLogEvent(event));
    }
  });

  it('rejects unknown events', () => {
    assert.equal(isLogEvent('unknown_event'), false);
    assert.equal(isLogEvent(''), false);
  });
});
