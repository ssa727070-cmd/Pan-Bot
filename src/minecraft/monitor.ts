import type { PanClient } from '../core/client.js';
import { logger } from '../core/logger.js';
import { MinecraftRepository } from '../database/repositories/minecraftRepository.js';
import { infoEmbed, warningEmbed, successEmbed } from '../utils/embeds.js';
import { env } from '../config/env.js';
import { getMinecraftConnection } from './connection.js';
import { sendMinecraftNotification } from './service.js';
import { queryMinecraftStatus } from './status.js';
import type { MinecraftStatus } from './types.js';

const MIN_INTERVAL_MS = 30_000;

interface MonitorState {
  online: boolean | null;
  players: Set<string>;
  lastCheckedAt: number;
}

const states = new Map<string, MonitorState>();

function key(guildId: string): string {
  return guildId;
}

function diffPlayers(
  previous: Set<string>,
  next: Set<string>,
): { joined: string[]; left: string[] } {
  const joined = [...next].filter((player) => !previous.has(player)).sort();
  const left = [...previous].filter((player) => !next.has(player)).sort();
  return { joined, left };
}

export function resetMinecraftMonitorState(): void {
  states.clear();
}

export async function pollMinecraftGuild(
  client: PanClient,
  guildId: string,
  now = Date.now(),
  query: typeof queryMinecraftStatus = queryMinecraftStatus,
): Promise<void> {
  const repo = new MinecraftRepository(client.db.sqlite);
  const settings = repo.getSettings(guildId);
  if (!settings.enabled) return;

  const connection = getMinecraftConnection(client, guildId);
  const intervalMs = Math.max(settings.notifyIntervalSeconds * 1000, MIN_INTERVAL_MS);
  const state = states.get(key(guildId)) ?? {
    online: null,
    players: new Set<string>(),
    lastCheckedAt: 0,
  };
  if (now - state.lastCheckedAt < intervalMs) return;
  state.lastCheckedAt = now;
  states.set(key(guildId), state);

  let status: MinecraftStatus | null = null;
  try {
    status = await query({
      host: connection.host,
      port: connection.queryPort,
      timeoutMs: env.MINECRAFT_STATUS_TIMEOUT_MS,
    });
  } catch (error) {
    logger.debug({ error, guildId }, 'Minecraft status poll failed');
  }

  const online = status !== null;
  const nextPlayers = new Set((status?.playerNames ?? []).map((name) => name.toLowerCase()));

  if (state.online !== null && state.online !== online) {
    if (online && settings.notifyOnline) {
      await sendMinecraftNotification(
        client,
        guildId,
        'server-online',
        'server',
        `online:${connection.host}:${connection.queryPort}`,
        successEmbed(
          'Servidor online',
          `**${connection.host}:${connection.queryPort}** volvió a estar disponible.`,
        ),
      );
    }
    if (!online && settings.notifyOffline) {
      await sendMinecraftNotification(
        client,
        guildId,
        'server-offline',
        'server',
        `offline:${connection.host}:${connection.queryPort}`,
        warningEmbed(
          'Servidor offline',
          `No se pudo contactar **${connection.host}:${connection.queryPort}**.`,
        ),
      );
    }
  }

  if (online && status) {
    const previousPlayers = state.players;
    const { joined, left } = diffPlayers(previousPlayers, nextPlayers);

    if (settings.notifyJoin) {
      for (const player of joined) {
        await sendMinecraftNotification(
          client,
          guildId,
          'player-join',
          player,
          `join:${player}:${new Date().toISOString().slice(0, 13)}`,
          infoEmbed('Jugador conectado', `**${player}** se ha conectado al servidor.`),
        );
      }
    }

    if (settings.notifyLeave) {
      for (const player of left) {
        await sendMinecraftNotification(
          client,
          guildId,
          'player-leave',
          player,
          `leave:${player}:${new Date().toISOString().slice(0, 13)}`,
          infoEmbed('Jugador desconectado', `**${player}** se ha desconectado del servidor.`),
        );
      }
    }

    repo.setPlayers(guildId, [...nextPlayers]);
  }

  state.online = online;
  state.players = nextPlayers;
}

export function startMinecraftMonitor(client: PanClient): void {
  if (client.minecraftTimer) clearInterval(client.minecraftTimer);
  client.minecraftTimer = setInterval(() => {
    for (const guild of client.guilds.cache.values()) {
      void pollMinecraftGuild(client, guild.id).catch((error) => {
        logger.warn({ error, guildId: guild.id }, 'Minecraft monitor poll error');
      });
    }
  }, 30_000);
  client.minecraftTimer.unref();
}

export function stopMinecraftMonitor(client: PanClient): void {
  if (client.minecraftTimer) {
    clearInterval(client.minecraftTimer);
    client.minecraftTimer = null;
  }
}
