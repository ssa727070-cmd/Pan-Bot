import '../test/setup.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildMinecraftCommand } from './commands.js';
import { translateMcInvocation, type McOptionReader } from './options.js';

function reader(values: Record<string, string | number>): McOptionReader {
  return {
    getString: (name) => (typeof values[name] === 'string' ? (values[name] as string) : null),
    getInteger: (name) => (typeof values[name] === 'number' ? (values[name] as number) : null),
  };
}

describe('/mc option translation', () => {
  it('keeps the gamerule name and value separate (v1.1.5 regression)', () => {
    const change = translateMcInvocation(
      'gamerules',
      reader({ regla: 'keepInventory', valor: 'true' }),
    );
    assert.equal(change.action, 'gamerules');
    assert.deepEqual(change.options, { gamerule: 'keepInventory', gameruleValue: 'true' });
    assert.equal(
      buildMinecraftCommand(change.action, change.options).command,
      'gamerule keepInventory true',
    );

    const query = translateMcInvocation('gamerules', reader({ regla: 'keepInventory' }));
    assert.equal(
      buildMinecraftCommand(query.action, query.options).command,
      'gamerule keepInventory',
    );
  });

  it('maps whitelist and message subcommands to concrete actions', () => {
    assert.equal(
      translateMcInvocation('whitelist', reader({ accion: 'add', jugador: 'Alex' })).action,
      'whitelist-add',
    );
    assert.equal(
      translateMcInvocation('whitelist', reader({ accion: 'list' })).action,
      'whitelist-list',
    );
    const message = translateMcInvocation(
      'message',
      reader({ tipo: 'broadcast', mensaje: 'hola' }),
    );
    assert.equal(message.action, 'broadcast');
    assert.equal(message.options.message, 'hola');
    assert.throws(() =>
      translateMcInvocation('message', reader({ tipo: 'console', mensaje: 'x' })),
    );
    assert.throws(() => translateMcInvocation('whitelist', reader({ accion: 'off' })));
  });

  it('maps each subcommand only to its own options', () => {
    assert.deepEqual(translateMcInvocation('time', reader({ accion: 'set', valor: 'day' })), {
      action: 'time',
      options: { mode: 'set', value: 'day' },
    });
    assert.deepEqual(
      translateMcInvocation('mute', reader({ jugador: 'Alex', duracion: '1h', razon: 'spam' })),
      { action: 'mute', options: { player: 'Alex', value: '1h', reason: 'spam' } },
    );
    assert.deepEqual(
      translateMcInvocation('xp', reader({ jugador: 'Alex', cantidad: 3, tipo: 'levels' })),
      { action: 'xp', options: { player: 'Alex', amount: 3, mode: 'levels' } },
    );
    assert.deepEqual(translateMcInvocation('command', reader({ comando: 'list' })), {
      action: 'console',
      options: { command: 'list' },
    });
    assert.deepEqual(translateMcInvocation('ban', reader({ jugador: 'Steve' })), {
      action: 'ban',
      options: { player: 'Steve', reason: undefined },
    });
    assert.deepEqual(translateMcInvocation('status', reader({})), {
      action: 'status',
      options: {},
    });
  });

  it('rejects unknown subcommands', () => {
    assert.throws(() => translateMcInvocation('stop', reader({})), /desconocido/);
  });
});
