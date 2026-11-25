import type Database from 'better-sqlite3';

export type TicketStatus = 'open' | 'accepted' | 'claimed' | 'closing' | 'closed';
export type TicketRoleKind = 'support' | 'excluded' | 'closer';

export interface TicketSettings {
  guildId: string;
  enabled: boolean;
  panelChannelId: string | null;
  categoryId: string | null;
  archiveChannelId: string | null;
  allowMultiple: boolean;
  maxOpenPerUser: number;
  creatorCanClose: boolean;
}

export type TicketSettingsPatch = Partial<Omit<TicketSettings, 'guildId'>>;

export interface TicketEvent {
  id: number;
  ticketId: number;
  type: string;
  actorId: string | null;
  detail: string | null;
  createdAt: string;
}

interface TicketSettingsRow {
  guild_id: string;
  enabled: number;
  panel_channel_id: string | null;
  category_id: string | null;
  archive_channel_id: string | null;
  allow_multiple: number;
  max_open_per_user: number;
  creator_can_close: number;
}

export interface Ticket {
  id: number;
  guildId: string;
  channelId: string;
  creatorId: string;
  claimerId: string | null;
  topic: string | null;
  status: TicketStatus;
  transcript: string | null;
  createdAt: string;
  closedAt: string | null;
  ticketNumber: number | null;
  acceptedBy: string | null;
  acceptedAt: string | null;
  claimedAt: string | null;
  closedBy: string | null;
}

interface TicketRow {
  id: number;
  guild_id: string;
  channel_id: string;
  creator_id: string;
  claimer_id: string | null;
  topic: string | null;
  status: TicketStatus;
  transcript: string | null;
  created_at: string;
  closed_at: string | null;
  ticket_number: number | null;
  accepted_by: string | null;
  accepted_at: string | null;
  claimed_at: string | null;
  closed_by: string | null;
}

function toTicket(row: TicketRow): Ticket {
  return {
    id: row.id,
    guildId: row.guild_id,
    channelId: row.channel_id,
    creatorId: row.creator_id,
    claimerId: row.claimer_id,
    topic: row.topic,
    status: row.status,
    transcript: row.transcript,
    createdAt: row.created_at,
    closedAt: row.closed_at,
    ticketNumber: row.ticket_number,
    acceptedBy: row.accepted_by,
    acceptedAt: row.accepted_at,
    claimedAt: row.claimed_at,
    closedBy: row.closed_by,
  };
}

const SETTINGS_COLUMNS: Record<keyof Omit<TicketSettings, 'guildId'>, string> = {
  enabled: 'enabled',
  panelChannelId: 'panel_channel_id',
  categoryId: 'category_id',
  archiveChannelId: 'archive_channel_id',
  allowMultiple: 'allow_multiple',
  maxOpenPerUser: 'max_open_per_user',
  creatorCanClose: 'creator_can_close',
};

function toSettings(row: TicketSettingsRow): TicketSettings {
  return {
    guildId: row.guild_id,
    enabled: row.enabled === 1,
    panelChannelId: row.panel_channel_id,
    categoryId: row.category_id,
    archiveChannelId: row.archive_channel_id,
    allowMultiple: row.allow_multiple === 1,
    maxOpenPerUser: row.max_open_per_user,
    creatorCanClose: row.creator_can_close === 1,
  };
}

export class TicketRepository {
  public constructor(private readonly db: Database.Database) {}

  public create(
    guildId: string,
    channelId: string,
    creatorId: string,
    topic: string | null,
    ticketNumber: number | null = null,
  ): Ticket {
    this.db
      .prepare(
        `INSERT INTO tickets (guild_id, channel_id, creator_id, topic, ticket_number)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(guildId, channelId, creatorId, topic, ticketNumber);
    return this.getByChannel(channelId)!;
  }

  public getByChannel(channelId: string): Ticket | null {
    const row = this.db.prepare('SELECT * FROM tickets WHERE channel_id = ?').get(channelId) as
      TicketRow | undefined;
    return row ? toTicket(row) : null;
  }

  public getById(id: number): Ticket | null {
    const row = this.db.prepare('SELECT * FROM tickets WHERE id = ?').get(id) as
      TicketRow | undefined;
    return row ? toTicket(row) : null;
  }

  /** Staff acknowledges the ticket. Only an untouched ticket can be accepted. */
  public accept(channelId: string, userId: string): boolean {
    return (
      this.db
        .prepare(
          `UPDATE tickets SET accepted_by = ?, accepted_at = datetime('now'), status = 'accepted'
           WHERE channel_id = ? AND status = 'open'`,
        )
        .run(userId, channelId).changes > 0
    );
  }

  /** Assigns the ticket to one staff member. Atomic: only the first claim wins. */
  public claim(channelId: string, userId: string): boolean {
    return (
      this.db
        .prepare(
          `UPDATE tickets SET claimer_id = ?, claimed_at = datetime('now'), status = 'claimed'
           WHERE channel_id = ? AND status IN ('open', 'accepted') AND claimer_id IS NULL`,
        )
        .run(userId, channelId).changes > 0
    );
  }

  /** Atomically moves a live ticket to `closing`, so concurrent closes cannot both proceed. */
  public beginClose(channelId: string, userId: string): boolean {
    return (
      this.db
        .prepare(
          `UPDATE tickets SET status = 'closing', closed_by = ?
           WHERE channel_id = ? AND status IN ('open', 'accepted', 'claimed')`,
        )
        .run(userId, channelId).changes > 0
    );
  }

  public finishClose(channelId: string, transcript: string): boolean {
    return (
      this.db
        .prepare(
          `UPDATE tickets SET status = 'closed', transcript = ?, closed_at = datetime('now')
           WHERE channel_id = ? AND status = 'closing'`,
        )
        .run(transcript, channelId).changes > 0
    );
  }

  /** Marks a ticket closed regardless of progress (channel vanished or recovery after a crash). */
  public forceClose(channelId: string, note: string, userId: string | null = null): boolean {
    return (
      this.db
        .prepare(
          `UPDATE tickets SET status = 'closed', closed_at = datetime('now'),
             closed_by = COALESCE(closed_by, ?), transcript = COALESCE(transcript, ?)
           WHERE channel_id = ? AND status != 'closed'`,
        )
        .run(userId, note, channelId).changes > 0
    );
  }

  /** Tickets that were not fully closed; used to reconcile state after a restart. */
  public listUnfinished(): Ticket[] {
    const rows = this.db
      .prepare(`SELECT * FROM tickets WHERE status != 'closed' ORDER BY id`)
      .all() as TicketRow[];
    return rows.map(toTicket);
  }

  public countOpenByCreator(guildId: string, userId: string): number {
    return this.openByCreator(guildId, userId).length;
  }

  public getSettings(guildId: string): TicketSettings {
    const row = this.db.prepare('SELECT * FROM ticket_settings WHERE guild_id = ?').get(guildId) as
      TicketSettingsRow | undefined;
    if (row) return toSettings(row);
    return {
      guildId,
      enabled: true,
      panelChannelId: null,
      categoryId: null,
      archiveChannelId: null,
      allowMultiple: false,
      maxOpenPerUser: 1,
      creatorCanClose: true,
    };
  }

  public updateSettings(guildId: string, patch: TicketSettingsPatch): TicketSettings {
    const next = { ...this.getSettings(guildId), ...patch };
    const keys = Object.keys(SETTINGS_COLUMNS) as Array<keyof Omit<TicketSettings, 'guildId'>>;
    const columns = keys.map((key) => SETTINGS_COLUMNS[key]);
    const values = keys.map((key) => {
      const value = next[key];
      return typeof value === 'boolean' ? (value ? 1 : 0) : value;
    });
    this.db
      .prepare(
        `INSERT INTO ticket_settings (guild_id, ${columns.join(', ')})
         VALUES (?, ${columns.map(() => '?').join(', ')})
         ON CONFLICT(guild_id) DO UPDATE SET
           ${columns.map((column) => `${column} = excluded.${column}`).join(', ')},
           updated_at = datetime('now')`,
      )
      .run(guildId, ...values);
    return this.getSettings(guildId);
  }

  public addRole(guildId: string, kind: TicketRoleKind, roleId: string): boolean {
    return (
      this.db
        .prepare('INSERT OR IGNORE INTO ticket_roles (guild_id, kind, role_id) VALUES (?, ?, ?)')
        .run(guildId, kind, roleId).changes > 0
    );
  }

  public removeRole(guildId: string, kind: TicketRoleKind, roleId: string): boolean {
    return (
      this.db
        .prepare('DELETE FROM ticket_roles WHERE guild_id = ? AND kind = ? AND role_id = ?')
        .run(guildId, kind, roleId).changes > 0
    );
  }

  public listRoles(guildId: string, kind: TicketRoleKind): string[] {
    const rows = this.db
      .prepare('SELECT role_id FROM ticket_roles WHERE guild_id = ? AND kind = ? ORDER BY role_id')
      .all(guildId, kind) as Array<{ role_id: string }>;
    return rows.map((row) => row.role_id);
  }

  public recordEvent(input: {
    guildId: string;
    ticketId: number;
    type: string;
    actorId?: string | null;
    detail?: string | null;
  }): void {
    this.db
      .prepare(
        `INSERT INTO ticket_events (guild_id, ticket_id, type, actor_id, detail)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(input.guildId, input.ticketId, input.type, input.actorId ?? null, input.detail ?? null);
  }

  public listEvents(ticketId: number): TicketEvent[] {
    const rows = this.db
      .prepare('SELECT * FROM ticket_events WHERE ticket_id = ? ORDER BY id')
      .all(ticketId) as Array<{
      id: number;
      ticket_id: number;
      type: string;
      actor_id: string | null;
      detail: string | null;
      created_at: string;
    }>;
    return rows.map((row) => ({
      id: row.id,
      ticketId: row.ticket_id,
      type: row.type,
      actorId: row.actor_id,
      detail: row.detail,
      createdAt: row.created_at,
    }));
  }

  public close(channelId: string, transcript: string): boolean {
    return (
      this.db
        .prepare(
          `UPDATE tickets SET status = 'closed', transcript = ?, closed_at = datetime('now')
           WHERE channel_id = ? AND status != 'closed'`,
        )
        .run(transcript, channelId).changes > 0
    );
  }

  public addParticipant(ticketId: number, userId: string): void {
    this.db
      .prepare('INSERT OR IGNORE INTO ticket_participants (ticket_id, user_id) VALUES (?, ?)')
      .run(ticketId, userId);
  }

  public removeParticipant(ticketId: number, userId: string): boolean {
    return (
      this.db
        .prepare('DELETE FROM ticket_participants WHERE ticket_id = ? AND user_id = ?')
        .run(ticketId, userId).changes > 0
    );
  }

  public participants(ticketId: number): string[] {
    const rows = this.db
      .prepare('SELECT user_id FROM ticket_participants WHERE ticket_id = ?')
      .all(ticketId) as Array<{ user_id: string }>;
    return rows.map((row) => row.user_id);
  }

  public openByCreator(guildId: string, userId: string): Ticket[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM tickets WHERE guild_id = ? AND creator_id = ? AND status != 'closed'
         ORDER BY id DESC`,
      )
      .all(guildId, userId) as TicketRow[];
    return rows.map(toTicket);
  }
}
