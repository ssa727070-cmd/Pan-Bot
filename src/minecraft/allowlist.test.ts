import '../test/setup.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  customCommandError,
  findBlockedCommand,
  normalizeCommandRoot,
  validateConsoleInput,
} from './allowlist.js';

const owner = { custom: [], unrestricted: true, isOwner: true };

describe('minecraft console allowlist', () => {
  it('allows read-only default commands', () => {
    const result = validateConsoleInput('list', {
      custom: [],
      unrestricted: false,
      isOwner: false,
    });
    assert.equal(result.ok, true);
  });

  it('allows the default gamerule query with a rule name only', () => {
    assert.equal(validateConsoleInput('gamerule keepInventory', owner).ok, true);
    assert.equal(
      validateConsoleInput('gamerule keepInventory true', { ...owner, unrestricted: false }).ok,
      false,
    );
  });

  it('blocks dangerous commands', () => {
    const result = validateConsoleInput('stop', owner);
    assert.equal(result.ok, false);
  });

  it('enforces custom patterns', () => {
    const ok = validateConsoleInput('say hello', {
      custom: [{ command: 'say', argPattern: '[A-Za-z ]+' }],
      unrestricted: false,
      isOwner: false,
    });
    const bad = validateConsoleInput('say hello;stop', {
      custom: [{ command: 'say', argPattern: '[A-Za-z ]+' }],
      unrestricted: false,
      isOwner: false,
    });
    assert.equal(ok.ok, true);
    assert.equal(bad.ok, false);
  });

  it('does not treat chat text as a subcommand', () => {
    const result = validateConsoleInput('say stop the fight', {
      custom: [{ command: 'say', argPattern: '[A-Za-z ]+' }],
      unrestricted: false,
      isOwner: false,
    });
    assert.equal(result.ok, true);
  });

  it('blocks unrestricted console for non-owners', () => {
    const result = validateConsoleInput('customcmd arg', {
      custom: [],
      unrestricted: true,
      isOwner: false,
    });
    assert.equal(result.ok, false);
  });
});

describe('minecraft console bypass protection', () => {
  it('normalises namespaces, slashes, quotes and case', () => {
    assert.equal(normalizeCommandRoot('minecraft:stop'), 'stop');
    assert.equal(normalizeCommandRoot('Bukkit:Reload'), 'reload');
    assert.equal(normalizeCommandRoot('/essentials:stop'), 'stop');
    assert.equal(normalizeCommandRoot('"stop"'), 'stop');
  });

  const bypasses = [
    'minecraft:stop',
    'MINECRAFT:STOP',
    'bukkit:stop',
    'spigot:restart',
    'paper:reload',
    'bukkit:reload confirm',
    'minecraft:op Attacker',
    'minecraft:deop Admin',
    'minecraft:whitelist off',
    'minecraft:ban Admin',
    'minecraft:pardon Griefer',
    'minecraft:save-off',
    'essentials:stop',
    'estop',
    'rl',
    'reload confirm',
    'execute run stop',
    'execute run minecraft:stop',
    'execute as @a run stop',
    'execute if entity @a run op Attacker',
    'execute run execute run stop',
    'execute as @p at @s run execute run minecraft:restart',
    'minecraft:execute run stop',
    'execute run',
    'sudo Admin stop',
    'essentials:sudo Admin op Attacker',
    'function evil:shutdown',
    'schedule function evil:stop 1t',
    'lp user Attacker permission set * true',
    'luckperms user Attacker parent set admin',
    'essentials reload',
    'essentials:essentials reload',
    'worldedit reload',
    'plugman unload Essentials',
  ];

  for (const command of bypasses) {
    it(`blocks "${command}" in unrestricted owner mode`, () => {
      const result = validateConsoleInput(command, owner);
      assert.equal(result.ok, false, `${command} must be blocked`);
    });
  }

  it('blocks forbidden commands even if they were added to the custom allowlist', () => {
    const custom = [
      { command: 'minecraft:stop', argPattern: '' },
      { command: 'execute', argPattern: '.+' },
      { command: 'sudo', argPattern: '.+' },
      { command: 'bukkit:reload', argPattern: '' },
    ];
    for (const command of [
      'minecraft:stop',
      'execute run stop',
      'sudo Admin stop',
      'bukkit:reload',
    ]) {
      const result = validateConsoleInput(command, { custom, unrestricted: false, isOwner: false });
      assert.equal(result.ok, false, `${command} must be blocked`);
    }
  });

  it('rejects blocked or indirect commands when adding custom allowlist entries', () => {
    for (const name of ['minecraft:stop', 'stop', 'execute', 'minecraft:execute', 'sudo', 'lp']) {
      assert.notEqual(customCommandError(name, ''), null, `${name} must be rejected`);
    }
    assert.equal(customCommandError('weather', 'clear|rain'), null);
  });

  it('still allows safe execute queries for the owner', () => {
    assert.equal(findBlockedCommand('execute if entity @a[name=Alex] run say hi'), null);
    const result = validateConsoleInput('execute as @a run say hello', owner);
    assert.equal(result.ok, true);
    assert.equal(result.ok && result.mutating, true);
  });

  it('rejects patterns with many adjacent quantifiers (ReDoS regression)', () => {
    for (const pattern of [
      '.*'.repeat(10) + 'x',
      '.*.*.*x',
      'a?'.repeat(27) + 'a'.repeat(26),
      '[a-z]+[a-z]+[a-z]+!',
    ]) {
      assert.notEqual(customCommandError('weather', pattern), null, pattern);
    }
  });

  it('evaluates the worst accepted pattern quickly on maximum-length input', () => {
    const pattern = '.*.*x';
    assert.equal(customCommandError('weather', pattern), null);
    const started = Date.now();
    const result = validateConsoleInput(`weather ${'a'.repeat(490)}`, {
      custom: [{ command: 'weather', argPattern: pattern }],
      unrestricted: false,
      isOwner: false,
    });
    assert.equal(result.ok, false);
    assert.ok(Date.now() - started < 1000, 'pattern evaluation must stay bounded');
  });

  it('ignores legacy unsafe patterns stored before v1.1.6 validation', () => {
    const result = validateConsoleInput(`weather ${'a'.repeat(40)}`, {
      custom: [{ command: 'weather', argPattern: '.*'.repeat(10) + 'x' }],
      unrestricted: false,
      isOwner: false,
    });
    assert.equal(result.ok, false);
  });

  it('rejects argument patterns prone to catastrophic backtracking or with escapes', () => {
    for (const pattern of ['(a+)+', '(.*)*', '(a|aa){2,}', '\\1', '\\x41', '[a-z', '^stop$']) {
      assert.notEqual(customCommandError('weather', pattern), null, pattern);
    }
    for (const pattern of ['clear|rain|thunder', '[A-Za-z ]+', '\\d{1,3}', '(day|night)']) {
      assert.equal(customCommandError('time', pattern), null, pattern);
    }
  });
});

describe('v1.1.6 release audit: required blocked commands', () => {
  const required = ['stop', 'restart', 'reload', 'minecraft:stop', 'execute run stop'];
  const permissiveCustom = [
    { command: 'stop', argPattern: '' },
    { command: 'restart', argPattern: '' },
    { command: 'reload', argPattern: '' },
    { command: 'minecraft:stop', argPattern: '' },
    { command: 'execute', argPattern: '.+' },
  ];
  const modes = {
    default: { custom: [], unrestricted: false, isOwner: false },
    custom: { custom: permissiveCustom, unrestricted: false, isOwner: false },
    unrestrictedOwner: { custom: permissiveCustom, unrestricted: true, isOwner: true },
  };
  for (const [mode, context] of Object.entries(modes)) {
    for (const command of required) {
      it(`${mode}: "${command}" is blocked`, () => {
        assert.equal(validateConsoleInput(command, context).ok, false);
      });
    }
  }
});
