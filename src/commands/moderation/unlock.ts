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
    .setName('unlock')
    .setDescription('Desbloquea el envío de mensajes en el canal actual.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

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

    if (problem || !('permissionOverwrites' in channel)) {
      await interaction.reply({
        embeds: [errorEmbed(problem ?? 'Este canal no admite desbloqueo.')],
        ephemeral: true,
      });
      return;
    }

    try {
      await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
        SendMessages: null,
      });
      await interaction.reply({
        embeds: [successEmbed('Canal desbloqueado', `${channel} vuelve a permitir mensajes.`)],
      });
      await sendModerationLog(
        client,
        interaction.guild.id,
        moderationLogEmbed(
          'Desbloqueo de canal',
          interaction.user.id,
          interaction.user.id,
          channel.toString(),
        ),
      );
    } catch (error) {
      await interaction.reply({ embeds: [errorEmbed(describeApiError(error))], ephemeral: true });
    }
  },
};

export default command;
