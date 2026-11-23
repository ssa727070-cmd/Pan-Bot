import { SlashCommandBuilder } from 'discord.js';
import { SuggestionRepository } from '../../database/repositories/suggestionRepository.js';
import { suggestionModal } from '../../suggestions/service.js';
import type { Command } from '../../types/command.js';
import { errorEmbed } from '../../utils/embeds.js';

const command: Command = {
  category: 'suggestions',
  cooldownSeconds: 10,
  data: new SlashCommandBuilder()
    .setName('suggest')
    .setDescription('Envía una sugerencia al servidor mediante un formulario.'),

  async execute(interaction, client) {
    if (!interaction.guild) return;
    const settings = new SuggestionRepository(client.db.sqlite).getSettings(interaction.guild.id);

    if (!settings.enabled || !settings.channelId) {
      await interaction.reply({
        embeds: [errorEmbed('El sistema de sugerencias aún no está configurado en este servidor.')],
        ephemeral: true,
      });
      return;
    }

    await interaction.showModal(suggestionModal());
  },
};

export default command;
