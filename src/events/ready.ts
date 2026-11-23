import { Events } from 'discord.js';
import type { PanClient } from '../core/client.js';
import { logger } from '../core/logger.js';
import { AutomodRepository } from '../database/repositories/automodRepository.js';
import { syncNativeRules } from '../automod/nativeRules.js';
import { refreshStatsChannels } from '../statistics/service.js';
import { startMinecraftMonitor } from '../minecraft/monitor.js';
import type { BotEvent } from '../types/event.js';

export const STATS_INTERVAL_MS = 15 * 60 * 1000;

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

    // Restore persistent features after a restart without re-registering slash commands.
    const automod = new AutomodRepository(client.db.sqlite);
    for (const guild of client.guilds.cache.values()) {
      if (automod.getSettings(guild.id).nativeRules) {
        void syncNativeRules(client, guild, automod.getSettings(guild.id));
      }
      void refreshStatsChannels(client, guild.id, { guild });
    }

    client.statsTimer = setInterval(() => {
      for (const guild of client.guilds.cache.values()) {
        void refreshStatsChannels(client, guild.id, { guild });
      }
    }, STATS_INTERVAL_MS);
    client.statsTimer.unref();

    startMinecraftMonitor(client);
  },
};

export default event;
