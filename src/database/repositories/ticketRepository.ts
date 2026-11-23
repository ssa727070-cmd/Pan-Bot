import type Database from 'better-sqlite3';

export type TicketStatus = 'open' | 'claimed' | 'closed';

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
  };
}

export class TicketRepository {
  public constructor(private readonly db: Database.Database) {}

  public create(
    guildId: string,
    channelId: string,
    creatorId: string,
    topic: string | null,
  ): Ticket {
    this.db
      .prepare(
        `INSERT INTO tickets (guild_id, channel_id, creator_id, topic)
         VALUES (?, ?, ?, ?)`,
      )
      .run(guildId, channelId, creatorId, topic);
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

  public claim(channelId: string, userId: string): boolean {
    return (
      this.db
        .prepare(
          `UPDATE tickets SET claimer_id = ?, status = 'claimed'
           WHERE channel_id = ? AND status = 'open'`,
        )
        .run(userId, channelId).changes > 0
    );
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
