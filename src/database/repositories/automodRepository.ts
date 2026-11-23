import type Database from 'better-sqlite3';

export interface AutomodSettings {
  guildId: string;
  enabled: boolean;
  spamEnabled: boolean;
  spamWindowSeconds: number;
  spamMaxMessages: number;
  spamIdentical: boolean;
  spamMentions: boolean;
  spamMaxMentions: number;
  wordsEnabled: boolean;
  linksEnabled: boolean;
  invitesEnabled: boolean;
  mentionsEnabled: boolean;
  repeatedCharsEnabled: boolean;
  deleteMessage: boolean;
  warnUser: boolean;
  timeoutMinutes: number;
  logIncidents: boolean;
  nativeRules: boolean;
}

export type AutomodExemptionType = 'role' | 'channel' | 'user';

export interface AutomodExemption {
  guildId: string;
  type: AutomodExemptionType;
  targetId: string;
}

export interface AutomodIncident {
  id: number;
  guildId: string;
  userId: string;
  channelId: string | null;
  rule: string;
  action: string;
  createdAt: string;
}

interface AutomodSettingsRow {
  guild_id: string;
  enabled: number;
  spam_enabled: number;
  spam_window_seconds: number;
  spam_max_messages: number;
  spam_identical: number;
  spam_mentions: number;
  spam_max_mentions: number;
  words_enabled: number;
  links_enabled: number;
  invites_enabled: number;
  mentions_enabled: number;
  repeated_chars_enabled: number;
  delete_message: number;
  warn_user: number;
  timeout_minutes: number;
  log_incidents: number;
  native_rules: number;
}

interface AutomodIncidentRow {
  id: number;
  guild_id: string;
  user_id: string;
  channel_id: string | null;
  rule: string;
  action: string;
  created_at: string;
}

function toSettings(row: AutomodSettingsRow): AutomodSettings {
  return {
    guildId: row.guild_id,
    enabled: row.enabled === 1,
    spamEnabled: row.spam_enabled === 1,
    spamWindowSeconds: row.spam_window_seconds,
    spamMaxMessages: row.spam_max_messages,
    spamIdentical: row.spam_identical === 1,
    spamMentions: row.spam_mentions === 1,
    spamMaxMentions: row.spam_max_mentions,
    wordsEnabled: row.words_enabled === 1,
    linksEnabled: row.links_enabled === 1,
    invitesEnabled: row.invites_enabled === 1,
    mentionsEnabled: row.mentions_enabled === 1,
    repeatedCharsEnabled: row.repeated_chars_enabled === 1,
    deleteMessage: row.delete_message === 1,
    warnUser: row.warn_user === 1,
    timeoutMinutes: row.timeout_minutes,
    logIncidents: row.log_incidents === 1,
    nativeRules: row.native_rules === 1,
  };
}

const SETTINGS_COLUMNS: Record<keyof Omit<AutomodSettings, 'guildId'>, string> = {
  enabled: 'enabled',
  spamEnabled: 'spam_enabled',
  spamWindowSeconds: 'spam_window_seconds',
  spamMaxMessages: 'spam_max_messages',
  spamIdentical: 'spam_identical',
  spamMentions: 'spam_mentions',
  spamMaxMentions: 'spam_max_mentions',
  wordsEnabled: 'words_enabled',
  linksEnabled: 'links_enabled',
  invitesEnabled: 'invites_enabled',
  mentionsEnabled: 'mentions_enabled',
  repeatedCharsEnabled: 'repeated_chars_enabled',
  deleteMessage: 'delete_message',
  warnUser: 'warn_user',
  timeoutMinutes: 'timeout_minutes',
  logIncidents: 'log_incidents',
  nativeRules: 'native_rules',
};

export class AutomodRepository {
  public constructor(private readonly db: Database.Database) {}

  public getSettings(guildId: string): AutomodSettings {
    const row = this.db
      .prepare('SELECT * FROM automod_settings WHERE guild_id = ?')
      .get(guildId) as AutomodSettingsRow | undefined;
    if (row) return toSettings(row);

    return {
      guildId,
      enabled: false,
      spamEnabled: false,
      spamWindowSeconds: 10,
      spamMaxMessages: 6,
      spamIdentical: false,
      spamMentions: false,
      spamMaxMentions: 5,
      wordsEnabled: false,
      linksEnabled: false,
      invitesEnabled: false,
      mentionsEnabled: false,
      repeatedCharsEnabled: false,
      deleteMessage: true,
      warnUser: true,
      timeoutMinutes: 0,
      logIncidents: true,
      nativeRules: false,
    };
  }

  /** Defaults are deliberately permissive: every filter and escalation is opt-in. */
  public setSettings(
    guildId: string,
    patch: Partial<Omit<AutomodSettings, 'guildId'>>,
  ): AutomodSettings {
    const next = { ...this.getSettings(guildId), ...patch };
    const keys = Object.keys(SETTINGS_COLUMNS) as Array<keyof Omit<AutomodSettings, 'guildId'>>;
    const columns = keys.map((key) => SETTINGS_COLUMNS[key]);
    const values = keys.map((key) => {
      const value = next[key];
      return typeof value === 'boolean' ? (value ? 1 : 0) : value;
    });

    this.db
      .prepare(
        `INSERT INTO automod_settings (guild_id, ${columns.join(', ')})
         VALUES (?, ${columns.map(() => '?').join(', ')})
         ON CONFLICT(guild_id) DO UPDATE SET
           ${columns.map((column) => `${column} = excluded.${column}`).join(', ')},
           updated_at = datetime('now')`,
      )
      .run(guildId, ...values);

    return next;
  }

  public addWord(guildId: string, word: string): boolean {
    return (
      this.db
        .prepare('INSERT OR IGNORE INTO automod_words (guild_id, word) VALUES (?, ?)')
        .run(guildId, word.toLowerCase()).changes > 0
    );
  }

  public removeWord(guildId: string, word: string): boolean {
    return (
      this.db
        .prepare('DELETE FROM automod_words WHERE guild_id = ? AND word = ?')
        .run(guildId, word.toLowerCase()).changes > 0
    );
  }

  public listWords(guildId: string): string[] {
    const rows = this.db
      .prepare('SELECT word FROM automod_words WHERE guild_id = ? ORDER BY word')
      .all(guildId) as Array<{ word: string }>;
    return rows.map((row) => row.word);
  }

  public addExemption(guildId: string, type: AutomodExemptionType, targetId: string): boolean {
    return (
      this.db
        .prepare(
          `INSERT OR IGNORE INTO automod_exemptions (guild_id, type, target_id) VALUES (?, ?, ?)`,
        )
        .run(guildId, type, targetId).changes > 0
    );
  }

  public removeExemption(guildId: string, type: AutomodExemptionType, targetId: string): boolean {
    return (
      this.db
        .prepare('DELETE FROM automod_exemptions WHERE guild_id = ? AND type = ? AND target_id = ?')
        .run(guildId, type, targetId).changes > 0
    );
  }

  public listExemptions(guildId: string): AutomodExemption[] {
    const rows = this.db
      .prepare('SELECT guild_id, type, target_id FROM automod_exemptions WHERE guild_id = ?')
      .all(guildId) as Array<{ guild_id: string; type: AutomodExemptionType; target_id: string }>;
    return rows.map((row) => ({
      guildId: row.guild_id,
      type: row.type,
      targetId: row.target_id,
    }));
  }

  public logIncident(input: {
    guildId: string;
    userId: string;
    channelId: string | null;
    rule: string;
    action: string;
  }): void {
    this.db
      .prepare(
        `INSERT INTO automod_incidents (guild_id, user_id, channel_id, rule, action)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(input.guildId, input.userId, input.channelId, input.rule, input.action);
  }

  public listIncidents(guildId: string, limit = 10): AutomodIncident[] {
    const rows = this.db
      .prepare('SELECT * FROM automod_incidents WHERE guild_id = ? ORDER BY id DESC LIMIT ?')
      .all(guildId, limit) as AutomodIncidentRow[];
    return rows.map((row) => ({
      id: row.id,
      guildId: row.guild_id,
      userId: row.user_id,
      channelId: row.channel_id,
      rule: row.rule,
      action: row.action,
      createdAt: row.created_at,
    }));
  }
}
