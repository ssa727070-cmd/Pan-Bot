/** Additive, versioned SQL migrations. Each one runs once, in order. */
export interface Migration {
  id: string;
  name: string;
  sql: string;
}

export const migrations: Migration[] = [
  {
    id: '001_initial_schema',
    name: 'Guild settings and command statistics',
    sql: `
      CREATE TABLE IF NOT EXISTS guild_settings (
        guild_id        TEXT PRIMARY KEY,
        created_at      TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS command_usage (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id    TEXT NOT NULL,
        user_id     TEXT NOT NULL,
        command     TEXT NOT NULL,
        used_at     TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_command_usage_guild
        ON command_usage(guild_id, command);
    `,
  },
  {
    id: '002_moderation_welcome_tickets_logging',
    name: 'Moderation warnings, welcome/goodbye, tickets and logging configuration',
    sql: `
      ALTER TABLE guild_settings ADD COLUMN mod_log_channel_id TEXT;
      ALTER TABLE guild_settings ADD COLUMN welcome_channel_id TEXT;
      ALTER TABLE guild_settings ADD COLUMN goodbye_channel_id TEXT;
      ALTER TABLE guild_settings ADD COLUMN welcome_message TEXT;
      ALTER TABLE guild_settings ADD COLUMN goodbye_message TEXT;
      ALTER TABLE guild_settings ADD COLUMN embed_color TEXT;
      ALTER TABLE guild_settings ADD COLUMN log_channel_id TEXT;
      ALTER TABLE guild_settings ADD COLUMN ticket_panel_channel_id TEXT;
      ALTER TABLE guild_settings ADD COLUMN ticket_category_id TEXT;
      ALTER TABLE guild_settings ADD COLUMN ticket_support_role_id TEXT;
      ALTER TABLE guild_settings ADD COLUMN ticket_counter INTEGER NOT NULL DEFAULT 0;

      CREATE TABLE IF NOT EXISTS warnings (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id      TEXT NOT NULL,
        user_id       TEXT NOT NULL,
        moderator_id  TEXT NOT NULL,
        reason        TEXT NOT NULL,
        active        INTEGER NOT NULL DEFAULT 1,
        created_at    TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_warnings_guild_user
        ON warnings(guild_id, user_id, active);

      CREATE TABLE IF NOT EXISTS tickets (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id      TEXT NOT NULL,
        channel_id    TEXT NOT NULL UNIQUE,
        creator_id    TEXT NOT NULL,
        claimer_id    TEXT,
        topic         TEXT,
        status        TEXT NOT NULL DEFAULT 'open',
        transcript    TEXT,
        created_at    TEXT NOT NULL DEFAULT (datetime('now')),
        closed_at     TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_tickets_guild
        ON tickets(guild_id, status);

      CREATE TABLE IF NOT EXISTS ticket_participants (
        ticket_id     INTEGER NOT NULL,
        user_id       TEXT NOT NULL,
        PRIMARY KEY (ticket_id, user_id),
        FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS log_settings (
        guild_id      TEXT NOT NULL,
        event_name    TEXT NOT NULL,
        channel_id    TEXT,
        enabled       INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (guild_id, event_name)
      );
    `,
  },
];
