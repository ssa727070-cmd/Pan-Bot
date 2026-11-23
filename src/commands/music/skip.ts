import { SlashCommandBuilder } from 'discord.js';
import { existingPlayer } from '../../music/player.js';
import { successEmbed } from '../../utils/embeds.js';
import { truncate } from '../../utils/format.js';
import type { Command } from '../../types/command.js';

const command: Command = {
  category: 'music',
  data: new SlashCommandBuilder().setName('skip').setDescription('Skip the current track.'),

  async execute(interaction, client) {
    const player = await existingPlayer(interaction, client);
    if (!player) return;

    const skipped = player.queue.current?.info.title ?? 'the current track';
    await player.skip();

    await interaction.reply({
      embeds: [successEmbed('Track skipped', `Skipped **${truncate(skipped, 100)}**.`)],
    });
  },
};

export default command;
