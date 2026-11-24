import type { EmbedBuilder } from 'discord.js';
import { env } from '../config/env.js';
import type { PanClient } from '../core/client.js';
import { logger } from '../core/logger.js';
import { MinecraftRepository } from '../database/repositories/minecraftRepository.js';
import { infoEmbed, successEmbed, warningEmbed } from '../utils/embeds.js';
import { getMinecraftConnection, runRconCommand } from './connection.js';
import { sendMinecraftNotification, sendNotificationEmbeds } from './notifications.js';
import { parseListOutput, snapshotFromStatus, type PlayerSnapshot } from './players.js';
import { queryMinecraftStatus } from './status.js';
import type { MinecraftStatus } from './types.js';

const MIN_INTERVAL_MS = 30_000;
const TICK_MS = 30_000;
const JOIN_EVENT = 'player-join';
const LEAVE_EVENT = 'player-leave';

interface PlayerSession {
  name: string;
  /** Unique per connection: a reconnect always produces a new session. */
  sessionId: string;
}

interface MonitorState {
  /** Last *confirmed* server state; null until the first poll completes. */
  online: boolean | null;
  consecutiveFailures: number;
  sessions: Map<string, PlayerSession>;
  lastCheckedAt: number;
  inFlight: boolean;
  seeded: boolean;
}

export interface MonitorDependencies {
  query: typeof queryMinecraftStatus;
  /** Authoritative player list via RCON `list`, or null when unavailable. */
  listPlayers: (client: PanClient, guildId: string) => Promise<PlayerSnapshot | null>;
  offlineThreshold: number;
}

const states = new Map<string, MonitorState>();

export function resetMinecraftMonitorState(): void {
  states.clear();
}

/** Uses RCON `list` (complete) when this guild may use RCON; otherwise returns null. */
async function listPlayersViaRcon(
  client: PanClient,
  guildId: string,
): Promise<PlayerSnapshot | null> {
  if (!getMinecraftConnection(client, guildId).rconConfigured) return null;
  for (const command of ['minecraft:list', 'list']) {
    try {
      const parsed = parseListOutput(await runRconCommand(client, guildId, command));
      if (parsed) return parsed;
    } catch (error) {
      logger.debug({ error, guildId }, 'RCON list failed during Minecraft monitoring');
      return null;
    }
  }
  return null;
}

const defaultDependencies: MonitorDependencies = {
  query: queryMinecraftStatus,
  listPlayers: listPlayersViaRcon,
  offlineThreshold: env.MINECRAFT_OFFLINE_FAILURES,
};

function key(name: string): string {
  return name.toLowerCase();
}

function newSessionId(name: string, now: number): string {
  return `${key(name)}@${now}`;
}

/** Restores sessions persisted before a restart so online players are not re-announced. */
function seedState(repo: MinecraftRepository, guildId: string, state: MonitorState): void {
  for (const name of repo.getPlayers(guildId)) {
    const sessionId =
      repo.getNotificationFingerprint(guildId, JOIN_EVENT, key(name)) ?? `${key(name)}@restored`;
    state.sessions.set(key(name), { name, sessionId });
  }
  state.seeded = true;
}

function playerListEmbeds(
  title: string,
  verb: string,
  names: string[],
  build: typeof infoEmbed,
): EmbedBuilder[] {
  const embeds: EmbedBuilder[] = [];
  let lines: string[] = [];
  const flush = (): void => {
    if (lines.length === 0) return;
    embeds.push(build(title, lines.join('\n')));
    lines = [];
  };
  for (const name of names) {
    const line = `• **${name}** ${verb}`;
    if ([...lines, line].join('\n').length > 3900) flush();
    lines.push(line);
  }
  flush();
  return embeds;
}

async function announce(
  client: PanClient,
  repo: MinecraftRepository,
  guildId: string,
  event: typeof JOIN_EVENT | typeof LEAVE_EVENT,
  sessions: PlayerSession[],
): Promise<void> {
  // Skip sessions already announced (e.g. restored after a restart).
  const pending = sessions.filter(
    (session) =>
      repo.getNotificationFingerprint(guildId, event, key(session.name)) !== session.sessionId,
  );
  if (pending.length === 0) return;

  const names = pending.map((session) => session.name).sort((a, b) => a.localeCompare(b));
  const embeds =
    event === JOIN_EVENT
      ? playerListEmbeds('Jugadores conectados', 'se ha conectado.', names, infoEmbed)
      : playerListEmbeds('Jugadores desconectados', 'se ha desconectado.', names, infoEmbed);

  // One batched message per poll: simultaneous joins/leaves are never dropped.
  if (await sendNotificationEmbeds(client, guildId, embeds)) {
    for (const session of pending) {
      repo.markNotification(guildId, event, key(session.name), session.sessionId);
    }
  }
}

export async function pollMinecraftGuild(
  client: PanClient,
  guildId: string,
  now = Date.now(),
  dependencies: Partial<MonitorDependencies> = {},
): Promise<void> {
  const deps = { ...defaultDependencies, ...dependencies };
  const repo = new MinecraftRepository(client.db.sqlite);
  const settings = repo.getSettings(guildId);
  if (!settings.enabled) return;

  const connection = getMinecraftConnection(client, guildId);
  if (!connection.guildAllowed) return;

  const intervalMs = Math.max(settings.notifyIntervalSeconds * 1000, MIN_INTERVAL_MS);
  let state = states.get(guildId);
  if (!state) {
    state = {
      online: null,
      consecutiveFailures: 0,
      sessions: new Map(),
      lastCheckedAt: 0,
      inFlight: false,
      seeded: false,
    };
    states.set(guildId, state);
  }
  if (state.inFlight || now - state.lastCheckedAt < intervalMs) return;
  state.lastCheckedAt = now;
  state.inFlight = true;

  try {
    if (!state.seeded) seedState(repo, guildId, state);
    const target = `${connection.host}:${connection.queryPort}`;

    let status: MinecraftStatus | null = null;
    try {
      status = await deps.query({
        host: connection.host,
        port: connection.queryPort,
        timeoutMs: env.MINECRAFT_STATUS_TIMEOUT_MS,
      });
    } catch (error) {
      logger.debug({ error, guildId }, 'Minecraft status poll failed');
    }

    if (!status) {
      state.consecutiveFailures += 1;
      // Only a sustained outage counts: one lost ping is not "offline".
      if (state.consecutiveFailures >= deps.offlineThreshold && state.online !== false) {
        const wasOnline = state.online === true;
        state.online = false;
        state.sessions.clear();
        repo.setPlayers(guildId, []);
        if (wasOnline && settings.notifyOffline) {
          await sendMinecraftNotification(
            client,
            guildId,
            'server-offline',
            'server',
            `offline@${now}`,
            warningEmbed(
              'Servidor offline',
              `No se pudo contactar **${target}** en ${state.consecutiveFailures} comprobaciones seguidas.`,
            ),
          );
        }
      }
      return;
    }

    state.consecutiveFailures = 0;
    const wasOffline = state.online === false;
    state.online = true;
    if (wasOffline && settings.notifyOnline) {
      await sendMinecraftNotification(
        client,
        guildId,
        'server-online',
        'server',
        `online@${now}`,
        successEmbed('Servidor online', `**${target}** volvió a estar disponible.`),
      );
    }

    const snapshot = (await deps.listPlayers(client, guildId)) ?? snapshotFromStatus(status);
    // An incomplete list cannot tell who left: keep the current sessions unchanged.
    if (!snapshot.complete) return;

    const current = new Map(snapshot.players.map((name) => [key(name), name]));
    const joined: PlayerSession[] = [];
    const left: PlayerSession[] = [];
    for (const [id, name] of current) {
      if (state.sessions.has(id)) continue;
      const session = { name, sessionId: newSessionId(name, now) };
      state.sessions.set(id, session);
      joined.push(session);
    }
    for (const [id, session] of state.sessions) {
      if (current.has(id)) continue;
      state.sessions.delete(id);
      left.push(session);
    }

    repo.setPlayers(
      guildId,
      [...state.sessions.values()].map((session) => session.name),
    );
    // Persist the session id of every player, so a restart can restore it.
    for (const session of joined) {
      if (!settings.notifyJoin) {
        repo.markNotification(guildId, JOIN_EVENT, key(session.name), session.sessionId);
      }
    }
    if (settings.notifyJoin) await announce(client, repo, guildId, JOIN_EVENT, joined);
    if (settings.notifyLeave) await announce(client, repo, guildId, LEAVE_EVENT, left);
  } finally {
    state.inFlight = false;
  }
}

export function startMinecraftMonitor(client: PanClient): void {
  if (client.minecraftTimer) clearInterval(client.minecraftTimer);
  client.minecraftTimer = setInterval(() => {
    for (const guild of client.guilds.cache.values()) {
      void pollMinecraftGuild(client, guild.id).catch((error: unknown) => {
        logger.warn({ error, guildId: guild.id }, 'Minecraft monitor poll error');
      });
    }
  }, TICK_MS);
  client.minecraftTimer.unref();
}

export function stopMinecraftMonitor(client: PanClient): void {
  if (client.minecraftTimer) {
    clearInterval(client.minecraftTimer);
    client.minecraftTimer = null;
  }
}
