import type Database from 'better-sqlite3';
import type { MinecraftLevel, MinecraftPanelKind } from '../../minecraft/types.js';
import { redactSecrets } from '../../minecraft/redact.js';

export interface MinecraftSettings {
  guildId: string;
  enabled: boolean;
  host: string | null;
  queryPort: number | null;
  rconPort: number | null;
  notificationChannelId: string | null;
  auditChannelId: string | null;
  panelChannelId: string | null;
  notifyJoin: boolean;
  notifyLeave: boolean;
  notifyOnline: boolean;
  notifyOffline: boolean;
  notifyIntervalSeconds: number;
  maintenanceEnabled: boolean;
  maintenanceMessage: string;
  maintenanceWhitelist: boolean;
  unrestrictedConsole: boolean;
  lastProbeAt: number | null;
}

export type MinecraftSettingsPatch = Partial<Omit<MinecraftSettings, 'guildId'>>;

export interface MinecraftRole {
  guildId: string;
  level: MinecraftLevel;
  roleId: string;
}

export interface MinecraftAllowedCommand {
  guildId: string;
  command: string;
  argPattern: string;
  createdBy: string;
}

export interface MinecraftPanel {
  id: number;
  guildId: string;
  channelId: string;
  messageId: string | null;
  kind: MinecraftPanelKind;
  title: string;
}

export interface MinecraftAuditEntry {
  id: number;
  guildId: string;
  adminId: string;
  action: string;
  targetPlayer: string | null;
  command: string | null;
  result: 'success' | 'failure' | 'denied';
  error: string | null;
  createdAt: string;
}

interface SettingsRow {
  guild_id: string;
  enabled: number;
  host: string | null;
  query_port: number | null;
  rcon_port: number | null;
  notification_channel_id: string | null;
  audit_channel_id: string | null;
  panel_channel_id: string | null;
  notify_join: number;
  notify_leave: number;
  notify_online: number;
  notify_offline: number;
  notify_interval_seconds: number;
  maintenance_enabled: number;
  maintenance_message: string;
  maintenance_whitelist: number;
  unrestricted_console: number;
  last_probe_at: number | null;
}

interface PanelRow {
  id: number;
  guild_id: string;
  channel_id: string;
  message_id: string | null;
  kind: MinecraftPanelKind;
  title: string;
}

interface AuditRow {
  id: number;
  guild_id: string;
  admin_id: string;
  action: string;
  target_player: string | null;
  command: string | null;
  result: 'success' | 'failure' | 'denied';
  error: string | null;
  created_at: string;
}

function toSettings(row: SettingsRow): MinecraftSettings {
  return {
    guildId: row.guild_id,
    enabled: row.enabled === 1,
    host: row.host,
    queryPort: row.query_port,
    rconPort: row.rcon_port,
    notificationChannelId: row.notification_channel_id,
    auditChannelId: row.audit_channel_id,
    panelChannelId: row.panel_channel_id,
    notifyJoin: row.notify_join === 1,
    notifyLeave: row.notify_leave === 1,
    notifyOnline: row.notify_online === 1,
    notifyOffline: row.notify_offline === 1,
    notifyIntervalSeconds: row.notify_interval_seconds,
    maintenanceEnabled: row.maintenance_enabled === 1,
    maintenanceMessage: row.maintenance_message,
    maintenanceWhitelist: row.maintenance_whitelist === 1,
    unrestrictedConsole: row.unrestricted_console === 1,
    lastProbeAt: row.last_probe_at,
  };
}

function toPanel(row: PanelRow): MinecraftPanel {
  return {
    id: row.id,
    guildId: row.guild_id,
    channelId: row.channel_id,
    messageId: row.message_id,
    kind: row.kind,
    title: row.title,
  };
}

function toAudit(row: AuditRow): MinecraftAuditEntry {
  return {
    id: row.id,
    guildId: row.guild_id,
    adminId: row.admin_id,
    action: row.action,
    targetPlayer: row.target_player,
    command: row.command,
    result: row.result,
    error: row.error,
    createdAt: row.created_at,
  };
}

const SETTINGS_COLUMNS: Record<keyof MinecraftSettingsPatch, string> = {
  enabled: 'enabled',
  host: 'host',
  queryPort: 'query_port',
  rconPort: 'rcon_port',
  notificationChannelId: 'notification_channel_id',
  auditChannelId: 'audit_channel_id',
  panelChannelId: 'panel_channel_id',
  notifyJoin: 'notify_join',
  notifyLeave: 'notify_leave',
  notifyOnline: 'notify_online',
  notifyOffline: 'notify_offline',
  notifyIntervalSeconds: 'notify_interval_seconds',
  maintenanceEnabled: 'maintenance_enabled',
  maintenanceMessage: 'maintenance_message',
  maintenanceWhitelist: 'maintenance_whitelist',
  unrestrictedConsole: 'unrestricted_console',
  lastProbeAt: 'last_probe_at',
};

export class MinecraftRepository {
  public constructor(private readonly db: Database.Database) {}

  public getSettings(guildId: string): MinecraftSettings {
    const row = this.db
      .prepare('SELECT * FROM minecraft_settings WHERE guild_id = ?')
      .get(guildId) as SettingsRow | undefined;

    if (row) return toSettings(row);

    return {
      guildId,
      enabled: false,
      host: null,
      queryPort: null,
      rconPort: null,
      notificationChannelId: null,
      auditChannelId: null,
      panelChannelId: null,
      notifyJoin: true,
      notifyLeave: true,
      notifyOnline: true,
      notifyOffline: true,
      notifyIntervalSeconds: 60,
      maintenanceEnabled: false,
      maintenanceMessage: 'El servidor está en mantenimiento. Volveremos pronto.',
      maintenanceWhitelist: false,
      unrestrictedConsole: false,
      lastProbeAt: null,
    };
  }

  public updateSettings(guildId: string, patch: MinecraftSettingsPatch): MinecraftSettings {
    // `undefined` means "not provided": keep the stored value instead of writing NULL
    // (which cleared configured channels and violated NOT NULL columns).
    const entries = Object.entries(patch).filter(
      ([key, value]) => key in SETTINGS_COLUMNS && value !== undefined,
    ) as Array<[keyof MinecraftSettingsPatch, unknown]>;
    if (entries.length === 0) return this.getSettings(guildId);

    const columns = entries.map(([key]) => SETTINGS_COLUMNS[key]);
    const values = entries.map(([, value]) =>
      typeof value === 'boolean' ? (value ? 1 : 0) : value,
    );
    const assignments = columns.map((column) => `${column} = excluded.${column}`);

    this.db
      .prepare(
        `INSERT INTO minecraft_settings (guild_id, ${columns.join(', ')})
         VALUES (?, ${columns.map(() => '?').join(', ')})
         ON CONFLICT(guild_id) DO UPDATE SET
           ${assignments.join(', ')}, updated_at = datetime('now')`,
      )
      .run(guildId, ...values);

    return this.getSettings(guildId);
  }

  public addRole(guildId: string, level: MinecraftLevel, roleId: string): boolean {
    return (
      this.db
        .prepare(
          `INSERT OR IGNORE INTO minecraft_roles (guild_id, level, role_id) VALUES (?, ?, ?)`,
        )
        .run(guildId, level, roleId).changes > 0
    );
  }

  public removeRole(guildId: string, level: MinecraftLevel, roleId: string): boolean {
    return (
      this.db
        .prepare('DELETE FROM minecraft_roles WHERE guild_id = ? AND level = ? AND role_id = ?')
        .run(guildId, level, roleId).changes > 0
    );
  }

  public listRoles(guildId: string, level?: MinecraftLevel): MinecraftRole[] {
    const rows = (
      level
        ? this.db
            .prepare('SELECT * FROM minecraft_roles WHERE guild_id = ? AND level = ?')
            .all(guildId, level)
        : this.db.prepare('SELECT * FROM minecraft_roles WHERE guild_id = ?').all(guildId)
    ) as Array<{ guild_id: string; level: MinecraftLevel; role_id: string }>;

    return rows.map((row) => ({ guildId: row.guild_id, level: row.level, roleId: row.role_id }));
  }

  public clearRoles(guildId: string, level?: MinecraftLevel): number {
    return level
      ? this.db
          .prepare('DELETE FROM minecraft_roles WHERE guild_id = ? AND level = ?')
          .run(guildId, level).changes
      : this.db.prepare('DELETE FROM minecraft_roles WHERE guild_id = ?').run(guildId).changes;
  }

  public addAllowedCommand(
    guildId: string,
    command: string,
    argPattern: string,
    createdBy: string,
  ): boolean {
    return (
      this.db
        .prepare(
          `INSERT INTO minecraft_command_allowlist (guild_id, command, arg_pattern, created_by)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(guild_id, command) DO UPDATE SET
             arg_pattern = excluded.arg_pattern,
             created_by = excluded.created_by,
             created_at = datetime('now')`,
        )
        .run(guildId, command.toLowerCase(), argPattern, createdBy).changes > 0
    );
  }

  public removeAllowedCommand(guildId: string, command: string): boolean {
    return (
      this.db
        .prepare('DELETE FROM minecraft_command_allowlist WHERE guild_id = ? AND command = ?')
        .run(guildId, command.toLowerCase()).changes > 0
    );
  }

  public listAllowedCommands(guildId: string): MinecraftAllowedCommand[] {
    const rows = this.db
      .prepare('SELECT * FROM minecraft_command_allowlist WHERE guild_id = ? ORDER BY command')
      .all(guildId) as Array<{
      guild_id: string;
      command: string;
      arg_pattern: string;
      created_by: string;
    }>;
    return rows.map((row) => ({
      guildId: row.guild_id,
      command: row.command,
      argPattern: row.arg_pattern,
      createdBy: row.created_by,
    }));
  }

  public createPanel(input: {
    guildId: string;
    channelId: string;
    kind: MinecraftPanelKind;
    title: string;
  }): MinecraftPanel {
    const result = this.db
      .prepare(
        `INSERT INTO minecraft_panels (guild_id, channel_id, kind, title)
         VALUES (?, ?, ?, ?)`,
      )
      .run(input.guildId, input.channelId, input.kind, input.title);
    return this.getPanel(input.guildId, Number(result.lastInsertRowid))!;
  }

  public getPanel(guildId: string, panelId: number): MinecraftPanel | null {
    const row = this.db
      .prepare('SELECT * FROM minecraft_panels WHERE id = ? AND guild_id = ?')
      .get(panelId, guildId) as PanelRow | undefined;
    return row ? toPanel(row) : null;
  }

  public getPanelByMessage(messageId: string): MinecraftPanel | null {
    const row = this.db
      .prepare('SELECT * FROM minecraft_panels WHERE message_id = ?')
      .get(messageId) as PanelRow | undefined;
    return row ? toPanel(row) : null;
  }

  public listPanels(guildId: string): MinecraftPanel[] {
    const rows = this.db
      .prepare('SELECT * FROM minecraft_panels WHERE guild_id = ? ORDER BY id')
      .all(guildId) as PanelRow[];
    return rows.map(toPanel);
  }

  public setPanelMessage(guildId: string, panelId: number, messageId: string | null): boolean {
    return (
      this.db
        .prepare(
          `UPDATE minecraft_panels SET message_id = ?, updated_at = datetime('now')
           WHERE id = ? AND guild_id = ?`,
        )
        .run(messageId, panelId, guildId).changes > 0
    );
  }

  public setPanelKind(guildId: string, panelId: number, kind: MinecraftPanelKind): boolean {
    return (
      this.db
        .prepare(
          `UPDATE minecraft_panels SET kind = ?, updated_at = datetime('now')
           WHERE id = ? AND guild_id = ?`,
        )
        .run(kind, panelId, guildId).changes > 0
    );
  }

  public deletePanel(guildId: string, panelId: number): boolean {
    return (
      this.db
        .prepare('DELETE FROM minecraft_panels WHERE id = ? AND guild_id = ?')
        .run(panelId, guildId).changes > 0
    );
  }

  public recordAudit(input: {
    guildId: string;
    adminId: string;
    action: string;
    targetPlayer?: string | null;
    command?: string | null;
    result: 'success' | 'failure' | 'denied';
    error?: string | null;
  }): void {
    this.db
      .prepare(
        `INSERT INTO minecraft_audit_log
           (guild_id, admin_id, action, target_player, command, result, error)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.guildId,
        input.adminId,
        redactSecrets(input.action).slice(0, 100),
        input.targetPlayer ? redactSecrets(input.targetPlayer).slice(0, 64) : null,
        input.command ? redactSecrets(input.command).slice(0, 500) : null,
        input.result,
        input.error ? redactSecrets(input.error) : null,
      );
  }

  public listAudit(guildId: string, limit = 20): MinecraftAuditEntry[] {
    const rows = this.db
      .prepare('SELECT * FROM minecraft_audit_log WHERE guild_id = ? ORDER BY id DESC LIMIT ?')
      .all(guildId, Math.min(Math.max(limit, 1), 100)) as AuditRow[];
    return rows.map(toAudit);
  }

  public getNotificationFingerprint(
    guildId: string,
    eventKey: string,
    subject: string,
  ): string | null {
    const row = this.db
      .prepare(
        `SELECT fingerprint FROM minecraft_notification_state
         WHERE guild_id = ? AND event_key = ? AND subject = ?`,
      )
      .get(guildId, eventKey, subject) as { fingerprint: string } | undefined;
    return row?.fingerprint ?? null;
  }

  public markNotification(
    guildId: string,
    eventKey: string,
    subject: string,
    fingerprint: string,
  ): void {
    this.db
      .prepare(
        `INSERT INTO minecraft_notification_state
           (guild_id, event_key, subject, fingerprint, last_sent_at)
         VALUES (?, ?, ?, ?, datetime('now'))
         ON CONFLICT(guild_id, event_key, subject) DO UPDATE SET
           fingerprint = excluded.fingerprint,
           last_sent_at = datetime('now')`,
      )
      .run(guildId, eventKey, subject, redactSecrets(fingerprint).slice(0, 200));
  }

  public getPlayers(guildId: string): string[] {
    const rows = this.db
      .prepare('SELECT player FROM minecraft_player_state WHERE guild_id = ? ORDER BY player')
      .all(guildId) as Array<{ player: string }>;
    return rows.map((row) => row.player);
  }

  public setPlayers(guildId: string, players: string[], at = new Date()): void {
    const replace = this.db.transaction(() => {
      this.db.prepare('DELETE FROM minecraft_player_state WHERE guild_id = ?').run(guildId);
      const insert = this.db.prepare(
        `INSERT INTO minecraft_player_state (guild_id, player, last_seen_at) VALUES (?, ?, ?)`,
      );
      const timestamp = at.toISOString();
      for (const player of players) insert.run(guildId, player, timestamp);
    });
    replace();
  }
}
