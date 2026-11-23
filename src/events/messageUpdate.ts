import { Events, type Message, type PartialMessage } from 'discord.js';
import type { PanClient } from '../core/client.js';
import { notifyLogEvent } from '../logging/logService.js';
import type { BotEvent } from '../types/event.js';
import { truncate } from '../utils/format.js';

const event: BotEvent = {
  name: Events.MessageUpdate,

  async execute(oldMessage: Message | PartialMessage, newMessage: Message | PartialMessage) {
    if (!newMessage.guild || !newMessage.author) return;
    if (oldMessage.content === newMessage.content) return;
    const client = newMessage.client as PanClient;

    await notifyLogEvent(client, newMessage.guild.id, 'message_edit', 'Mensaje editado', [
      {
        name: 'Autor',
        value: `<@${newMessage.author.id}> (${newMessage.author.tag})`,
        inline: false,
      },
      { name: 'Canal', value: `<#${newMessage.channelId}>`, inline: true },
      { name: 'Antes', value: truncate(oldMessage.content || '(vacío)', 700), inline: false },
      { name: 'Después', value: truncate(newMessage.content || '(vacío)', 700), inline: false },
      { name: 'ID', value: `\`${newMessage.id}\``, inline: true },
    ]);
  },
};

export default event;
