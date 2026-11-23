import { Events, type Message, type PartialMessage } from 'discord.js';
import type { PanClient } from '../core/client.js';
import { notifyLogEvent } from '../logging/logService.js';
import type { BotEvent } from '../types/event.js';
import { truncate } from '../utils/format.js';

const event: BotEvent = {
  name: Events.MessageDelete,

  async execute(message: Message | PartialMessage) {
    if (!message.guild || !message.author) return;
    const client = message.client as PanClient;

    await notifyLogEvent(client, message.guild.id, 'message_delete', 'Mensaje eliminado', [
      { name: 'Autor', value: `<@${message.author.id}> (${message.author.tag})`, inline: false },
      { name: 'Canal', value: `<#${message.channelId}>`, inline: true },
      {
        name: 'Contenido',
        value: truncate(message.content || '(sin contenido)', 1000),
        inline: false,
      },
      { name: 'ID', value: `\`${message.id}\``, inline: true },
    ]);
  },
};

export default event;
