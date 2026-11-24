import '../test/setup.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildMinecraftCommand } from './commands.js';

describe('minecraft command builder', () => {
  it('builds a gamerule query from the rule name', () => {
    assert.equal(
      buildMinecraftCommand('gamerules', { gamerule: 'keepInventory' }).command,
      'gamerule keepInventory',
    );
  });

  it('builds a gamerule change with separate rule and value', () => {
    assert.equal(
      buildMinecraftCommand('gamerules', { gamerule: 'keepInventory', gameruleValue: 'true' })
        .command,
      'gamerule keepInventory true',
    );
    assert.equal(
      buildMinecraftCommand('gamerules', { gamerule: 'randomTickSpeed', gameruleValue: '3' })
        .command,
      'gamerule randomTickSpeed 3',
    );
  });

  it('rejects invalid gamerule names and values', () => {
    assert.throws(() => buildMinecraftCommand('gamerules', {}), /Gamerule inválida/);
    assert.throws(
      () => buildMinecraftCommand('gamerules', { gamerule: 'keepInventory; stop' }),
      /Gamerule inválida/,
    );
    assert.throws(
      () => buildMinecraftCommand('gamerules', { gamerule: 'keepInventory', gameruleValue: 'yes' }),
      /Valor inválido/,
    );
  });

  it('quotes reasons and validates players', () => {
    assert.equal(
      buildMinecraftCommand('kick', { player: 'Steve', reason: 'spam en chat' }).command,
      'kick Steve "spam en chat"',
    );
    assert.equal(buildMinecraftCommand('ban', { player: 'Steve' }).targetPlayer, 'Steve');
    assert.throws(() => buildMinecraftCommand('kick', { player: 'Steve\nstop' }), /inválido/);
    assert.throws(() => buildMinecraftCommand('op', { player: 'a b' }), /inválido/);
  });

  it('only accepts known modes', () => {
    assert.equal(buildMinecraftCommand('weather', { mode: 'rain' }).command, 'weather rain');
    assert.throws(() => buildMinecraftCommand('weather', { mode: 'rain; stop' }));
    assert.equal(
      buildMinecraftCommand('time', { mode: 'set', value: 'day' }).command,
      'time set day',
    );
    assert.equal(
      buildMinecraftCommand('xp', { player: 'Alex', amount: 5, mode: 'levels' }).command,
      'xp add Alex 5L',
    );
    assert.equal(
      buildMinecraftCommand('teleport', { player: 'Alex', destination: '1 64 -2.5' }).command,
      'tp Alex 1 64 -2.5',
    );
  });

  it('rejects messages with control characters', () => {
    assert.throws(() => buildMinecraftCommand('say', { message: 'hola\nstop' }));
    assert.equal(
      buildMinecraftCommand('say', { message: 'hola a todos' }).command,
      'say hola a todos',
    );
  });
});
