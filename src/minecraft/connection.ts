import { env } from '../config/env.js';
import type { PanClient } from '../core/client.js';
import { MinecraftRepository } from '../database/repositories/minecraftRepository.js';
import { RconClient } from './rcon.js';

export interface MinecraftConnection {
  settings: ReturnType<MinecraftRepository['getSettings']>;
  host: string;
  queryPort: number;
  rconPort: number;
  rconConfigured: boolean;
}

/** Resolves per-guild overrides, then environment defaults. Never includes the password. */
export function getMinecraftConnection(client: PanClient, guildId: string): MinecraftConnection {
  const settings = new MinecraftRepository(client.db.sqlite).getSettings(guildId);
  return {
    settings,
    host: settings.host?.trim() || env.MINECRAFT_HOST,
    queryPort: settings.queryPort ?? env.MINECRAFT_PORT,
    rconPort: settings.rconPort ?? env.MINECRAFT_RCON_PORT,
    rconConfigured: env.MINECRAFT_RCON_PASSWORD.length > 0,
  };
}

export function createRconClient(client: PanClient, guildId: string): RconClient | null {
  const connection = getMinecraftConnection(client, guildId);
  if (!connection.rconConfigured) return null;
  return new RconClient({
    host: connection.host,
    port: connection.rconPort,
    password: env.MINECRAFT_RCON_PASSWORD,
    timeoutMs: env.MINECRAFT_RCON_TIMEOUT_MS,
    maxRetries: env.MINECRAFT_RCON_RETRIES,
  });
}

/** Opens, authenticates, runs one command and always closes the socket. */
export async function runRconCommand(
  client: PanClient,
  guildId: string,
  command: string,
): Promise<string> {
  const rcon = createRconClient(client, guildId);
  if (!rcon) {
    throw new Error(
      'RCON no está configurado. Define MINECRAFT_RCON_PASSWORD y comprueba que el hosting permita RCON.',
    );
  }
  try {
    return await rcon.send(command);
  } finally {
    rcon.close();
  }
}
