import type Database from 'better-sqlite3';

export interface GuildSettings {
  guildId: string;
  modLogChannelId: string | null;
  welcomeChannelId: string | null;
  goodbyeChannelId: string | null;
  welcomeMessage: string | null;
  goodbyeMessage: string | null;
  embedColor: string | null;
  logChannelId: string | null;
  ticketPanelChannelId: string | null;
  ticketCategoryId: string | null;
  ticketSupportRoleId: string | null;
  ticketCounter: number;
}

export type GuildSettingsPatch = Partial<Omit<GuildSettings, 'guildId'>>;

interface GuildSettingsRow {
  guild_id: string;
  mod_log_channel_id: string | null;
  welcome_channel_id: string | null;
  goodbye_channel_id: string | null;
  welcome_message: string | null;
  goodbye_message: string | null;
  embed_color: string | null;
  log_channel_id: string | null;
  ticket_panel_channel_id: string | null;
  ticket_category_id: string | null;
  ticket_support_role_id: string | null;
  ticket_counter: number;
}

const COLUMNS: Record<Exclude<keyof GuildSettings, 'guildId'>, string> = {
  modLogChannelId: 'mod_log_channel_id',
  welcomeChannelId: 'welcome_channel_id',
  goodbyeChannelId: 'goodbye_channel_id',
  welcomeMessage: 'welcome_message',
  goodbyeMessage: 'goodbye_message',
  embedColor: 'embed_color',
  logChannelId: 'log_channel_id',
  ticketPanelChannelId: 'ticket_panel_channel_id',
  ticketCategoryId: 'ticket_category_id',
  ticketSupportRoleId: 'ticket_support_role_id',
  ticketCounter: 'ticket_counter',
};

function toSettings(row: GuildSettingsRow): GuildSettings {
  return {
    guildId: row.guild_id,
    modLogChannelId: row.mod_log_channel_id,
    welcomeChannelId: row.welcome_channel_id,
    goodbyeChannelId: row.goodbye_channel_id,
    welcomeMessage: row.welcome_message,
    goodbyeMessage: row.goodbye_message,
    embedColor: row.embed_color,
    logChannelId: row.log_channel_id,
    ticketPanelChannelId: row.ticket_panel_channel_id,
    ticketCategoryId: row.ticket_category_id,
    ticketSupportRoleId: row.ticket_support_role_id,
    ticketCounter: row.ticket_counter,
  };
}

export class GuildSettingsRepository {
  public constructor(private readonly db: Database.Database) {}

  public get(guildId: string): GuildSettings {
    const row = this.db.prepare('SELECT * FROM guild_settings WHERE guild_id = ?').get(guildId) as
      GuildSettingsRow | undefined;

    if (row) return toSettings(row);

    this.db.prepare('INSERT OR IGNORE INTO guild_settings (guild_id) VALUES (?)').run(guildId);

    const created = this.db
      .prepare('SELECT * FROM guild_settings WHERE guild_id = ?')
      .get(guildId) as GuildSettingsRow;
    return toSettings(created);
  }

  public update(guildId: string, patch: GuildSettingsPatch): GuildSettings {
    this.get(guildId);

    const assignments: string[] = [];
    const values: unknown[] = [];

    for (const [key, value] of Object.entries(patch) as Array<
      [Exclude<keyof GuildSettings, 'guildId'>, unknown]
    >) {
      if (value === undefined) continue;
      assignments.push(`${COLUMNS[key]} = ?`);
      values.push(value);
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

  /** Atomically reserves and returns the next ticket number for the guild. */
  public nextTicketNumber(guildId: string): number {
    this.get(guildId);
    this.db
      .prepare('UPDATE guild_settings SET ticket_counter = ticket_counter + 1 WHERE guild_id = ?')
      .run(guildId);
    return this.get(guildId).ticketCounter;
  }
}
