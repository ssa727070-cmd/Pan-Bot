import { SlashCommandBuilder } from 'discord.js';
import { existingPlayer } from '../../music/player.js';
import { successEmbed } from '../../utils/embeds.js';
import type { Command } from '../../types/command.js';

const command: Command = {
  category: 'music',
  data: new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Stop playback and clear the queue.'),

  async execute(interaction, client) {
    const player = await existingPlayer(interaction, client);
    if (!player) return;

    await player.stopPlaying(true, false);
    await interaction.reply({
      embeds: [
        successEmbed(
          'Playback stopped',
          'The queue has been cleared. I stayed in the voice channel.',
        ),
      ],
    });
  },
};

export default command;
