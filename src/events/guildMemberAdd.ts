import { Events, type GuildMember } from 'discord.js';
import type { PanClient } from '../core/client.js';
import { GuildSettingsRepository } from '../database/repositories/guildSettings.js';
import { sendWelcome } from '../features/welcome.js';
import { notifyLogEvent } from '../logging/logService.js';
import type { BotEvent } from '../types/event.js';

const event: BotEvent = {
  name: Events.GuildMemberAdd,

  async execute(member: GuildMember) {
    const client = member.client as PanClient;
    const settings = new GuildSettingsRepository(client.db.sqlite).get(member.guild.id);

    await sendWelcome(client, member.user, member.guild, settings);

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
