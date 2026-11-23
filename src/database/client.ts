import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { logger } from '../core/logger.js';
import { migrations } from './migrations.js';

/** Thin wrapper around the synchronous SQLite connection used by PAN BOT. */
export class PanDatabase {
  public readonly sqlite: Database.Database;

  public constructor(filePath: string) {
    if (filePath !== ':memory:') {
      mkdirSync(dirname(filePath), { recursive: true });
    }

    this.sqlite = new Database(filePath);
    this.sqlite.pragma('journal_mode = WAL');
    this.sqlite.pragma('foreign_keys = ON');
    this.sqlite.pragma('busy_timeout = 5000');
    this.migrate();
  }

  private migrate(): void {
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        applied_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    const alreadyApplied = new Set(
      (this.sqlite.prepare('SELECT id FROM schema_migrations').all() as Array<{ id: string }>).map(
        (row) => row.id,
      ),
    );

    const insert = this.sqlite.prepare('INSERT INTO schema_migrations (id, name) VALUES (?, ?)');

    for (const migration of migrations) {
      if (alreadyApplied.has(migration.id)) continue;

      const apply = this.sqlite.transaction(() => {
        this.sqlite.exec(migration.sql);
        insert.run(migration.id, migration.name);
      });

      apply();
      logger.info({ migration: migration.id }, 'Applied database migration');
    }
  }

  public close(): void {
    if (this.sqlite.open) {
      this.sqlite.close();
      logger.info('Database connection closed');
    }
  }
}
