import {
  PermissionFlagsBits,
  SlashCommandBuilder,
  type GuildBasedChannel,
  type TextBasedChannel,
} from 'discord.js';
import { moderationLogEmbed } from '../../moderation/log.js';
import { validateChannelPermission } from '../../moderation/permissions.js';
import { sendModerationLog } from '../../logging/logService.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { describeApiError } from '../../utils/errors.js';
import type { Command } from '../../types/command.js';

const command: Command = {
  category: 'moderation',
  data: new SlashCommandBuilder()
    .setName('slowmode')
    .setDescription('Configura el modo lento del canal actual.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addIntegerOption((option) =>
      option
        .setName('segundos')
        .setDescription('Segundos entre mensajes (0 para desactivar)')
        .setMinValue(0)
        .setMaxValue(21600)
        .setRequired(true),
    ),

  async execute(interaction, client) {
    if (
      !interaction.guild ||
      !interaction.channel?.isTextBased() ||
      interaction.channel.isDMBased()
    ) {
      await interaction.reply({
        embeds: [errorEmbed('Este comando solo funciona en un canal de servidor.')],
        ephemeral: true,
      });
      return;
    }

    const seconds = interaction.options.getInteger('segundos', true);
    const moderator = await interaction.guild.members.fetch(interaction.user.id);
    const channel = interaction.channel as TextBasedChannel;
    const guildChannel = channel as unknown as GuildBasedChannel;

    const problem =
      validateChannelPermission(
        moderator,
        guildChannel,
        PermissionFlagsBits.ManageChannels,
        'Gestionar canales',
      ) ??
      (!interaction.guild.members.me
        ? 'No pude verificar mis permisos en este canal.'
        : validateChannelPermission(
            interaction.guild.members.me,
            guildChannel,
            PermissionFlagsBits.ManageChannels,
            'Gestionar canales',
          ));

    if (problem || !('setRateLimitPerUser' in channel)) {
      await interaction.reply({
        embeds: [errorEmbed(problem ?? 'Este canal no admite modo lento.')],
        ephemeral: true,
      });
      return;
    }

    try {
      await channel.setRateLimitPerUser(seconds);
      const description =
        seconds === 0
          ? 'El modo lento se ha desactivado.'
          : `El modo lento se ha configurado en **${seconds} segundo(s)**.`;
      await interaction.reply({ embeds: [successEmbed('Modo lento actualizado', description)] });
      await sendModerationLog(
        client,
        interaction.guild.id,
        moderationLogEmbed(
          'Modo lento',
          interaction.user.id,
          interaction.user.id,
          `${channel}: ${seconds}s`,
        ),
      );
    } catch (error) {
      await interaction.reply({ embeds: [errorEmbed(describeApiError(error))], ephemeral: true });
    }
  },
};

export default command;
