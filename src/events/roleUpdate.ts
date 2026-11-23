import { Events, type Role } from 'discord.js';
import type { PanClient } from '../core/client.js';
import { notifyLogEvent } from '../logging/logService.js';
import type { BotEvent } from '../types/event.js';

const event: BotEvent = {
  name: Events.GuildRoleUpdate,

  async execute(oldRole: Role, newRole: Role) {
    const client = newRole.client as PanClient;
    const changes: Array<{ name: string; value: string; inline: boolean }> = [];

    if (oldRole.name !== newRole.name) {
      changes.push({
        name: 'Nombre',
        value: `\`${oldRole.name}\` → \`${newRole.name}\``,
        inline: false,
      });
    }
    if (oldRole.hexColor !== newRole.hexColor) {
      changes.push({
        name: 'Color',
        value: `${oldRole.hexColor} → ${newRole.hexColor}`,
        inline: true,
      });
    }
    if (oldRole.permissions.bitfield !== newRole.permissions.bitfield) {
      changes.push({ name: 'Permisos', value: 'Los permisos han cambiado.', inline: false });
    }
    if (oldRole.position !== newRole.position) {
      changes.push({
        name: 'Posición',
        value: `${oldRole.position} → ${newRole.position}`,
        inline: true,
      });
    }

    if (changes.length === 0) return;
    changes.push({ name: 'Rol', value: `<@&${newRole.id}>`, inline: true });

    await notifyLogEvent(client, newRole.guild.id, 'role_update', 'Rol actualizado', changes);
  },
};

export default event;
