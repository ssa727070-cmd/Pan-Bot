import type Database from 'better-sqlite3';

export interface AutoroleSettings {
  guildId: string;
  enabled: boolean;
  includeBots: boolean;
}

export interface AutorolePanel {
  id: number;
  guildId: string;
  channelId: string;
  messageId: string | null;
  title: string;
  description: string;
  maxSelections: number;
  createdAt: string;
  updatedAt: string;
}

export interface PanelRole {
  panelId: number;
  roleId: string;
  label: string;
  description: string;
  position: number;
}

export type PanelRoleInput = Omit<PanelRole, 'panelId'>;

interface AutoroleSettingsRow {
  guild_id: string;
  enabled: number;
  include_bots: number;
}

interface AutorolePanelRow {
  id: number;
  guild_id: string;
  channel_id: string;
  message_id: string | null;
  title: string;
  description: string;
  max_selections: number;
  created_at: string;
  updated_at: string;
}

interface PanelRoleRow {
  panel_id: number;
  role_id: string;
  label: string;
  description: string;
  position: number;
}

function toPanel(row: AutorolePanelRow): AutorolePanel {
  return {
    id: row.id,
    guildId: row.guild_id,
    channelId: row.channel_id,
    messageId: row.message_id,
    title: row.title,
    description: row.description,
    maxSelections: row.max_selections,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toPanelRole(row: PanelRoleRow): PanelRole {
  return {
    panelId: row.panel_id,
    roleId: row.role_id,
    label: row.label,
    description: row.description,
    position: row.position,
  };
}

export class AutoroleRepository {
  public constructor(private readonly db: Database.Database) {}

  public getSettings(guildId: string): AutoroleSettings {
    const row = this.db
      .prepare('SELECT guild_id, enabled, include_bots FROM autorole_settings WHERE guild_id = ?')
      .get(guildId) as AutoroleSettingsRow | undefined;

    return {
      guildId,
      enabled: row?.enabled === 1,
      includeBots: row?.include_bots === 1,
    };
  }

  public setSettings(
    guildId: string,
    patch: Partial<Pick<AutoroleSettings, 'enabled' | 'includeBots'>>,
  ): AutoroleSettings {
    const current = this.getSettings(guildId);
    const next = { ...current, ...patch };

    this.db
      .prepare(
        `INSERT INTO autorole_settings (guild_id, enabled, include_bots)
         VALUES (?, ?, ?)
         ON CONFLICT(guild_id) DO UPDATE SET
           enabled = excluded.enabled,
           include_bots = excluded.include_bots,
           updated_at = datetime('now')`,
      )
      .run(guildId, next.enabled ? 1 : 0, next.includeBots ? 1 : 0);

    return next;
  }

  public addRole(guildId: string, roleId: string): boolean {
    return (
      this.db
        .prepare('INSERT OR IGNORE INTO autorole_roles (guild_id, role_id) VALUES (?, ?)')
        .run(guildId, roleId).changes > 0
    );
  }

  public removeRole(guildId: string, roleId: string): boolean {
    return (
      this.db
        .prepare('DELETE FROM autorole_roles WHERE guild_id = ? AND role_id = ?')
        .run(guildId, roleId).changes > 0
    );
  }

  public listRoles(guildId: string): string[] {
    const rows = this.db
      .prepare('SELECT role_id FROM autorole_roles WHERE guild_id = ? ORDER BY role_id')
      .all(guildId) as Array<{ role_id: string }>;
    return rows.map((row) => row.role_id);
  }

  public createPanel(input: {
    guildId: string;
    channelId: string;
    title: string;
    description: string;
    maxSelections: number;
    roles: PanelRoleInput[];
  }): AutorolePanel {
    const create = this.db.transaction(() => {
      const result = this.db
        .prepare(
          `INSERT INTO role_panels (guild_id, channel_id, title, description, max_selections)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(input.guildId, input.channelId, input.title, input.description, input.maxSelections);

      const panelId = Number(result.lastInsertRowid);
      this.replacePanelRoles(panelId, input.roles);
      return panelId;
    });

    return this.getPanel(input.guildId, create())!;
  }

  public getPanel(guildId: string, panelId: number): AutorolePanel | null {
    const row = this.db
      .prepare('SELECT * FROM role_panels WHERE id = ? AND guild_id = ?')
      .get(panelId, guildId) as AutorolePanelRow | undefined;
    return row ? toPanel(row) : null;
  }

  public getPanelByMessage(messageId: string): AutorolePanel | null {
    const row = this.db.prepare('SELECT * FROM role_panels WHERE message_id = ?').get(messageId) as
      AutorolePanelRow | undefined;
    return row ? toPanel(row) : null;
  }

  public listPanels(guildId: string): AutorolePanel[] {
    const rows = this.db
      .prepare('SELECT * FROM role_panels WHERE guild_id = ? ORDER BY id')
      .all(guildId) as AutorolePanelRow[];
    return rows.map(toPanel);
  }

  public updatePanel(
    guildId: string,
    panelId: number,
    patch: Partial<Pick<AutorolePanel, 'title' | 'description' | 'maxSelections' | 'channelId'>>,
  ): boolean {
    const panel = this.getPanel(guildId, panelId);
    if (!panel) return false;

    const next = { ...panel, ...patch };
    return (
      this.db
        .prepare(
          `UPDATE role_panels SET title = ?, description = ?, max_selections = ?,
             channel_id = ?, updated_at = datetime('now')
           WHERE id = ? AND guild_id = ?`,
        )
        .run(next.title, next.description, next.maxSelections, next.channelId, panelId, guildId)
        .changes > 0
    );
  }

  public setPanelMessage(guildId: string, panelId: number, messageId: string): boolean {
    return (
      this.db
        .prepare(
          `UPDATE role_panels SET message_id = ?, updated_at = datetime('now')
           WHERE id = ? AND guild_id = ?`,
        )
        .run(messageId, panelId, guildId).changes > 0
    );
  }

  public deletePanel(guildId: string, panelId: number): boolean {
    return (
      this.db.prepare('DELETE FROM role_panels WHERE id = ? AND guild_id = ?').run(panelId, guildId)
        .changes > 0
    );
  }

  public getPanelRoles(panelId: number): PanelRole[] {
    const rows = this.db
      .prepare('SELECT * FROM role_panel_roles WHERE panel_id = ? ORDER BY position, role_id')
      .all(panelId) as PanelRoleRow[];
    return rows.map(toPanelRole);
  }

  /** Replaces every role on a panel atomically. */
  public replacePanelRoles(panelId: number, roles: PanelRoleInput[]): void {
    const replace = this.db.transaction(() => {
      this.db.prepare('DELETE FROM role_panel_roles WHERE panel_id = ?').run(panelId);
      const insert = this.db.prepare(
        `INSERT INTO role_panel_roles (panel_id, role_id, label, description, position)
         VALUES (?, ?, ?, ?, ?)`,
      );
      roles.forEach((role, index) => {
        insert.run(panelId, role.roleId, role.label, role.description, role.position ?? index);
      });
    });
    replace();
  }

  /** Removes dangling role IDs from both join roles and panels after a role is deleted. */
  public pruneDeletedRoles(guildId: string, existingRoleIds: ReadonlySet<string>): number {
    const prune = this.db.transaction(() => {
      let changes = 0;
      for (const roleId of this.listRoles(guildId)) {
        if (!existingRoleIds.has(roleId)) {
          changes += this.removeRole(guildId, roleId) ? 1 : 0;
        }
      }
      for (const panel of this.listPanels(guildId)) {
        for (const role of this.getPanelRoles(panel.id)) {
          if (!existingRoleIds.has(role.roleId)) {
            changes += this.db
              .prepare('DELETE FROM role_panel_roles WHERE panel_id = ? AND role_id = ?')
              .run(panel.id, role.roleId).changes;
          }
        }
      }
      return changes;
    });
    return prune();
  }
}
