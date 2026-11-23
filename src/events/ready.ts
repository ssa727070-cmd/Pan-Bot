import { Events } from 'discord.js';
import type { PanClient } from '../core/client.js';
import { logger } from '../core/logger.js';
import type { BotEvent } from '../types/event.js';

const event: BotEvent = {
  name: Events.ClientReady,
  once: true,

  async execute(client: PanClient) {
    client.startedAt = new Date();
    if (!client.user) return;

    logger.info(
      {
        bot: client.user.tag,
        guilds: client.guilds.cache.size,
        commands: client.commands.size,
      },
      'PAN BOT is online',
    );
  },
};

export default event;
