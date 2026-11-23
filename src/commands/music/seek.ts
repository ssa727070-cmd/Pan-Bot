import { SlashCommandBuilder } from 'discord.js';
import { existingPlayer } from '../../music/player.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { formatDuration } from '../../utils/format.js';
import type { Command } from '../../types/command.js';

const command: Command = {
  category: 'music',
  data: new SlashCommandBuilder()
    .setName('seek')
    .setDescription('Jump to a position in the current track.')
    .addIntegerOption((option) =>
      option
        .setName('seconds')
        .setDescription('Position in seconds')
        .setMinValue(0)
        .setRequired(true),
    ),

  async execute(interaction, client) {
    const player = await existingPlayer(interaction, client);
    if (!player) return;

    const track = player.queue.current;
    if (!track?.info.isSeekable) {
      await interaction.reply({
        embeds: [errorEmbed('The current track cannot be seeked.')],
        ephemeral: true,
      });
      return;
    }

    const seconds = interaction.options.getInteger('seconds', true);
    const position = Math.min(seconds * 1000, Math.max(0, (track.info.duration ?? 0) - 1000));
    await player.seek(position);

    await interaction.reply({
      embeds: [successEmbed('Position updated', `Seeked to **${formatDuration(position)}**.`)],
    });
  },
};

export default command;
