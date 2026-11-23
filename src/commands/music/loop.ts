import { SlashCommandBuilder } from 'discord.js';
import { existingPlayer } from '../../music/player.js';
import { successEmbed } from '../../utils/embeds.js';
import type { Command } from '../../types/command.js';

const command: Command = {
  category: 'music',
  data: new SlashCommandBuilder()
    .setName('loop')
    .setDescription('Set the repeat mode.')
    .addStringOption((option) =>
      option
        .setName('mode')
        .setDescription('Repeat mode')
        .setRequired(true)
        .addChoices(
          { name: 'Off', value: 'off' },
          { name: 'Current track', value: 'track' },
          { name: 'Whole queue', value: 'queue' },
        ),
    ),

  async execute(interaction, client) {
    const player = await existingPlayer(interaction, client);
    if (!player) return;

    const mode = interaction.options.getString('mode', true) as 'off' | 'track' | 'queue';
    await player.setRepeatMode(mode);

    const labels = { off: 'off', track: 'current track', queue: 'whole queue' } as const;
    await interaction.reply({
      embeds: [successEmbed('Repeat mode updated', `Repeat mode set to **${labels[mode]}**.`)],
    });
  },
};

export default command;
