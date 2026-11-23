import type Database from 'better-sqlite3';

export interface GuildStatistics {
  guildId: string;
  totalMembers: number;
  humanMembers: number;
  botMembers: number;
  joinsTotal: number;
  leavesTotal: number;
  messagesTotal: number;
  messagesDay: number;
  messagesWeek: number;
  dayKey: string;
  weekKey: string;
  lastMessageAt: string | null;
  updatedAt: string;
}

export type StatMetric = 'members' | 'humans' | 'bots' | 'total' | 'messages';

export interface StatChannel {
  guildId: string;
  channelId: string;
  metric: StatMetric;
  lastName: string | null;
  lastUpdatedAt: number;
}

interface GuildStatisticsRow {
  guild_id: string;
  total_members: number;
  human_members: number;
  bot_members: number;
  joins_total: number;
  leaves_total: number;
  messages_total: number;
  messages_day: number;
  messages_week: number;
  day_key: string;
  week_key: string;
  last_message_at: string | null;
  updated_at: string;
}

interface StatChannelRow {
  guild_id: string;
  channel_id: string;
  metric: StatMetric;
  last_name: string | null;
  last_updated_at: number;
}

export function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** ISO-like UTC week key (YYYY-Www). */
export function weekKey(date: Date): string {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNumber = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((target.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function toStatistics(row: GuildStatisticsRow): GuildStatistics {
  return {
    guildId: row.guild_id,
    totalMembers: row.total_members,
    humanMembers: row.human_members,
    botMembers: row.bot_members,
    joinsTotal: row.joins_total,
    leavesTotal: row.leaves_total,
    messagesTotal: row.messages_total,
    messagesDay: row.messages_day,
    messagesWeek: row.messages_week,
    dayKey: row.day_key,
    weekKey: row.week_key,
    lastMessageAt: row.last_message_at,
    updatedAt: row.updated_at,
  };
}

function toStatChannel(row: StatChannelRow): StatChannel {
  return {
    guildId: row.guild_id,
    channelId: row.channel_id,
    metric: row.metric,
    lastName: row.last_name,
    lastUpdatedAt: row.last_updated_at,
  };
}

export class StatisticsRepository {
  public constructor(private readonly db: Database.Database) {}

  public get(guildId: string): GuildStatistics {
    this.ensure(guildId);
    const row = this.db
      .prepare('SELECT * FROM guild_statistics WHERE guild_id = ?')
      .get(guildId) as GuildStatisticsRow;
    return toStatistics(row);
  }

  public ensure(guildId: string): void {
    const now = new Date();
    this.db
      .prepare(
        'INSERT OR IGNORE INTO guild_statistics (guild_id, day_key, week_key) VALUES (?, ?, ?)',
      )
      .run(guildId, dayKey(now), weekKey(now));
  }

  /** Stores the latest live member snapshot. Live values are never mixed with historical counters. */
  public setLiveMembers(
    guildId: string,
    members: { total: number; humans: number; bots: number },
  ): GuildStatistics {
    this.ensure(guildId);
    this.db
      .prepare(
        `UPDATE guild_statistics SET total_members = ?, human_members = ?, bot_members = ?,
           updated_at = datetime('now') WHERE guild_id = ?`,
      )
      .run(members.total, members.humans, members.bots, guildId);
    return this.get(guildId);
  }

  public recordJoin(guildId: string, at: Date = new Date()): void {
    const apply = this.db.transaction(() => {
      this.rollover(guildId, at);
      this.db
        .prepare(
          `UPDATE guild_statistics SET joins_total = joins_total + 1, updated_at = datetime('now')
           WHERE guild_id = ?`,
        )
        .run(guildId);
      this.bumpDaily(guildId, at, 'joins');
    });
    apply();
  }

  public recordLeave(guildId: string, at: Date = new Date()): void {
    const apply = this.db.transaction(() => {
      this.rollover(guildId, at);
      this.db
        .prepare(
          `UPDATE guild_statistics SET leaves_total = leaves_total + 1, updated_at = datetime('now')
           WHERE guild_id = ?`,
        )
        .run(guildId);
      this.bumpDaily(guildId, at, 'leaves');
    });
    apply();
  }

  public recordMessage(guildId: string, at: Date = new Date()): void {
    const apply = this.db.transaction(() => {
      this.rollover(guildId, at);
      this.db
        .prepare(
          `UPDATE guild_statistics SET messages_total = messages_total + 1,
             messages_day = messages_day + 1, messages_week = messages_week + 1,
             last_message_at = ?, updated_at = datetime('now')
           WHERE guild_id = ?`,
        )
        .run(at.toISOString(), guildId);
      this.bumpDaily(guildId, at, 'messages');
    });
    apply();
  }

  /** Resets day/week counters when UTC period changes. */
  private rollover(guildId: string, at: Date): void {
    this.ensure(guildId);
    const stats = this.get(guildId);
    const day = dayKey(at);
    const week = weekKey(at);
    if (stats.dayKey === day && stats.weekKey === week) return;

    this.db
      .prepare(
        `UPDATE guild_statistics SET messages_day = ?, messages_week = ?,
           day_key = ?, week_key = ?, updated_at = datetime('now') WHERE guild_id = ?`,
      )
      .run(
        stats.dayKey === day ? stats.messagesDay : 0,
        stats.weekKey === week ? stats.messagesWeek : 0,
        day,
        week,
        guildId,
      );
  }

  private bumpDaily(guildId: string, at: Date, column: 'joins' | 'leaves' | 'messages'): void {
    this.db
      .prepare(
        `INSERT INTO stats_daily (guild_id, day, ${column}) VALUES (?, ?, 1)
         ON CONFLICT(guild_id, day) DO UPDATE SET ${column} = ${column} + 1`,
      )
      .run(guildId, dayKey(at));
  }

  public getDaily(
    guildId: string,
    days = 7,
  ): Array<{ day: string; joins: number; leaves: number; messages: number }> {
    const rows = this.db
      .prepare(
        `SELECT day, joins, leaves, messages FROM stats_daily
         WHERE guild_id = ? ORDER BY day DESC LIMIT ?`,
      )
      .all(guildId, days) as Array<{
      day: string;
      joins: number;
      leaves: number;
      messages: number;
    }>;
    return rows.reverse();
  }

  public setChannel(guildId: string, channelId: string, metric: StatMetric): void {
    this.db
      .prepare(
        `INSERT INTO stat_channels (guild_id, channel_id, metric) VALUES (?, ?, ?)
         ON CONFLICT(guild_id, channel_id) DO UPDATE SET metric = excluded.metric`,
      )
      .run(guildId, channelId, metric);
  }

  public removeChannel(guildId: string, channelId: string): boolean {
    return (
      this.db
        .prepare('DELETE FROM stat_channels WHERE guild_id = ? AND channel_id = ?')
        .run(guildId, channelId).changes > 0
    );
  }

  public clearChannels(guildId: string): number {
    return this.db.prepare('DELETE FROM stat_channels WHERE guild_id = ?').run(guildId).changes;
  }

  public listChannels(guildId: string): StatChannel[] {
    const rows = this.db
      .prepare('SELECT * FROM stat_channels WHERE guild_id = ? ORDER BY channel_id')
      .all(guildId) as StatChannelRow[];
    return rows.map(toStatChannel);
  }

  public listAllChannels(): StatChannel[] {
    const rows = this.db.prepare('SELECT * FROM stat_channels').all() as StatChannelRow[];
    return rows.map(toStatChannel);
  }

  public touchChannel(channel: StatChannel, newName: string, now: number): void {
    this.db
      .prepare(
        `UPDATE stat_channels SET last_name = ?, last_updated_at = ?
         WHERE guild_id = ? AND channel_id = ?`,
      )
      .run(newName, now, channel.guildId, channel.channelId);
  }
}
