import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { env } from '../config/env.js';
import { PanClient } from '../core/client.js';
import { logger } from '../core/logger.js';
import { loadCommands } from '../handlers/commandHandler.js';

/** Builds and validates the exact payload used by `npm run commands:deploy`, without contacting Discord. */
async function preview(): Promise<void> {
  const client = new PanClient();
  await loadCommands(client);

  const body = [...client.commands.values()].map((command) => command.data.toJSON());
  const names = body.map((command) => command.name);
  const duplicates = names.filter((name, index) => names.indexOf(name) !== index);

  if (duplicates.length > 0) {
    throw new Error(`Duplicate slash command names: ${[...new Set(duplicates)].join(', ')}`);
  }
  if (body.length === 0) throw new Error('No slash commands were discovered');
  if (names.some((name) => !/^[\w-]{1,32}$/.test(name))) {
    throw new Error('Invalid slash command name detected');
  }

  const target = resolve('data', 'commands.json');
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(body, null, 2)}\n`, 'utf8');

  logger.info(
    {
      commands: body.length,
      output: target,
      scope: env.DISCORD_GUILD_ID ? `guild ${env.DISCORD_GUILD_ID}` : 'global',
    },
    'Slash command payload validated (no API calls made)',
  );
}

preview().catch((error: unknown) => {
  logger.fatal({ error }, 'Slash command preview failed');
  process.exit(1);
});
