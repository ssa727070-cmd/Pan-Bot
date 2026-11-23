import { SlashCommandBuilder } from 'discord.js';
import { existingPlayer } from '../../music/player.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import type { Command } from '../../types/command.js';

const command: Command = {
  category: 'music',
  data: new SlashCommandBuilder().setName('pause').setDescription('Pause the current playback.'),

  async execute(interaction, client) {
    const player = await existingPlayer(interaction, client);
    if (!player) return;

    if (player.paused) {
      await interaction.reply({
        embeds: [errorEmbed('Playback is already paused.')],
        ephemeral: true,
      });
      return;
    }

    await player.pause();
    await interaction.reply({ embeds: [successEmbed('Playback paused')] });
  },
};

export default command;
