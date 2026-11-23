import type Database from 'better-sqlite3';

export interface Warning {
  id: number;
  guildId: string;
  userId: string;
  moderatorId: string;
  reason: string;
  active: boolean;
  createdAt: string;
}

interface WarningRow {
  id: number;
  guild_id: string;
  user_id: string;
  moderator_id: string;
  reason: string;
  active: number;
  created_at: string;
}

function toWarning(row: WarningRow): Warning {
  return {
    id: row.id,
    guildId: row.guild_id,
    userId: row.user_id,
    moderatorId: row.moderator_id,
    reason: row.reason,
    active: row.active === 1,
    createdAt: row.created_at,
  };
}

export class WarningRepository {
  public constructor(private readonly db: Database.Database) {}

  public add(guildId: string, userId: string, moderatorId: string, reason: string): Warning {
    const result = this.db
      .prepare(
        `INSERT INTO warnings (guild_id, user_id, moderator_id, reason)
         VALUES (?, ?, ?, ?)`,
      )
      .run(guildId, userId, moderatorId, reason);

    return this.getById(Number(result.lastInsertRowid))!;
  }

  public getById(id: number): Warning | null {
    const row = this.db.prepare('SELECT * FROM warnings WHERE id = ?').get(id) as
      WarningRow | undefined;
    return row ? toWarning(row) : null;
  }

  public list(guildId: string, userId: string, activeOnly = true): Warning[] {
    const sql = activeOnly
      ? 'SELECT * FROM warnings WHERE guild_id = ? AND user_id = ? AND active = 1 ORDER BY id DESC'
      : 'SELECT * FROM warnings WHERE guild_id = ? AND user_id = ? ORDER BY id DESC';
    return (this.db.prepare(sql).all(guildId, userId) as WarningRow[]).map(toWarning);
  }

  public countActive(guildId: string, userId: string): number {
    const row = this.db
      .prepare(
        'SELECT COUNT(*) AS count FROM warnings WHERE guild_id = ? AND user_id = ? AND active = 1',
      )
      .get(guildId, userId) as { count: number };
    return row.count;
  }

  public deactivate(id: number): boolean {
    return (
      this.db.prepare('UPDATE warnings SET active = 0 WHERE id = ? AND active = 1').run(id)
        .changes > 0
    );
  }
}
