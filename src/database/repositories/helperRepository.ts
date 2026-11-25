import type Database from 'better-sqlite3';

export type HelperMethod = 'luckperms' | 'skript';

export interface HelperSettings {
  guildId: string;
  enabled: boolean;
  groupName: string;
  method: HelperMethod;
  /** Template such as `helperaccept {player}`; only used by the Skript method. */
  skriptCommand: string | null;
  requireLink: boolean;
}

export interface HelperGrant {
  id: number;
  guildId: string;
  ticketId: number | null;
  channelId: string | null;
  discordId: string;
  player: string;
  approvedBy: string;
  method: string;
  result: 'success' | 'failure' | 'denied';
  detail: string | null;
  createdAt: string;
}

export interface MinecraftLink {
  guildId: string;
  discordId: string;
  player: string;
  linkedBy: string;
}

interface SettingsRow {
  guild_id: string;
  enabled: number;
  group_name: string;
  method: HelperMethod;
  skript_command: string | null;
  require_link: number;
}

export class HelperRepository {
  public constructor(private readonly db: Database.Database) {}

  public getSettings(guildId: string): HelperSettings {
    const row = this.db.prepare('SELECT * FROM helper_settings WHERE guild_id = ?').get(guildId) as
      SettingsRow | undefined;
    if (!row) {
      return {
        guildId,
        enabled: false,
        groupName: 'helper',
        method: 'luckperms',
        skriptCommand: null,
        requireLink: false,
      };
    }
    return {
      guildId,
      enabled: row.enabled === 1,
      groupName: row.group_name,
      method: row.method,
      skriptCommand: row.skript_command,
      requireLink: row.require_link === 1,
    };
  }

  public updateSettings(
    guildId: string,
    patch: Partial<Omit<HelperSettings, 'guildId'>>,
  ): HelperSettings {
    const next = { ...this.getSettings(guildId), ...patch };
    this.db
      .prepare(
        `INSERT INTO helper_settings (guild_id, enabled, group_name, method, skript_command, require_link)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(guild_id) DO UPDATE SET
           enabled = excluded.enabled, group_name = excluded.group_name,
           method = excluded.method, skript_command = excluded.skript_command,
           require_link = excluded.require_link, updated_at = datetime('now')`,
      )
      .run(
        guildId,
        next.enabled ? 1 : 0,
        next.groupName,
        next.method,
        next.skriptCommand,
        next.requireLink ? 1 : 0,
      );
    return next;
  }

  public getLinkByDiscord(guildId: string, discordId: string): MinecraftLink | null {
    const row = this.db
      .prepare(
        'SELECT guild_id, discord_id, player, linked_by FROM minecraft_links WHERE guild_id = ? AND discord_id = ?',
      )
      .get(guildId, discordId) as
      { guild_id: string; discord_id: string; player: string; linked_by: string } | undefined;
    return row
      ? {
          guildId: row.guild_id,
          discordId: row.discord_id,
          player: row.player,
          linkedBy: row.linked_by,
        }
      : null;
  }

  public getLinkByPlayer(guildId: string, player: string): MinecraftLink | null {
    const row = this.db
      .prepare(
        'SELECT guild_id, discord_id, player, linked_by FROM minecraft_links WHERE guild_id = ? AND lower(player) = lower(?)',
      )
      .get(guildId, player) as
      { guild_id: string; discord_id: string; player: string; linked_by: string } | undefined;
    return row
      ? {
          guildId: row.guild_id,
          discordId: row.discord_id,
          player: row.player,
          linkedBy: row.linked_by,
        }
      : null;
  }

  /** Links a Discord account to one player. Fails (false) if the player belongs to someone else. */
  public link(guildId: string, discordId: string, player: string, linkedBy: string): boolean {
    const owner = this.getLinkByPlayer(guildId, player);
    if (owner && owner.discordId !== discordId) return false;
    this.db
      .prepare(
        `INSERT INTO minecraft_links (guild_id, discord_id, player, linked_by) VALUES (?, ?, ?, ?)
         ON CONFLICT(guild_id, discord_id) DO UPDATE SET
           player = excluded.player, linked_by = excluded.linked_by, created_at = datetime('now')`,
      )
      .run(guildId, discordId, player, linkedBy);
    return true;
  }

  public unlink(guildId: string, discordId: string): boolean {
    return (
      this.db
        .prepare('DELETE FROM minecraft_links WHERE guild_id = ? AND discord_id = ?')
        .run(guildId, discordId).changes > 0
    );
  }

  public recordGrant(input: {
    guildId: string;
    ticketId: number | null;
    channelId: string | null;
    discordId: string;
    player: string;
    approvedBy: string;
    method: string;
    result: 'success' | 'failure' | 'denied';
    detail?: string | null;
  }): void {
    this.db
      .prepare(
        `INSERT INTO helper_grants
           (guild_id, ticket_id, channel_id, discord_id, player, approved_by, method, result, detail)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.guildId,
        input.ticketId,
        input.channelId,
        input.discordId,
        input.player,
        input.approvedBy,
        input.method,
        input.result,
        input.detail ?? null,
      );
  }

  public listGrants(guildId: string, limit = 10): HelperGrant[] {
    const rows = this.db
      .prepare('SELECT * FROM helper_grants WHERE guild_id = ? ORDER BY id DESC LIMIT ?')
      .all(guildId, limit) as Array<{
      id: number;
      guild_id: string;
      ticket_id: number | null;
      channel_id: string | null;
      discord_id: string;
      player: string;
      approved_by: string;
      method: string;
      result: HelperGrant['result'];
      detail: string | null;
      created_at: string;
    }>;
    return rows.map((row) => ({
      id: row.id,
      guildId: row.guild_id,
      ticketId: row.ticket_id,
      channelId: row.channel_id,
      discordId: row.discord_id,
      player: row.player,
      approvedBy: row.approved_by,
      method: row.method,
      result: row.result,
      detail: row.detail,
      createdAt: row.created_at,
    }));
  }
}
