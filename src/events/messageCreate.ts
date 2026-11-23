import { Events, type Message } from 'discord.js';
import { analyzeMessage } from '../automod/detection.js';
import { applyAutomodAction, automodTracker, isExempt } from '../automod/service.js';
import type { PanClient } from '../core/client.js';
import { logger } from '../core/logger.js';
import { AutomodRepository } from '../database/repositories/automodRepository.js';
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

    const automod = new AutomodRepository(client.db.sqlite);
    const settings = automod.getSettings(guildId);
    if (!settings.enabled || isExemptCache(message)) {
      if (shouldAttemptRefresh(guildId)) {
        void refreshStatsChannels(client, guildId, { guild: message.guild });
      }
      return;
    }

    const member =
      message.member ?? (await message.guild.members.fetch(message.author.id).catch(() => null));
    if (!member) return;

    const exemptions = automod.listExemptions(guildId);
    if (isExempt(member, settings, exemptions, message.channel.id, Boolean(message.webhookId))) {
      if (shouldAttemptRefresh(guildId)) {
        void refreshStatsChannels(client, guildId, { guild: message.guild });
      }
      return;
    }

    const now = Date.now();
    const windowMs = settings.spamWindowSeconds * 1000;
    const history = automodTracker.recent(guildId, message.author.id, windowMs, now);
    const match = analyzeMessage({
      content: message.content,
      mentionCount: message.mentions.users.size,
      now,
      history,
      settings,
      words: automod.listWords(guildId),
    });
    automodTracker.record(
      guildId,
      message.author.id,
      { content: message.content, at: now },
      windowMs,
    );

    if (match && !automodTracker.shouldThrottle(guildId, message.author.id, now)) {
      try {
        await applyAutomodAction(client, message, match, settings);
      } catch (error) {
        logger.warn({ error, guildId, rule: match.rule }, 'AutoMod action failed');
      }
    }

    if (shouldAttemptRefresh(guildId)) {
      void refreshStatsChannels(client, guildId, { guild: message.guild });
    }
  },
};

function isExemptCache(message: Message): boolean {
  return Boolean(message.webhookId);
}

export default event;
