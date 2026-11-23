import { SlashCommandBuilder } from 'discord.js';
import { getPlayer } from '../../music/player.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import type { Command } from '../../types/command.js';

const command: Command = {
  category: 'music',
  data: new SlashCommandBuilder()
    .setName('disconnect')
    .setDescription('Disconnect the bot from the voice channel.'),

  async execute(interaction, client) {
    const player = getPlayer(client, interaction.guildId!);

    if (!player) {
      await interaction.reply({
        embeds: [errorEmbed('I am not connected to a voice channel.')],
        ephemeral: true,
      });
      return;
    }

    const member = interaction.member;
    const voiceChannelId = member && 'voice' in member ? member.voice.channelId : null;
    if (voiceChannelId && player.voiceChannelId !== voiceChannelId) {
      await interaction.reply({
        embeds: [
          errorEmbed(
            `You must be in <#${player.voiceChannelId ?? 'my voice channel'}> to disconnect me.`,
          ),
        ],
        ephemeral: true,
      });
      return;
    }

    await player.destroy('disconnect command', true);
    await interaction.reply({
      embeds: [successEmbed('Disconnected', 'The player and queue were cleared.')],
    });
  },
};

export default command;
