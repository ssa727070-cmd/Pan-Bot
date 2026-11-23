import { Events, type Role } from 'discord.js';
import type { PanClient } from '../core/client.js';
import { notifyLogEvent } from '../logging/logService.js';
import type { BotEvent } from '../types/event.js';

const event: BotEvent = {
  name: Events.GuildRoleCreate,

  async execute(role: Role) {
    const client = role.client as PanClient;
    await notifyLogEvent(client, role.guild.id, 'role_create', 'Rol creado', [
      { name: 'Rol', value: `<@&${role.id}>`, inline: true },
      { name: 'Nombre', value: role.name, inline: true },
      { name: 'Color', value: role.hexColor, inline: true },
    ]);
  },
};

export default event;
