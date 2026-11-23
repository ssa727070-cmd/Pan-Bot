/** Additive, versioned SQL migrations. Each one runs once, in order. */
export interface Migration {
  id: string;
  name: string;
  sql: string;
}

export const migrations: Migration[] = [
  {
    id: '001_initial_schema',
    name: 'Guild settings, playlists and command statistics',
    sql: `
      CREATE TABLE IF NOT EXISTS guild_settings (
        guild_id        TEXT PRIMARY KEY,
        dj_role_id      TEXT,
        music_channel_id TEXT,
        default_volume  INTEGER NOT NULL DEFAULT 80 CHECK (default_volume BETWEEN 0 AND 100),
        created_at      TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS playlists (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id    TEXT NOT NULL,
        owner_id    TEXT NOT NULL,
        name        TEXT NOT NULL,
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (guild_id) REFERENCES guild_settings(guild_id) ON DELETE CASCADE,
        UNIQUE (guild_id, name)
      );

      CREATE TABLE IF NOT EXISTS playlist_tracks (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        playlist_id INTEGER NOT NULL,
        track_uri   TEXT NOT NULL,
        title       TEXT NOT NULL,
        author      TEXT,
        duration_ms INTEGER NOT NULL DEFAULT 0,
        position    INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_playlist_tracks_playlist
        ON playlist_tracks(playlist_id, position);

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
];
