import { SlashCommandBuilder } from 'discord.js';
import { existingPlayer } from '../../music/player.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import type { Command } from '../../types/command.js';

const command: Command = {
  category: 'music',
  data: new SlashCommandBuilder().setName('shuffle').setDescription('Shuffle the queue.'),

  async execute(interaction, client) {
    const player = await existingPlayer(interaction, client);
    if (!player) return;

    if (player.queue.tracks.length < 2) {
      await interaction.reply({
        embeds: [errorEmbed('There are not enough tracks to shuffle.')],
        ephemeral: true,
      });
      return;
    }

    await player.queue.shuffle();
    await interaction.reply({
      embeds: [
        successEmbed('Queue shuffled', `${player.queue.tracks.length} tracks were shuffled.`),
      ],
    });
  },
};

export default command;
