import type { PanClient } from '../core/client.js';
import { logger } from '../core/logger.js';
import { createEmbed } from '../utils/embeds.js';
import { truncate } from '../utils/format.js';
import { playerTextChannel } from './player.js';

let registered = false;

/** Attends manager-level Lavalink events once, after `lavalink.init()`. */
export function registerLavalinkEvents(client: PanClient): void {
  if (registered) return;
  registered = true;

  client.lavalink.on('trackStart', async (player, track) => {
    if (!track) return;
    logger.info({ guildId: player.guildId, track: track.info.title }, 'Track started');

    const channel = await playerTextChannel(client, player);
    if (!channel) return;

    await channel
      .send({
        embeds: [
          createEmbed({
            title: '🎵 Now playing',
            description: `**[${truncate(track.info.title, 100)}](${track.info.uri})**\nBy ${track.info.author}`,
            thumbnail: track.info.artworkUrl ?? undefined,
            footer: `Requested by ${(track.requester as { username?: string } | undefined)?.username ?? 'unknown'}`,
          }),
        ],
      })
      .catch((error: unknown) => logger.warn({ error }, 'Could not send now-playing message'));
  });

  client.lavalink.on('trackError', (_player, track, payload) => {
    logger.error({ track: track?.info.title, exception: payload.exception }, 'Track error');
  });

  client.lavalink.on('queueEnd', (player) => {
    logger.info({ guildId: player.guildId }, 'Queue ended');
  });

  client.lavalink.nodeManager.on('connect', (node) => {
    logger.info({ node: node.options.id }, 'Lavalink node connected');
  });

  client.lavalink.nodeManager.on('disconnect', (node, reason) => {
    logger.warn({ node: node.options.id, reason }, 'Lavalink node disconnected');
  });

  client.lavalink.nodeManager.on('error', (node, error) => {
    logger.error({ node: node.options.id, error }, 'Lavalink node error');
  });
}
