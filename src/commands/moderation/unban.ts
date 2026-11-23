import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { moderationLogEmbed } from '../../moderation/log.js';
import { sanitizeReason } from '../../moderation/format.js';
import { validateModerationAction } from '../../moderation/permissions.js';
import { sendModerationLog } from '../../logging/logService.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { describeApiError } from '../../utils/errors.js';
import type { Command } from '../../types/command.js';

const command: Command = {
  category: 'moderation',
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Desbanea a un usuario del servidor.')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption((option) =>
      option
        .setName('usuario_id')
        .setDescription('ID del usuario a desbanear')
        .setMinLength(17)
        .setMaxLength(20)
        .setRequired(true),
    )
    .addStringOption((option) =>
      option.setName('razon').setDescription('Razón del desbaneo').setRequired(false),
    ),

  async execute(interaction, client) {
    if (!interaction.guild) return;
    const userId = interaction.options.getString('usuario_id', true);
    const reason = sanitizeReason(interaction.options.getString('razon'));

    if (!/^\d{17,20}$/.test(userId)) {
      await interaction.reply({
        embeds: [errorEmbed('Debes proporcionar un ID de usuario válido.')],
        ephemeral: true,
      });
      return;
    }

    const moderator = await interaction.guild.members.fetch(interaction.user.id);
    const problem = validateModerationAction({
      guild: interaction.guild,
      moderator,
      bot: interaction.guild.members.me,
      permission: PermissionFlagsBits.BanMembers,
      permissionName: 'Banear miembros',
    });

    if (problem) {
      await interaction.reply({ embeds: [errorEmbed(problem)], ephemeral: true });
      return;
    }

    try {
      await interaction.guild.bans.remove(userId, reason);
      await interaction.reply({
        embeds: [
          successEmbed('Usuario desbaneado', `El usuario \`${userId}\` ha sido desbaneado.`),
        ],
      });
      await sendModerationLog(
        client,
        interaction.guild.id,
        moderationLogEmbed('Desban', interaction.user.id, userId, reason),
      );
    } catch (error) {
      await interaction.reply({ embeds: [errorEmbed(describeApiError(error))], ephemeral: true });
    }
  },
};

export default command;
