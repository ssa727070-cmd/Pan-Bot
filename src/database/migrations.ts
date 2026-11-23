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
  {
    id: '003_autoroles_statistics_suggestions_automod',
    name: 'Automatic roles, statistics, suggestions and AutoMod (v1.1.0)',
    sql: `
      CREATE TABLE IF NOT EXISTS autorole_settings (
        guild_id      TEXT PRIMARY KEY,
        enabled       INTEGER NOT NULL DEFAULT 0,
        include_bots  INTEGER NOT NULL DEFAULT 0,
        updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS autorole_roles (
        guild_id      TEXT NOT NULL,
        role_id       TEXT NOT NULL,
        PRIMARY KEY (guild_id, role_id)
      );
      CREATE INDEX IF NOT EXISTS idx_autorole_roles_guild ON autorole_roles(guild_id);

      CREATE TABLE IF NOT EXISTS role_panels (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id       TEXT NOT NULL,
        channel_id     TEXT NOT NULL,
        message_id     TEXT,
        title          TEXT NOT NULL,
        description    TEXT NOT NULL DEFAULT '',
        max_selections INTEGER NOT NULL DEFAULT 1 CHECK (max_selections BETWEEN 1 AND 10),
        created_at     TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_role_panels_guild ON role_panels(guild_id);

      CREATE TABLE IF NOT EXISTS role_panel_roles (
        panel_id    INTEGER NOT NULL,
        role_id     TEXT NOT NULL,
        label       TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        position    INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (panel_id, role_id),
        FOREIGN KEY (panel_id) REFERENCES role_panels(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_role_panel_roles_panel ON role_panel_roles(panel_id, position);

      CREATE TABLE IF NOT EXISTS guild_statistics (
        guild_id        TEXT PRIMARY KEY,
        total_members   INTEGER NOT NULL DEFAULT 0,
        human_members   INTEGER NOT NULL DEFAULT 0,
        bot_members     INTEGER NOT NULL DEFAULT 0,
        joins_total     INTEGER NOT NULL DEFAULT 0,
        leaves_total    INTEGER NOT NULL DEFAULT 0,
        messages_total  INTEGER NOT NULL DEFAULT 0,
        messages_day    INTEGER NOT NULL DEFAULT 0,
        messages_week   INTEGER NOT NULL DEFAULT 0,
        day_key         TEXT NOT NULL DEFAULT '',
        week_key        TEXT NOT NULL DEFAULT '',
        last_message_at TEXT,
        updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS stats_daily (
        guild_id  TEXT NOT NULL,
        day       TEXT NOT NULL,
        joins     INTEGER NOT NULL DEFAULT 0,
        leaves    INTEGER NOT NULL DEFAULT 0,
        messages  INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (guild_id, day)
      );

      CREATE TABLE IF NOT EXISTS stat_channels (
        guild_id        TEXT NOT NULL,
        channel_id      TEXT NOT NULL,
        metric          TEXT NOT NULL CHECK (metric IN ('members', 'humans', 'bots', 'total', 'messages')),
        last_name       TEXT,
        last_updated_at INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (guild_id, channel_id)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_stat_channels_channel ON stat_channels(channel_id);

      CREATE TABLE IF NOT EXISTS suggestion_settings (
        guild_id       TEXT PRIMARY KEY,
        channel_id     TEXT,
        staff_role_id  TEXT,
        enabled        INTEGER NOT NULL DEFAULT 0,
        updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS suggestion_statuses (
        guild_id TEXT NOT NULL,
        status   TEXT NOT NULL,
        label    TEXT NOT NULL DEFAULT '',
        PRIMARY KEY (guild_id, status)
      );

      CREATE TABLE IF NOT EXISTS suggestions (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id       TEXT NOT NULL,
        author_id      TEXT NOT NULL,
        channel_id     TEXT,
        message_id     TEXT,
        content        TEXT NOT NULL,
        status         TEXT NOT NULL DEFAULT 'pending',
        staff_response TEXT,
        created_at     TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_suggestions_guild ON suggestions(guild_id, id);

      CREATE TABLE IF NOT EXISTS suggestion_votes (
        suggestion_id INTEGER NOT NULL,
        user_id       TEXT NOT NULL,
        value         INTEGER NOT NULL CHECK (value IN (-1, 1)),
        PRIMARY KEY (suggestion_id, user_id),
        FOREIGN KEY (suggestion_id) REFERENCES suggestions(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_suggestion_votes_suggestion ON suggestion_votes(suggestion_id);

      CREATE TABLE IF NOT EXISTS automod_settings (
        guild_id                TEXT PRIMARY KEY,
        enabled                 INTEGER NOT NULL DEFAULT 0,
        spam_enabled            INTEGER NOT NULL DEFAULT 0,
        spam_window_seconds     INTEGER NOT NULL DEFAULT 10,
        spam_max_messages       INTEGER NOT NULL DEFAULT 6,
        spam_identical          INTEGER NOT NULL DEFAULT 0,
        spam_mentions           INTEGER NOT NULL DEFAULT 0,
        spam_max_mentions       INTEGER NOT NULL DEFAULT 5,
        words_enabled           INTEGER NOT NULL DEFAULT 0,
        links_enabled           INTEGER NOT NULL DEFAULT 0,
        invites_enabled         INTEGER NOT NULL DEFAULT 0,
        mentions_enabled        INTEGER NOT NULL DEFAULT 0,
        repeated_chars_enabled  INTEGER NOT NULL DEFAULT 0,
        delete_message          INTEGER NOT NULL DEFAULT 1,
        warn_user               INTEGER NOT NULL DEFAULT 1,
        timeout_minutes         INTEGER NOT NULL DEFAULT 0,
        log_incidents           INTEGER NOT NULL DEFAULT 1,
        native_rules            INTEGER NOT NULL DEFAULT 0,
        updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS automod_words (
        guild_id TEXT NOT NULL,
        word     TEXT NOT NULL,
        PRIMARY KEY (guild_id, word)
      );

      CREATE TABLE IF NOT EXISTS automod_exemptions (
        guild_id  TEXT NOT NULL,
        type      TEXT NOT NULL CHECK (type IN ('role', 'channel', 'user')),
        target_id TEXT NOT NULL,
        PRIMARY KEY (guild_id, type, target_id)
      );

      CREATE TABLE IF NOT EXISTS automod_incidents (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id   TEXT NOT NULL,
        user_id    TEXT NOT NULL,
        channel_id TEXT,
        rule       TEXT NOT NULL,
        action     TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_automod_incidents_guild
        ON automod_incidents(guild_id, created_at);
    `,
  },
];
