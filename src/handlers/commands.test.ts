import '../test/setup.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Collection } from 'discord.js';
import type { PanClient } from '../core/client.js';
import { loadCommands } from './commandHandler.js';
import type { Command } from '../types/command.js';

describe('slash command definitions', () => {
  it('loads 26 unique commands and respects Discord nesting rules', async () => {
    const client = {
      commands: new Collection<string, Command>(),
    } as unknown as PanClient;
    await loadCommands(client);

    assert.equal(client.commands.size, 26);
    assert.deepEqual(
      [...client.commands.keys()].sort(),
      [
        'about',
        'automod',
        'autorole',
        'ban',
        'clear',
        'goodbye',
        'help',
        'kick',
        'lock',
        'logs',
        'mc',
        'mcadmin',
        'ping',
        'settings',
        'slowmode',
        'stats',
        'suggest',
        'suggestions',
        'ticket',
        'timeout',
        'unban',
        'unlock',
        'untimeout',
        'warn',
        'warnings',
        'welcome',
      ].sort(),
    );

    for (const command of client.commands.values()) {
      const json = command.data.toJSON();
      assert.match(json.name, /^[-_\p{L}\p{N}]{1,32}$/u, `${json.name} is a valid name`);

      const optionTypes = new Set((json.options ?? []).map((option) => option.type));
      const mixesSubcommandsAndGroups = optionTypes.has(1) && optionTypes.has(2);
      assert.equal(
        mixesSubcommandsAndGroups,
        false,
        `${json.name} must not mix subcommands and subcommand groups`,
      );
    }
  });
});
