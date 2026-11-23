import { LavalinkManager } from 'lavalink-client';
import { env } from '../config/env.js';
import type { PanClient } from './client.js';

/** Creates the Lavalink manager. It is initialised with bot identity in the `ready` event. */
export function createLavalinkManager(client: PanClient): LavalinkManager {
  const manager = new LavalinkManager({
    nodes: [
      {
        id: 'main',
        host: env.LAVALINK_HOST,
        port: env.LAVALINK_PORT,
        authorization: env.LAVALINK_PASSWORD,
        secure: env.LAVALINK_SECURE,
      },
    ],
    sendToShard: (guildId, payload) => {
      client.guilds.cache.get(guildId)?.shard?.send(payload);
    },
    autoSkip: true,
    playerOptions: {
      defaultSearchPlatform: 'ytsearch',
      onEmptyQueue: {
        destroyAfterMs: 30_000,
      },
    },
  });

  return manager;
}
