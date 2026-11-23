import { env } from '../config/env.js';
import { PanDatabase } from '../database/client.js';
import { logger } from '../core/logger.js';

const db = new PanDatabase(env.DATABASE_PATH);
const { count } = db.sqlite.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get() as {
  count: number;
};

logger.info({ database: env.DATABASE_PATH, migrations: count }, 'Database is up to date');
db.close();
