import '../test/setup.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decodeVarInt, encodeVarInt, parseStatusPayload } from './status.js';

describe('minecraft status parser', () => {
  it('round-trips varints', () => {
    for (const value of [0, 1, 127, 128, 255, 300, 2147483647]) {
      const encoded = encodeVarInt(value);
      const decoded = decodeVarInt(encoded);
      assert.equal(decoded?.value, value);
    }
  });

  it('parses a normal status payload', () => {
    const status = parseStatusPayload(
      JSON.stringify({
        version: { name: 'Paper 1.21.1', protocol: 767 },
        players: { online: 2, max: 20, sample: [{ name: 'Alex' }, { name: 'Steve' }] },
        description: { text: 'Hello', extra: [{ text: ' World' }] },
      }),
      'pansmp.mcserv.world',
      25565,
    );
    assert.equal(status.version, 'Paper 1.21.1');
    assert.equal(status.software, 'paper');
    assert.equal(status.playersOnline, 2);
    assert.deepEqual(status.playerNames, ['Alex', 'Steve']);
    assert.equal(status.motd, 'Hello World');
  });

  it('handles incomplete payloads safely', () => {
    const status = parseStatusPayload('{}', 'host', 25565);
    assert.equal(status.version, 'Desconocida');
    assert.equal(status.playersOnline, 0);
    assert.equal(status.software, 'unknown');
  });
});
