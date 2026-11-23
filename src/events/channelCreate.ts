import { Events, type NonThreadGuildBasedChannel } from 'discord.js';
import type { PanClient } from '../core/client.js';
import { notifyLogEvent } from '../logging/logService.js';
import type { BotEvent } from '../types/event.js';

const event: BotEvent = {
  name: Events.ChannelCreate,

  async execute(channel: NonThreadGuildBasedChannel) {
    const client = channel.client as PanClient;
    await notifyLogEvent(client, channel.guild.id, 'channel_create', 'Canal creado', [
      { name: 'Canal', value: `<#${channel.id}>`, inline: true },
      { name: 'Nombre', value: channel.name, inline: true },
      { name: 'Tipo', value: String(channel.type), inline: true },
    ]);
  },
};

export default event;
