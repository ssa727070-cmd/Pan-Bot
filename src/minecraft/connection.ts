import { env } from '../config/env.js';
import type { PanClient } from '../core/client.js';
import {
  MinecraftRepository,
  type MinecraftSettings,
} from '../database/repositories/minecraftRepository.js';
import { RconClient } from './rcon.js';

/**
 * Operator-controlled connection target. It comes exclusively from the process
 * environment: nothing a Discord user stores in the database can change where
 * the bot connects or where the RCON password is sent.
 */
export interface MinecraftEndpoint {
  host: string;
  queryPort: number;
  rconPort: number;
  password: string;
  rconTimeoutMs: number;
  rconRetries: number;
  statusTimeoutMs: number;
  /** Guilds allowed to use the integration. RCON requires an explicit entry. */
  allowedGuildIds: readonly string[];
}

export type RconUnavailableReason = 'no-password' | 'guild-not-authorized';

export interface MinecraftConnection {
  settings: MinecraftSettings;
  host: string;
  queryPort: number;
  rconPort: number;
  /** The guild may use the integration at all (status, panels, notifications). */
  guildAllowed: boolean;
  /** RCON can be used by this guild: password present and guild explicitly authorised. */
  rconConfigured: boolean;
  rconUnavailableReason: RconUnavailableReason | null;
  /** Legacy per-guild host/port overrides stored by v1.1.5 that are now ignored. */
  ignoredOverrides: boolean;
}

export function endpointFromEnv(): MinecraftEndpoint {
  return {
    host: env.MINECRAFT_HOST,
    queryPort: env.MINECRAFT_PORT,
    rconPort: env.MINECRAFT_RCON_PORT,
    password: env.MINECRAFT_RCON_PASSWORD,
    rconTimeoutMs: env.MINECRAFT_RCON_TIMEOUT_MS,
    rconRetries: env.MINECRAFT_RCON_RETRIES,
    statusTimeoutMs: env.MINECRAFT_STATUS_TIMEOUT_MS,
    allowedGuildIds: env.MINECRAFT_GUILD_IDS,
  };
}

/** Without an explicit list, every guild may read the public status of the fixed host. */
export function isGuildAllowed(guildId: string, endpoint: MinecraftEndpoint): boolean {
  return endpoint.allowedGuildIds.length === 0 || endpoint.allowedGuildIds.includes(guildId);
}

/** RCON is never available implicitly: the guild must be listed in MINECRAFT_GUILD_IDS. */
export function rconUnavailableReason(
  guildId: string,
  endpoint: MinecraftEndpoint,
): RconUnavailableReason | null {
  if (endpoint.password.length === 0) return 'no-password';
  if (!endpoint.allowedGuildIds.includes(guildId)) return 'guild-not-authorized';
  return null;
}

/** Resolves the fixed endpoint for a guild. Never includes the password. */
export function getMinecraftConnection(
  client: PanClient,
  guildId: string,
  endpoint: MinecraftEndpoint = endpointFromEnv(),
): MinecraftConnection {
  const settings = new MinecraftRepository(client.db.sqlite).getSettings(guildId);
  const reason = rconUnavailableReason(guildId, endpoint);
  return {
    settings,
    host: endpoint.host,
    queryPort: endpoint.queryPort,
    rconPort: endpoint.rconPort,
    guildAllowed: isGuildAllowed(guildId, endpoint),
    rconConfigured: reason === null,
    rconUnavailableReason: reason,
    ignoredOverrides:
      Boolean(settings.host?.trim()) || settings.queryPort !== null || settings.rconPort !== null,
  };
}

export function rconUnavailableMessage(reason: RconUnavailableReason): string {
  return reason === 'no-password'
    ? 'RCON no está configurado. Define `MINECRAFT_RCON_PASSWORD` en el entorno y comprueba que el hosting permita RCON.'
    : 'Este servidor de Discord no está autorizado para usar RCON. El operador del bot debe añadir su ID a `MINECRAFT_GUILD_IDS`.';
}

/** Opens, authenticates, runs one command and always closes the socket. */
export async function runRconCommand(
  _client: PanClient,
  guildId: string,
  command: string,
  endpoint: MinecraftEndpoint = endpointFromEnv(),
): Promise<string> {
  const reason = rconUnavailableReason(guildId, endpoint);
  if (reason) throw new Error(rconUnavailableMessage(reason));

  const rcon = new RconClient({
    host: endpoint.host,
    port: endpoint.rconPort,
    password: endpoint.password,
    timeoutMs: endpoint.rconTimeoutMs,
    maxRetries: endpoint.rconRetries,
  });
  try {
    return await rcon.send(command);
  } finally {
    rcon.close();
  }
}
