import { Events, type Role } from 'discord.js';
import type { PanClient } from '../core/client.js';
import { notifyLogEvent } from '../logging/logService.js';
import type { BotEvent } from '../types/event.js';

const event: BotEvent = {
  name: Events.GuildRoleDelete,

  async execute(role: Role) {
    const client = role.client as PanClient;
    await notifyLogEvent(client, role.guild.id, 'role_delete', 'Rol eliminado', [
      { name: 'Rol', value: `\`${role.name}\` (\`${role.id}\`)`, inline: false },
      { name: 'Color', value: role.hexColor, inline: true },
      { name: 'Posición', value: String(role.position), inline: true },
    ]);
  },
};

export default event;
