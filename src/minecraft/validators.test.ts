import '../test/setup.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  minecraftCommandName,
  minecraftCoordinates,
  minecraftGamerule,
  minecraftMessage,
  minecraftReason,
  minecraftTarget,
  minecraftUsername,
} from './validators.js';
import { buildMinecraftCommand } from './commands.js';

describe('minecraft validators', () => {
  it('accepts valid player names and rejects injection-like input', () => {
    assert.equal(minecraftUsername.safeParse('Steve_123').success, true);
    assert.equal(minecraftUsername.safeParse('Steve;stop').success, false);
    assert.equal(minecraftUsername.safeParse('bad name').success, false);
    assert.equal(minecraftUsername.safeParse('').success, false);
  });

  it('accepts UUID targets but rejects unsafe values', () => {
    assert.equal(minecraftTarget.safeParse('123e4567-e89b-12d3-a456-426614174000').success, true);
    assert.equal(minecraftTarget.safeParse('Steve').success, true);
    assert.equal(minecraftTarget.safeParse('Steve\nstop').success, false);
  });

  it('validates gamerules, coordinates and chat payloads', () => {
    assert.equal(minecraftGamerule.safeParse('doDaylightCycle').success, true);
    assert.equal(minecraftGamerule.safeParse('do_daylight_cycle').success, false);
    assert.equal(minecraftCoordinates.safeParse('100 64 -20').success, true);
    assert.equal(minecraftCoordinates.safeParse('100 64').success, false);
    assert.equal(minecraftMessage.safeParse('Hola servidor').success, true);
    assert.equal(minecraftMessage.safeParse('hola\nstop').success, false);
    assert.equal(minecraftReason.safeParse('Griefing').success, true);
    assert.equal(minecraftCommandName.safeParse('list').success, true);
  });

  it('builds safe commands from validated options', () => {
    assert.equal(
      buildMinecraftCommand('kick', { player: 'Steve', reason: 'spam' }).command,
      'kick Steve spam',
    );
    assert.equal(buildMinecraftCommand('whitelist-list').command, 'whitelist list');
    assert.equal(
      buildMinecraftCommand('gamemode', { player: 'Alex', mode: 'creative' }).command,
      'gamemode creative Alex',
    );
    assert.throws(() => buildMinecraftCommand('kick', { player: 'bad;stop' }));
  });
});
