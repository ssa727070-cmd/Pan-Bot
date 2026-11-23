import { SlashCommandBuilder } from 'discord.js';
import { existingPlayer } from '../../music/player.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import type { Command } from '../../types/command.js';

const command: Command = {
  category: 'music',
  data: new SlashCommandBuilder().setName('resume').setDescription('Resume a paused playback.'),

  async execute(interaction, client) {
    const player = await existingPlayer(interaction, client);
    if (!player) return;

    if (!player.paused) {
      await interaction.reply({ embeds: [errorEmbed('Playback is not paused.')], ephemeral: true });
      return;
    }

    await player.resume();
    await interaction.reply({ embeds: [successEmbed('Playback resumed')] });
  },
};

export default command;
