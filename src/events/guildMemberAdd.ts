import { Events, type GuildMember } from 'discord.js';
import { assignJoinRoles } from '../autoroles/service.js';
import { logger } from '../core/logger.js';
import type { PanClient } from '../core/client.js';
import { GuildSettingsRepository } from '../database/repositories/guildSettings.js';
import { sendWelcome } from '../features/welcome.js';
import { notifyLogEvent } from '../logging/logService.js';
import { pruneDeletedRoles } from '../autoroles/maintenance.js';
import { recordJoin, refreshStatsChannels } from '../statistics/service.js';
import type { BotEvent } from '../types/event.js';

const event: BotEvent = {
  name: Events.GuildMemberAdd,

  async execute(member: GuildMember) {
    const client = member.client as PanClient;
    const settings = new GuildSettingsRepository(client.db.sqlite).get(member.guild.id);

    await sendWelcome(client, member.user, member.guild, settings);

    try {
      pruneDeletedRoles(client, member.guild);
      await assignJoinRoles(client, member);
    } catch (error) {
      logger.warn({ error, guildId: member.guild.id }, 'Automatic roles failed on member join');
    }

    try {
      recordJoin(client, member.guild.id, member.joinedAt ?? new Date());
      void refreshStatsChannels(client, member.guild.id, { guild: member.guild, force: true });
    } catch (error) {
      logger.warn({ error, guildId: member.guild.id }, 'Could not record join statistics');
    }

    await notifyLogEvent(client, member.guild.id, 'member_join', 'Miembro entró', [
      { name: 'Miembro', value: `<@${member.id}> (${member.user.tag})`, inline: false },
      { name: 'ID', value: `\`${member.id}\``, inline: false },
      { name: 'Miembros totales', value: String(member.guild.memberCount), inline: true },
      {
        name: 'Cuenta creada',
        value: `<t:${Math.floor(member.user.createdAt.getTime() / 1000)}:R>`,
        inline: true,
      },
    ]);
  },
};

export default event;
