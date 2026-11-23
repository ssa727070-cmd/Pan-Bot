import { Events, type GuildMember } from 'discord.js';
import { logger } from '../core/logger.js';
import type { PanClient } from '../core/client.js';
import { GuildSettingsRepository } from '../database/repositories/guildSettings.js';
import { sendGoodbye } from '../features/welcome.js';
import { notifyLogEvent } from '../logging/logService.js';
import { recordLeave, refreshStatsChannels } from '../statistics/service.js';
import type { BotEvent } from '../types/event.js';

const event: BotEvent = {
  name: Events.GuildMemberRemove,

  async execute(member: GuildMember) {
    const client = member.client as PanClient;
    const guild = member.guild;
    const settings = new GuildSettingsRepository(client.db.sqlite).get(guild.id);

    await sendGoodbye(client, member.user, guild, settings);

    try {
      recordLeave(client, guild.id);
      void refreshStatsChannels(client, guild.id, { guild, force: true });
    } catch (error) {
      logger.warn({ error, guildId: guild.id }, 'Could not record leave statistics');
    }

    await notifyLogEvent(client, guild.id, 'member_leave', 'Miembro salió', [
      { name: 'Miembro', value: `<@${member.id}> (${member.user.tag})`, inline: false },
      { name: 'ID', value: `\`${member.id}\``, inline: false },
      { name: 'Miembros restantes', value: String(guild.memberCount), inline: true },
      {
        name: 'Se unió',
        value: member.joinedAt
          ? `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:R>`
          : 'Desconocido',
        inline: true,
      },
    ]);
  },
};

export default event;
