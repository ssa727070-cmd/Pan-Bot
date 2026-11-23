import type Database from 'better-sqlite3';
import type { z } from 'zod';
import type { suggestionStatus } from '../../validation/config.js';

export type SuggestionStatus = z.infer<typeof suggestionStatus>;

export interface SuggestionSettings {
  guildId: string;
  channelId: string | null;
  staffRoleId: string | null;
  enabled: boolean;
}

export interface Suggestion {
  id: number;
  guildId: string;
  authorId: string;
  channelId: string | null;
  messageId: string | null;
  content: string;
  status: SuggestionStatus;
  staffResponse: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VoteCounts {
  up: number;
  down: number;
  score: number;
}

interface SuggestionSettingsRow {
  guild_id: string;
  channel_id: string | null;
  staff_role_id: string | null;
  enabled: number;
}

interface SuggestionRow {
  id: number;
  guild_id: string;
  author_id: string;
  channel_id: string | null;
  message_id: string | null;
  content: string;
  status: SuggestionStatus;
  staff_response: string | null;
  created_at: string;
  updated_at: string;
}

function toSuggestion(row: SuggestionRow): Suggestion {
  return {
    id: row.id,
    guildId: row.guild_id,
    authorId: row.author_id,
    channelId: row.channel_id,
    messageId: row.message_id,
    content: row.content,
    status: row.status,
    staffResponse: row.staff_response,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SuggestionRepository {
  public constructor(private readonly db: Database.Database) {}

  public getSettings(guildId: string): SuggestionSettings {
    const row = this.db
      .prepare('SELECT * FROM suggestion_settings WHERE guild_id = ?')
      .get(guildId) as SuggestionSettingsRow | undefined;
    return {
      guildId,
      channelId: row?.channel_id ?? null,
      staffRoleId: row?.staff_role_id ?? null,
      enabled: row?.enabled === 1,
    };
  }

  public setSettings(
    guildId: string,
    patch: Partial<Pick<SuggestionSettings, 'channelId' | 'staffRoleId' | 'enabled'>>,
  ): SuggestionSettings {
    const current = this.getSettings(guildId);
    const next = { ...current, ...patch };
    this.db
      .prepare(
        `INSERT INTO suggestion_settings (guild_id, channel_id, staff_role_id, enabled)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(guild_id) DO UPDATE SET
           channel_id = excluded.channel_id,
           staff_role_id = excluded.staff_role_id,
           enabled = excluded.enabled,
           updated_at = datetime('now')`,
      )
      .run(guildId, next.channelId, next.staffRoleId, next.enabled ? 1 : 0);
    return next;
  }

  public setStatusLabel(guildId: string, status: SuggestionStatus, label: string): void {
    this.db
      .prepare(
        `INSERT INTO suggestion_statuses (guild_id, status, label) VALUES (?, ?, ?)
         ON CONFLICT(guild_id, status) DO UPDATE SET label = excluded.label`,
      )
      .run(guildId, status, label);
  }

  public getStatusLabels(guildId: string): Partial<Record<SuggestionStatus, string>> {
    const rows = this.db
      .prepare('SELECT status, label FROM suggestion_statuses WHERE guild_id = ?')
      .all(guildId) as Array<{ status: SuggestionStatus; label: string }>;
    const result: Partial<Record<SuggestionStatus, string>> = {};
    for (const row of rows) result[row.status] = row.label;
    return result;
  }

  public create(input: {
    guildId: string;
    authorId: string;
    channelId: string | null;
    content: string;
  }): Suggestion {
    const result = this.db
      .prepare(
        `INSERT INTO suggestions (guild_id, author_id, channel_id, content)
         VALUES (?, ?, ?, ?)`,
      )
      .run(input.guildId, input.authorId, input.channelId, input.content);
    return this.get(input.guildId, Number(result.lastInsertRowid))!;
  }

  public get(guildId: string, id: number): Suggestion | null {
    const row = this.db
      .prepare('SELECT * FROM suggestions WHERE id = ? AND guild_id = ?')
      .get(id, guildId) as SuggestionRow | undefined;
    return row ? toSuggestion(row) : null;
  }

  public list(guildId: string, limit = 10): Suggestion[] {
    const rows = this.db
      .prepare('SELECT * FROM suggestions WHERE guild_id = ? ORDER BY id DESC LIMIT ?')
      .all(guildId, limit) as SuggestionRow[];
    return rows.map(toSuggestion);
  }

  public setMessageId(guildId: string, id: number, messageId: string): void {
    this.db
      .prepare(
        `UPDATE suggestions SET message_id = ?, updated_at = datetime('now')
         WHERE id = ? AND guild_id = ?`,
      )
      .run(messageId, id, guildId);
  }

  public setStatus(guildId: string, id: number, status: SuggestionStatus): boolean {
    return (
      this.db
        .prepare(
          `UPDATE suggestions SET status = ?, updated_at = datetime('now')
           WHERE id = ? AND guild_id = ?`,
        )
        .run(status, id, guildId).changes > 0
    );
  }

  public setResponse(guildId: string, id: number, response: string): boolean {
    return (
      this.db
        .prepare(
          `UPDATE suggestions SET staff_response = ?, updated_at = datetime('now')
           WHERE id = ? AND guild_id = ?`,
        )
        .run(response, id, guildId).changes > 0
    );
  }

  /** Casts, changes or removes a vote atomically and returns the resulting counts. */
  public vote(
    guildId: string,
    suggestionId: number,
    userId: string,
    value: 1 | -1 | null,
  ): VoteCounts | null {
    const apply = this.db.transaction(() => {
      const suggestion = this.get(guildId, suggestionId);
      if (!suggestion) return null;

      if (value === null) {
        this.db
          .prepare('DELETE FROM suggestion_votes WHERE suggestion_id = ? AND user_id = ?')
          .run(suggestionId, userId);
      } else {
        this.db
          .prepare(
            `INSERT INTO suggestion_votes (suggestion_id, user_id, value) VALUES (?, ?, ?)
             ON CONFLICT(suggestion_id, user_id) DO UPDATE SET value = excluded.value`,
          )
          .run(suggestionId, userId, value);
      }
      return this.counts(suggestionId);
    });
    return apply();
  }

  public getUserVote(suggestionId: number, userId: string): 1 | -1 | null {
    const row = this.db
      .prepare('SELECT value FROM suggestion_votes WHERE suggestion_id = ? AND user_id = ?')
      .get(suggestionId, userId) as { value: number } | undefined;
    return row ? (row.value === 1 ? 1 : -1) : null;
  }

  public counts(suggestionId: number): VoteCounts {
    const row = this.db
      .prepare(
        `SELECT
           COALESCE(SUM(CASE WHEN value = 1 THEN 1 ELSE 0 END), 0) AS up,
           COALESCE(SUM(CASE WHEN value = -1 THEN 1 ELSE 0 END), 0) AS down
         FROM suggestion_votes WHERE suggestion_id = ?`,
      )
      .get(suggestionId) as { up: number; down: number };
    return { up: row.up, down: row.down, score: row.up - row.down };
  }
}
