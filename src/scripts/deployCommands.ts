import { REST, Routes, type RESTPutAPIApplicationCommandsJSONBody } from 'discord.js';
import { env } from '../config/env.js';
import { PanClient } from '../core/client.js';
import { logger } from '../core/logger.js';
import { loadCommands } from '../handlers/commandHandler.js';

/**
 * Registers slash commands with Discord.
 * When DISCORD_GUILD_ID is set, commands are registered only in that guild
 * (instant, ideal for development); otherwise they are registered globally.
 */
async function deploy(): Promise<void> {
  const client = new PanClient();
  await loadCommands(client);

  const body: RESTPutAPIApplicationCommandsJSONBody = [...client.commands.values()].map((command) =>
    command.data.toJSON(),
  );

  const rest = new REST({ version: '10' }).setToken(env.DISCORD_TOKEN);
  const route = env.DISCORD_GUILD_ID
    ? Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, env.DISCORD_GUILD_ID)
    : Routes.applicationCommands(env.DISCORD_CLIENT_ID);

  await rest.put(route, { body });

  logger.info(
    { commands: body.length, scope: env.DISCORD_GUILD_ID ? 'guild' : 'global' },
    'Slash commands deployed',
  );
}

deploy().catch((error: unknown) => {
  logger.fatal({ error }, 'Failed to deploy slash commands');
  process.exit(1);
});
