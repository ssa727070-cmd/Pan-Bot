import { Events, type Message } from 'discord.js';
import { runAutomod } from '../automod/pipeline.js';
import type { PanClient } from '../core/client.js';
import { logger } from '../core/logger.js';
import {
  recordMessage,
  refreshStatsChannels,
  shouldAttemptRefresh,
} from '../statistics/service.js';
import type { BotEvent } from '../types/event.js';

const event: BotEvent = {
  name: Events.MessageCreate,

  async execute(message: Message) {
    if (!message.guild || message.author.bot || message.system) return;
    const client = message.client as PanClient;
    const guildId = message.guild.id;

    try {
      recordMessage(client, guildId, message.createdAt);
    } catch (error) {
      logger.warn({ error, guildId }, 'Could not record message statistics');
    }

    try {
      await runAutomod(client, message);
    } catch (error) {
      logger.warn({ error, guildId }, 'AutoMod pipeline failed');
    }

    if (shouldAttemptRefresh(guildId)) {
      void refreshStatsChannels(client, guildId, { guild: message.guild });
    }
  },
};

export default event;
