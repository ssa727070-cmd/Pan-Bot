import type Database from 'better-sqlite3';

export interface GuildSettings {
  guildId: string;
  djRoleId: string | null;
  musicChannelId: string | null;
  defaultVolume: number;
}

interface GuildSettingsRow {
  guild_id: string;
  dj_role_id: string | null;
  music_channel_id: string | null;
  default_volume: number;
}

function toSettings(row: GuildSettingsRow): GuildSettings {
  return {
    guildId: row.guild_id,
    djRoleId: row.dj_role_id,
    musicChannelId: row.music_channel_id,
    defaultVolume: row.default_volume,
  };
}

export class GuildSettingsRepository {
  public constructor(
    private readonly db: Database.Database,
    private readonly defaultVolume: number,
  ) {}

  public get(guildId: string): GuildSettings {
    const row = this.db.prepare('SELECT * FROM guild_settings WHERE guild_id = ?').get(guildId) as
      GuildSettingsRow | undefined;

    if (row) return toSettings(row);

    this.db
      .prepare('INSERT OR IGNORE INTO guild_settings (guild_id, default_volume) VALUES (?, ?)')
      .run(guildId, this.defaultVolume);

    return {
      guildId,
      djRoleId: null,
      musicChannelId: null,
      defaultVolume: this.defaultVolume,
    };
  }

  public update(
    guildId: string,
    patch: Partial<Pick<GuildSettings, 'djRoleId' | 'musicChannelId' | 'defaultVolume'>>,
  ): GuildSettings {
    this.get(guildId);

    const assignments: string[] = [];
    const values: unknown[] = [];

    if (patch.djRoleId !== undefined) {
      assignments.push('dj_role_id = ?');
      values.push(patch.djRoleId);
    }
    if (patch.musicChannelId !== undefined) {
      assignments.push('music_channel_id = ?');
      values.push(patch.musicChannelId);
    }
    if (patch.defaultVolume !== undefined) {
      assignments.push('default_volume = ?');
      values.push(patch.defaultVolume);
    }

    if (assignments.length > 0) {
      assignments.push("updated_at = datetime('now')");
      values.push(guildId);
      this.db
        .prepare(`UPDATE guild_settings SET ${assignments.join(', ')} WHERE guild_id = ?`)
        .run(...values);
    }

    return this.get(guildId);
  }
}
