import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import {
  formatDurationSpanish,
  sanitizeReason,
  timeoutDurationMs,
} from '../../moderation/format.js';
import { moderationLogEmbed } from '../../moderation/log.js';
import { validateModerationAction } from '../../moderation/permissions.js';
import { sendModerationLog } from '../../logging/logService.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { describeApiError } from '../../utils/errors.js';
import type { Command } from '../../types/command.js';

const command: Command = {
  category: 'moderation',
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Silencia a un miembro durante un tiempo.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) =>
      option.setName('usuario').setDescription('Miembro a silenciar').setRequired(true),
    )
    .addIntegerOption((option) =>
      option
        .setName('minutos')
        .setDescription('Duración en minutos (1-40320)')
        .setMinValue(1)
        .setMaxValue(40320)
        .setRequired(true),
    )
    .addStringOption((option) =>
      option.setName('razon').setDescription('Razón del silencio').setRequired(false),
    ),

  async execute(interaction, client) {
    if (!interaction.guild) return;
    const user = interaction.options.getUser('usuario', true);
    const minutes = interaction.options.getInteger('minutos', true);
    const duration = timeoutDurationMs(minutes);
    const reason = sanitizeReason(interaction.options.getString('razon'));

    const moderator = await interaction.guild.members.fetch(interaction.user.id);
    const target = await interaction.guild.members.fetch(user.id).catch(() => null);
    const problem = validateModerationAction({
      guild: interaction.guild,
      moderator,
      bot: interaction.guild.members.me,
      target,
      permission: PermissionFlagsBits.ModerateMembers,
      permissionName: 'Moderar miembros',
    });

    if (problem || !target) {
      await interaction.reply({
        embeds: [errorEmbed(problem ?? 'No encontré a ese miembro en el servidor.')],
        ephemeral: true,
      });
      return;
    }

    try {
      await target.timeout(duration, reason);
      const readable = formatDurationSpanish(duration);
      await interaction.reply({
        embeds: [
          successEmbed('Miembro silenciado', `${user} ha sido silenciado durante **${readable}**.`),
        ],
      });
      await sendModerationLog(
        client,
        interaction.guild.id,
        moderationLogEmbed('Timeout', interaction.user.id, user.id, reason, [
          { name: 'Duración', value: readable, inline: true },
        ]),
      );
    } catch (error) {
      await interaction.reply({ embeds: [errorEmbed(describeApiError(error))], ephemeral: true });
    }
  },
};

export default command;
