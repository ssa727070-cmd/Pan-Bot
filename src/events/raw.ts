import { Events } from 'discord.js';
import type { PanClient } from '../core/client.js';

/**
 * Forwards raw gateway voice packets to Lavalink (required for audio).
 * Registered directly in index.ts because discord.js emits `(packet, shardId)`
 * rather than passing the client to the listener.
 */
export function forwardRawPackets(client: PanClient): void {
  client.on(Events.Raw, (packet) => {
    void client.lavalink.sendRawData(packet as any);
  });
}
