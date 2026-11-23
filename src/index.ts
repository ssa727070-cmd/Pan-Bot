import { env } from './config/env.js';
import { PanClient } from './core/client.js';
import { logger } from './core/logger.js';
import { PanDatabase } from './database/client.js';
import { loadCommands } from './handlers/commandHandler.js';
import { loadEvents } from './handlers/eventHandler.js';

async function main(): Promise<void> {
  const client = new PanClient();

  client.db = new PanDatabase(env.DATABASE_PATH);

  await loadCommands(client);
  await loadEvents(client);

  await client.login(env.DISCORD_TOKEN);
  registerShutdownHandlers(client);
}

function registerShutdownHandlers(client: PanClient): void {
  let shuttingDown = false;

  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down PAN BOT');

    client.destroy();
    client.db.close();

    process.exit(0);
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));

  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Unhandled promise rejection');
  });

  process.on('uncaughtException', (error) => {
    logger.fatal({ error }, 'Uncaught exception — exiting');
    shutdown('uncaughtException');
  });
}

function serializeError(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) return { value: String(error) };
  return {
    name: error.name,
    message: error.message.replace(
      /[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{30,}/g,
      '[REDACTED]',
    ),
  };
}

main().catch((error: unknown) => {
  logger.fatal({ error: serializeError(error) }, 'Failed to start PAN BOT');
  process.exit(1);
});
