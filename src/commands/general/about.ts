import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../types/command.js';
import { createEmbed } from '../../utils/embeds.js';
import { formatUptime } from '../../utils/format.js';

const command: Command = {
  category: 'general',
  cooldownSeconds: 5,
  data: new SlashCommandBuilder()
    .setName('about')
    .setDescription('Show information about PAN BOT.'),

  async execute(interaction, client) {
    const connectedNodes = [...client.lavalink.nodeManager.nodes.values()].filter(
      (node) => node.connected,
    ).length;

    await interaction.reply({
      embeds: [
        createEmbed({
          title: 'PAN BOT',
          description:
            'A professional music bot for Discord, built with TypeScript, discord.js, Lavalink and SQLite.',
          fields: [
            { name: 'Version', value: '0.1.0', inline: true },
            { name: 'Runtime', value: `Node.js ${process.version}`, inline: true },
            {
              name: 'Uptime',
              value: formatUptime(Date.now() - client.startedAt.getTime()),
              inline: true,
            },
            { name: 'Guilds', value: String(client.guilds.cache.size), inline: true },
            { name: 'Lavalink', value: `${connectedNodes} node(s) connected`, inline: true },
            { name: 'Players', value: String(client.lavalink.players.size), inline: true },
          ],
          footer: 'Made for the community',
        }),
      ],
    });
  },
};

export default command;
