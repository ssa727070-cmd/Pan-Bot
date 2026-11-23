import { Events, type GuildBan } from 'discord.js';
import type { PanClient } from '../core/client.js';
import { notifyLogEvent } from '../logging/logService.js';
import type { BotEvent } from '../types/event.js';

const event: BotEvent = {
  name: Events.GuildBanRemove,

  async execute(ban: GuildBan) {
    const client = ban.client as PanClient;
    await notifyLogEvent(client, ban.guild.id, 'unban', 'Usuario desbaneado', [
      { name: 'Usuario', value: `<@${ban.user.id}> (${ban.user.tag})`, inline: false },
      { name: 'Razón', value: ban.reason || 'Sin razón especificada', inline: false },
    ]);
  },
};

export default event;
