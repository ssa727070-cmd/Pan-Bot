import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../types/command.js';
import { createEmbed } from '../../utils/embeds.js';
import { formatUptime } from '../../utils/format.js';

const command: Command = {
  category: 'general',
  cooldownSeconds: 5,
  data: new SlashCommandBuilder()
    .setName('about')
    .setDescription('Muestra información sobre PAN BOT.'),

  async execute(interaction, client) {
    await interaction.reply({
      embeds: [
        createEmbed({
          title: 'PAN BOT',
          description:
            'Un bot de Discord profesional para moderación, bienvenidas, tickets y registros, creado con TypeScript, discord.js y SQLite.',
          fields: [
            { name: 'Versión', value: '0.1.0', inline: true },
            { name: 'Entorno', value: `Node.js ${process.version}`, inline: true },
            {
              name: 'Tiempo activo',
              value: formatUptime(Date.now() - client.startedAt.getTime()),
              inline: true,
            },
            { name: 'Servidores', value: String(client.guilds.cache.size), inline: true },
          ],
          footer: 'Creado para la comunidad',
        }),
      ],
    });
  },
};

export default command;
