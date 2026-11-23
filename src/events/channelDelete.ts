import { Events, type DMChannel, type NonThreadGuildBasedChannel } from 'discord.js';
import type { PanClient } from '../core/client.js';
import { notifyLogEvent } from '../logging/logService.js';
import type { BotEvent } from '../types/event.js';

const event: BotEvent = {
  name: Events.ChannelDelete,

  async execute(channel: DMChannel | NonThreadGuildBasedChannel) {
    if (!('guild' in channel)) return;
    const client = channel.client as PanClient;
    await notifyLogEvent(client, channel.guild.id, 'channel_delete', 'Canal eliminado', [
      { name: 'Canal', value: `\`${channel.name}\` (\`${channel.id}\`)`, inline: false },
      { name: 'Tipo', value: String(channel.type), inline: true },
    ]);
  },
};

export default event;
