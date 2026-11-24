import '../test/setup.js';
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import {
  cancelConfirmation,
  clearConfirmations,
  consumeConfirmation,
  createConfirmation,
  pendingConfirmationCount,
} from './confirmation.js';

const action = { kind: 'ban', player: 'Steve', reason: null } as const;

describe('minecraft confirmations', () => {
  beforeEach(() => clearConfirmations());

  it('returns the action once to its owner', () => {
    const token = createConfirmation({ guildId: 'g1', userId: 'u1', action });
    assert.deepEqual(consumeConfirmation(token, 'g1', 'u1'), { status: 'ok', action });
    assert.equal(consumeConfirmation(token, 'g1', 'u1').status, 'missing');
  });

  it('an unauthorised user cannot consume or invalidate somebody else’s confirmation', () => {
    const token = createConfirmation({ guildId: 'g1', userId: 'u1', action });
    assert.equal(consumeConfirmation(token, 'g1', 'intruder').status, 'forbidden');
    assert.equal(consumeConfirmation(token, 'other-guild', 'u1').status, 'forbidden');
    assert.equal(cancelConfirmation(token, 'g1', 'intruder'), 'forbidden');
    // Still valid for the moderator who created it.
    assert.equal(consumeConfirmation(token, 'g1', 'u1').status, 'ok');
  });

  it('expires and is pruned after its TTL', () => {
    const token = createConfirmation({ guildId: 'g1', userId: 'u1', action, ttlMs: 1000, now: 0 });
    assert.equal(consumeConfirmation(token, 'g1', 'u1', 5000).status, 'expired');
    assert.equal(pendingConfirmationCount(), 0);
  });

  it('lets the owner cancel', () => {
    const token = createConfirmation({ guildId: 'g1', userId: 'u1', action });
    assert.equal(cancelConfirmation(token, 'g1', 'u1'), 'ok');
    assert.equal(consumeConfirmation(token, 'g1', 'u1').status, 'missing');
  });

  it('bounds the number of pending confirmations', () => {
    for (let index = 0; index < 1100; index += 1) {
      createConfirmation({ guildId: 'g1', userId: `u${index}`, action });
    }
    assert.ok(pendingConfirmationCount() <= 1000);
  });
});
