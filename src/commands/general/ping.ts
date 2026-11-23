import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../types/command.js';
import { infoEmbed, successEmbed } from '../../utils/embeds.js';

const command: Command = {
  category: 'general',
  cooldownSeconds: 3,
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Comprueba la latencia del bot y la conexión.'),

  async execute(interaction, client) {
    await interaction.reply({ embeds: [infoEmbed('🏓 Pinging…')] });
    const reply = await interaction.fetchReply();

    const roundTrip = reply.createdTimestamp - interaction.createdTimestamp;
    const gateway = Math.round(client.ws.ping);

    await interaction.editReply({
      embeds: [
        successEmbed(
          'Pong!',
          `**Gateway:** ${Number.isFinite(gateway) ? `${gateway} ms` : 'conectando…'}\n` +
            `**Ida y vuelta:** ${roundTrip} ms`,
        ),
      ],
    });
  },
};

export default command;
