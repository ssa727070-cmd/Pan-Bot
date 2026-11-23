import { env } from '../config/env.js';
import { PanClient } from '../core/client.js';
import { logger } from '../core/logger.js';
import { PanDatabase } from '../database/client.js';
import { loadCommands } from '../handlers/commandHandler.js';
import { loadEvents } from '../handlers/eventHandler.js';

/** Verifies configuration, database migrations, command and event discovery without connecting to Discord. */
async function healthcheck(): Promise<void> {
  const client = new PanClient();
  client.db = new PanDatabase(env.DATABASE_PATH);

  await loadCommands(client);
  await loadEvents(client);

  if (client.commands.size === 0) throw new Error('No slash commands were discovered');
  if (client.listenerCount('interactionCreate') === 0) {
    throw new Error('No interactionCreate handler was discovered');
  }

  const { count } = client.db.sqlite
    .prepare('SELECT COUNT(*) AS count FROM schema_migrations')
    .get() as {
    count: number;
  };

  logger.info(
    { commands: client.commands.size, migrations: count, database: env.DATABASE_PATH },
    'Healthcheck passed',
  );

  client.db.close();
}

healthcheck().catch((error: unknown) => {
  logger.fatal({ error }, 'Healthcheck failed');
  process.exit(1);
});
