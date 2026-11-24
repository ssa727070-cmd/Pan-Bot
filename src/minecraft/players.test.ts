import '../test/setup.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseListOutput, snapshotFromStatus } from './players.js';
import type { MinecraftStatus } from './types.js';

function status(online: number, names: string[]): MinecraftStatus {
  return {
    host: 'h',
    port: 25565,
    version: '1.21',
    protocol: 767,
    software: 'paper',
    motd: '',
    playersOnline: online,
    playersMax: 50,
    playerNames: names,
    latencyMs: 1,
  };
}

describe('minecraft player lists', () => {
  it('parses vanilla and Paper list output', () => {
    assert.deepEqual(parseListOutput('There are 2 of a max of 20 players online: Alex, Steve'), {
      complete: true,
      players: ['Alex', 'Steve'],
    });
    assert.deepEqual(parseListOutput('There are 0 of a max of 20 players online: '), {
      complete: true,
      players: [],
    });
  });

  it('parses grouped EssentialsX output with colour codes and AFK tags', () => {
    const output =
      '§6There are §c3§6 out of maximum §c20§6 players online.\n§6Admins§r: [AFK]Alex\n§6Default§r: Steve, Notch';
    assert.deepEqual(parseListOutput(output), {
      complete: true,
      players: ['Alex', 'Steve', 'Notch'],
    });
  });

  it('marks the list incomplete when nicknames hide real names', () => {
    const output = 'There are 2 out of maximum 20 players online.\nDefault: ~Pan, Steve';
    assert.equal(parseListOutput(output)?.complete, false);
  });

  it('returns null for output that is not a player list', () => {
    assert.equal(parseListOutput('Unknown command'), null);
  });

  it('never treats a truncated ping sample as the full player list', () => {
    const twelve = Array.from({ length: 12 }, (_, index) => `Player${index}`);
    assert.equal(snapshotFromStatus(status(30, twelve)).complete, false);
    assert.equal(snapshotFromStatus(status(12, twelve)).complete, true);
    assert.equal(snapshotFromStatus(status(0, [])).complete, true);
  });

  it('rejects fake sample entries injected by plugins', () => {
    assert.equal(snapshotFromStatus(status(2, ['§aWelcome to', 'the server!'])).complete, false);
  });
});
