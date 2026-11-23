import { SlashCommandBuilder } from 'discord.js';
import { existingPlayer } from '../../music/player.js';
import { successEmbed } from '../../utils/embeds.js';
import type { Command } from '../../types/command.js';

const command: Command = {
  category: 'music',
  data: new SlashCommandBuilder()
    .setName('volume')
    .setDescription('Change the playback volume for this session.')
    .addIntegerOption((option) =>
      option
        .setName('value')
        .setDescription('Volume between 0 and 100')
        .setMinValue(0)
        .setMaxValue(100)
        .setRequired(true),
    ),

  async execute(interaction, client) {
    const player = await existingPlayer(interaction, client);
    if (!player) return;

    const value = interaction.options.getInteger('value', true);
    await player.setVolume(value);

    await interaction.reply({
      embeds: [successEmbed('Volume updated', `Volume is now **${value}%**.`)],
    });
  },
};

export default command;
