import { Events, type NonThreadGuildBasedChannel } from 'discord.js';
import type { PanClient } from '../core/client.js';
import { notifyLogEvent } from '../logging/logService.js';
import type { BotEvent } from '../types/event.js';

const event: BotEvent = {
  name: Events.ChannelUpdate,

  async execute(oldChannel: object, newChannel: object) {
    // DM channels are not registered in guild logs.
    if (!oldChannel || !newChannel || !('guild' in newChannel) || !('guild' in oldChannel)) return;
    const before = oldChannel as NonThreadGuildBasedChannel;
    const after = newChannel as NonThreadGuildBasedChannel;
    const client = after.client as PanClient;

    const changes: Array<{ name: string; value: string; inline: boolean }> = [];
    if ('name' in before && 'name' in after && before.name !== after.name) {
      changes.push({
        name: 'Nombre',
        value: `\`${before.name}\` → \`${after.name}\``,
        inline: false,
      });
    }
    if ('topic' in before && 'topic' in after && before.topic !== after.topic) {
      changes.push({
        name: 'Tema',
        value: `\`${before.topic ?? 'ninguno'}\` → \`${after.topic ?? 'ninguno'}\``,
        inline: false,
      });
    }
    if ('position' in before && 'position' in after && before.position !== after.position) {
      changes.push({
        name: 'Posición',
        value: `${before.position} → ${after.position}`,
        inline: true,
      });
    }

    if (changes.length === 0) return;
    changes.push({ name: 'Canal', value: `<#${after.id}>`, inline: true });

    await notifyLogEvent(client, after.guild.id, 'channel_update', 'Canal actualizado', changes);
  },
};

export default event;
