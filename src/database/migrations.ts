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
  {
    id: '004_minecraft_administration',
    name: 'Minecraft server administration, RCON auditing and monitoring (v1.1.5)',
    sql: `
      CREATE TABLE IF NOT EXISTS minecraft_settings (
        guild_id                  TEXT PRIMARY KEY,
        enabled                   INTEGER NOT NULL DEFAULT 0,
        host                      TEXT,
        query_port                INTEGER,
        rcon_port                 INTEGER,
        notification_channel_id   TEXT,
        audit_channel_id          TEXT,
        panel_channel_id          TEXT,
        notify_join               INTEGER NOT NULL DEFAULT 1,
        notify_leave              INTEGER NOT NULL DEFAULT 1,
        notify_online             INTEGER NOT NULL DEFAULT 1,
        notify_offline            INTEGER NOT NULL DEFAULT 1,
        notify_interval_seconds   INTEGER NOT NULL DEFAULT 60
                                  CHECK (notify_interval_seconds BETWEEN 30 AND 3600),
        maintenance_enabled       INTEGER NOT NULL DEFAULT 0,
        maintenance_message       TEXT NOT NULL DEFAULT 'El servidor está en mantenimiento. Volveremos pronto.',
        maintenance_whitelist     INTEGER NOT NULL DEFAULT 0,
        unrestricted_console      INTEGER NOT NULL DEFAULT 0,
        last_probe_at             INTEGER,
        updated_at                TEXT NOT NULL DEFAULT (datetime('now')),
        CHECK (query_port IS NULL OR query_port BETWEEN 1 AND 65535),
        CHECK (rcon_port IS NULL OR rcon_port BETWEEN 1 AND 65535)
      );

      CREATE TABLE IF NOT EXISTS minecraft_roles (
        guild_id  TEXT NOT NULL,
        level     TEXT NOT NULL CHECK (level IN ('owner', 'admin', 'moderator', 'readonly')),
        role_id   TEXT NOT NULL,
        PRIMARY KEY (guild_id, level, role_id)
      );
      CREATE INDEX IF NOT EXISTS idx_minecraft_roles_guild ON minecraft_roles(guild_id, level);

      CREATE TABLE IF NOT EXISTS minecraft_command_allowlist (
        guild_id     TEXT NOT NULL,
        command      TEXT NOT NULL,
        arg_pattern  TEXT NOT NULL DEFAULT '',
        created_by   TEXT NOT NULL,
        created_at   TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (guild_id, command)
      );

      CREATE TABLE IF NOT EXISTS minecraft_panels (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id    TEXT NOT NULL,
        channel_id  TEXT NOT NULL,
        message_id  TEXT,
        kind        TEXT NOT NULL CHECK (kind IN ('overview', 'status', 'players', 'players-admin', 'server-admin', 'maintenance')),
        title       TEXT NOT NULL DEFAULT 'Panel de Minecraft',
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_minecraft_panels_guild ON minecraft_panels(guild_id);

      CREATE TABLE IF NOT EXISTS minecraft_audit_log (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id       TEXT NOT NULL,
        admin_id       TEXT NOT NULL,
        action         TEXT NOT NULL,
        target_player  TEXT,
        command        TEXT,
        result         TEXT NOT NULL CHECK (result IN ('success', 'failure', 'denied')),
        error          TEXT,
        created_at     TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_minecraft_audit_guild
        ON minecraft_audit_log(guild_id, created_at);

      CREATE TABLE IF NOT EXISTS minecraft_notification_state (
        guild_id       TEXT NOT NULL,
        event_key      TEXT NOT NULL,
        subject        TEXT NOT NULL,
        fingerprint    TEXT NOT NULL,
        last_sent_at   TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (guild_id, event_key, subject)
      );

      CREATE TABLE IF NOT EXISTS minecraft_player_state (
        guild_id      TEXT NOT NULL,
        player        TEXT NOT NULL,
        last_seen_at  TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (guild_id, player)
      );
    `,
  },
  {
    id: '005_v120_tickets_automod_helper',
    name: 'Advanced tickets, AutoMod filters, Discord-Minecraft links and helper grants (v1.2.0)',
    sql: `
      CREATE TABLE IF NOT EXISTS ticket_settings (
        guild_id           TEXT PRIMARY KEY,
        enabled            INTEGER NOT NULL DEFAULT 1,
        panel_channel_id   TEXT,
        category_id        TEXT,
        archive_channel_id TEXT,
        allow_multiple     INTEGER NOT NULL DEFAULT 0,
        max_open_per_user  INTEGER NOT NULL DEFAULT 1 CHECK (max_open_per_user BETWEEN 1 AND 10),
        creator_can_close  INTEGER NOT NULL DEFAULT 1,
        updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS ticket_roles (
        guild_id  TEXT NOT NULL,
        kind      TEXT NOT NULL CHECK (kind IN ('support', 'excluded', 'closer')),
        role_id   TEXT NOT NULL,
        PRIMARY KEY (guild_id, kind, role_id)
      );
      CREATE INDEX IF NOT EXISTS idx_ticket_roles_guild ON ticket_roles(guild_id, kind);

      ALTER TABLE tickets ADD COLUMN ticket_number INTEGER;
      ALTER TABLE tickets ADD COLUMN accepted_by TEXT;
      ALTER TABLE tickets ADD COLUMN accepted_at TEXT;
      ALTER TABLE tickets ADD COLUMN claimed_at TEXT;
      ALTER TABLE tickets ADD COLUMN closed_by TEXT;

      CREATE TABLE IF NOT EXISTS ticket_events (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id    TEXT NOT NULL,
        ticket_id   INTEGER NOT NULL,
        type        TEXT NOT NULL,
        actor_id    TEXT,
        detail      TEXT,
        created_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_ticket_events_ticket ON ticket_events(ticket_id, id);
      CREATE INDEX IF NOT EXISTS idx_tickets_creator ON tickets(guild_id, creator_id, status);

      -- Carry the pre-1.2.0 per-guild ticket configuration over without touching the old columns.
      INSERT OR IGNORE INTO ticket_settings (guild_id, panel_channel_id, category_id)
        SELECT guild_id, ticket_panel_channel_id, ticket_category_id
        FROM guild_settings
        WHERE ticket_panel_channel_id IS NOT NULL
           OR ticket_category_id IS NOT NULL
           OR ticket_support_role_id IS NOT NULL;
      INSERT OR IGNORE INTO ticket_roles (guild_id, kind, role_id)
        SELECT guild_id, 'support', ticket_support_role_id
        FROM guild_settings
        WHERE ticket_support_role_id IS NOT NULL;

      ALTER TABLE automod_settings ADD COLUMN sensitivity INTEGER NOT NULL DEFAULT 2
        CHECK (sensitivity BETWEEN 1 AND 3);
      ALTER TABLE automod_settings ADD COLUMN flood_enabled INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE automod_settings ADD COLUMN similar_enabled INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE automod_settings ADD COLUMN evasion_enabled INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE automod_settings ADD COLUMN caps_enabled INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE automod_settings ADD COLUMN strike_threshold INTEGER NOT NULL DEFAULT 0
        CHECK (strike_threshold BETWEEN 0 AND 20);
      ALTER TABLE automod_settings ADD COLUMN strike_window_minutes INTEGER NOT NULL DEFAULT 60
        CHECK (strike_window_minutes BETWEEN 1 AND 1440);
      ALTER TABLE automod_settings ADD COLUMN strike_action TEXT NOT NULL DEFAULT 'timeout'
        CHECK (strike_action IN ('timeout', 'kick'));
      ALTER TABLE automod_settings ADD COLUMN strike_timeout_minutes INTEGER NOT NULL DEFAULT 60
        CHECK (strike_timeout_minutes BETWEEN 1 AND 40320);

      CREATE TABLE IF NOT EXISTS automod_list_entries (
        guild_id TEXT NOT NULL,
        kind     TEXT NOT NULL CHECK (kind IN ('word_allow', 'domain_allow', 'domain_block', 'invite_allow')),
        value    TEXT NOT NULL,
        PRIMARY KEY (guild_id, kind, value)
      );

      ALTER TABLE automod_incidents ADD COLUMN detail TEXT;
      CREATE INDEX IF NOT EXISTS idx_automod_incidents_user
        ON automod_incidents(guild_id, user_id, created_at);

      CREATE TABLE IF NOT EXISTS helper_settings (
        guild_id       TEXT PRIMARY KEY,
        enabled        INTEGER NOT NULL DEFAULT 0,
        group_name     TEXT NOT NULL DEFAULT 'helper',
        method         TEXT NOT NULL DEFAULT 'luckperms' CHECK (method IN ('luckperms', 'skript')),
        skript_command TEXT,
        require_link   INTEGER NOT NULL DEFAULT 0,
        updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS minecraft_links (
        guild_id    TEXT NOT NULL,
        discord_id  TEXT NOT NULL,
        player      TEXT NOT NULL,
        linked_by   TEXT NOT NULL,
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (guild_id, discord_id)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_minecraft_links_player
        ON minecraft_links(guild_id, lower(player));

      CREATE TABLE IF NOT EXISTS helper_grants (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id     TEXT NOT NULL,
        ticket_id    INTEGER,
        channel_id   TEXT,
        discord_id   TEXT NOT NULL,
        player       TEXT NOT NULL,
        approved_by  TEXT NOT NULL,
        method       TEXT NOT NULL,
        result       TEXT NOT NULL CHECK (result IN ('success', 'failure', 'denied')),
        detail       TEXT,
        created_at   TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_helper_grants_guild ON helper_grants(guild_id, id);
    `,
  },
];
