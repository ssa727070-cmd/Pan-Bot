import { PermissionFlagsBits, type Guild } from 'discord.js';
import type { PanClient } from '../core/client.js';
import { logger } from '../core/logger.js';
import {
  StatisticsRepository,
  type GuildStatistics,
  type StatChannel,
  type StatMetric,
} from '../database/repositories/statisticsRepository.js';
import { createEmbed } from '../utils/embeds.js';

/** Channels are renamed at most once every 15 minutes unless explicitly forced. */
export const STATS_UPDATE_INTERVAL_MS = 15 * 60 * 1000;

const METRIC_LABELS: Record<StatMetric, string> = {
  members: 'Miembros',
  humans: 'Humanos',
  bots: 'Bots',
  total: 'Usuarios',
  messages: 'Mensajes',
};

export function metricName(metric: StatMetric, stats: GuildStatistics): string {
  const value = {
    members: stats.totalMembers,
    humans: stats.humanMembers,
    bots: stats.botMembers,
    total: stats.totalMembers,
    messages: stats.messagesTotal,
  }[metric];
  return `${METRIC_LABELS[metric]}: ${value}`;
}

/** Pure throttle decision: change of value always wins; otherwise respect the interval. */
export function shouldUpdateChannel(
  channel: StatChannel,
  newName: string,
  now: number,
  intervalMs = STATS_UPDATE_INTERVAL_MS,
): boolean {
  if (channel.lastName !== newName) return true;
  return now - channel.lastUpdatedAt >= intervalMs;
}

/** Uses the cache when possible and fetches once for an accurate snapshot. */
export async function snapshotMembers(
  guild: Guild,
): Promise<{ total: number; humans: number; bots: number }> {
  let members = [...guild.members.cache.values()];
  if (members.length === 0 || members.length < guild.memberCount) {
    try {
      members = [...(await guild.members.fetch()).values()];
    } catch {
      // Keep the cache snapshot if the member fetch is unavailable.
    }
  }
  const bots = members.filter((member) => member.user.bot).length;
  return {
    total: guild.memberCount || members.length,
    humans: Math.max(0, members.length - bots),
    bots,
  };
}

function repo(client: PanClient): StatisticsRepository {
  return new StatisticsRepository(client.db.sqlite);
}

/** Records a message without storing its content. */
export function recordMessage(client: PanClient, guildId: string, at = new Date()): void {
  repo(client).recordMessage(guildId, at);
}

export function recordJoin(client: PanClient, guildId: string, at = new Date()): void {
  repo(client).recordJoin(guildId, at);
}

export function recordLeave(client: PanClient, guildId: string, at = new Date()): void {
  repo(client).recordLeave(guildId, at);
}

const lastRefreshAttempt = new Map<string, number>();

/** Avoids snapshot/fetch work on every message; counter names still update on relevant events. */
export function shouldAttemptRefresh(
  guildId: string,
  now = Date.now(),
  intervalMs = 30_000,
): boolean {
  const last = lastRefreshAttempt.get(guildId) ?? 0;
  if (now - last < intervalMs) return false;
  lastRefreshAttempt.set(guildId, now);
  return true;
}

export interface RefreshOptions {
  force?: boolean;
  guild?: Guild;
}

/** Updates configured counter channels, prunes deleted ones and respects per-channel throttling. */
export async function refreshStatsChannels(
  client: PanClient,
  guildId: string,
  options: RefreshOptions = {},
): Promise<number> {
  const statistics = repo(client);
  const channels = statistics.listChannels(guildId);
  if (channels.length === 0) return 0;

  const guild = options.guild ?? client.guilds.cache.get(guildId);
  if (!guild) return 0;
  const members = await snapshotMembers(guild);
  statistics.setLiveMembers(guildId, members);

  const stats = statistics.get(guildId);
  const bot = guild.members.me ?? null;
  if (!bot?.permissions.has(PermissionFlagsBits.ManageChannels)) {
    logger.warn({ guildId }, 'Missing ManageChannels permission for statistics counters');
    return 0;
  }

  const now = Date.now();
  let updated = 0;

  for (const channel of channels) {
    const name = metricName(channel.metric, stats);
    if (!options.force && !shouldUpdateChannel(channel, name, now)) continue;

    try {
      const resolved = await client.channels.fetch(channel.channelId);
      if (!resolved || !('setName' in resolved) || typeof resolved.setName !== 'function') {
        statistics.removeChannel(guildId, channel.channelId);
        continue;
      }
      await resolved.setName(name, 'PAN BOT statistics counter');
      statistics.touchChannel(channel, name, now);
      updated += 1;
    } catch (error) {
      const code = (error as { code?: number }).code;
      if (code === 10003 || code === 50001) {
        statistics.removeChannel(guildId, channel.channelId);
      }
      logger.warn(
        { error, guildId, channelId: channel.channelId },
        'Could not update statistics channel',
      );
    }
  }

  return updated;
}

export function statisticsEmbed(
  stats: GuildStatistics,
  daily: Array<{ day: string; messages: number; joins: number; leaves: number }>,
) {
  const history = daily.length
    ? daily
        .map((row) => `\`${row.day}\` · 💬 ${row.messages} · ➕ ${row.joins} · ➖ ${row.leaves}`)
        .join('\n')
    : 'Sin datos históricos todavía.';

  return createEmbed({
    title: '📊 Estadísticas del servidor',
    fields: [
      {
        name: 'En vivo',
        value:
          `**Miembros:** ${stats.totalMembers}\n` +
          `**Humanos:** ${stats.humanMembers}\n` +
          `**Bots:** ${stats.botMembers}`,
        inline: true,
      },
      {
        name: 'Histórico',
        value:
          `**Entradas:** ${stats.joinsTotal}\n` +
          `**Salidas:** ${stats.leavesTotal}\n` +
          `**Mensajes:** ${stats.messagesTotal}`,
        inline: true,
      },
      {
        name: 'Actividad reciente (UTC)',
        value: history,
      },
    ],
    footer: 'PAN BOT · Los datos en vivo se actualizan con cada cambio',
  });
}
