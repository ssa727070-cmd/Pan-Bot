import type Database from 'better-sqlite3';
import type { LogEvent } from '../../logging/events.js';

export interface LogSetting {
  guildId: string;
  eventName: LogEvent;
  channelId: string | null;
  enabled: boolean;
}

interface LogSettingRow {
  guild_id: string;
  event_name: string;
  channel_id: string | null;
  enabled: number;
}

export class LogSettingsRepository {
  public constructor(private readonly db: Database.Database) {}

  public get(guildId: string, eventName: LogEvent): LogSetting {
    const row = this.db
      .prepare('SELECT * FROM log_settings WHERE guild_id = ? AND event_name = ?')
      .get(guildId, eventName) as LogSettingRow | undefined;

    return {
      guildId,
      eventName,
      channelId: row?.channel_id ?? null,
      enabled: row?.enabled === 1,
    };
  }

  public set(
    guildId: string,
    eventName: LogEvent,
    channelId: string | null,
    enabled: boolean,
  ): void {
    this.db
      .prepare(
        `INSERT INTO log_settings (guild_id, event_name, channel_id, enabled)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(guild_id, event_name) DO UPDATE SET
           channel_id = excluded.channel_id,
           enabled = excluded.enabled`,
      )
      .run(guildId, eventName, channelId, enabled ? 1 : 0);
  }

  public setChannelForAll(guildId: string, channelId: string, events: readonly LogEvent[]): void {
    const statement = this.db.prepare(
      `INSERT INTO log_settings (guild_id, event_name, channel_id, enabled)
       VALUES (?, ?, ?, 1)
       ON CONFLICT(guild_id, event_name) DO UPDATE SET
         channel_id = excluded.channel_id,
         enabled = 1`,
    );
    const transaction = this.db.transaction(() => {
      for (const event of events) statement.run(guildId, event, channelId);
    });
    transaction();
  }

  public list(guildId: string): LogSetting[] {
    const rows = this.db
      .prepare('SELECT * FROM log_settings WHERE guild_id = ? ORDER BY event_name')
      .all(guildId) as LogSettingRow[];
    return rows.map((row) => ({
      guildId: row.guild_id,
      eventName: row.event_name as LogEvent,
      channelId: row.channel_id,
      enabled: row.enabled === 1,
    }));
  }
}
