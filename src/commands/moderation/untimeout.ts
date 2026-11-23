import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { sanitizeReason } from '../../moderation/format.js';
import { moderationLogEmbed } from '../../moderation/log.js';
import { validateModerationAction } from '../../moderation/permissions.js';
import { sendModerationLog } from '../../logging/logService.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { describeApiError } from '../../utils/errors.js';
import type { Command } from '../../types/command.js';

const command: Command = {
  category: 'moderation',
  data: new SlashCommandBuilder()
    .setName('untimeout')
    .setDescription('Quita el silencio a un miembro.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) =>
      option.setName('usuario').setDescription('Miembro a desilenciar').setRequired(true),
    )
    .addStringOption((option) =>
      option.setName('razon').setDescription('Razón').setRequired(false),
    ),

  async execute(interaction, client) {
    if (!interaction.guild) return;
    const user = interaction.options.getUser('usuario', true);
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
      await target.timeout(null, reason);
      await interaction.reply({
        embeds: [successEmbed('Silencio eliminado', `${user} ya puede volver a hablar.`)],
      });
      await sendModerationLog(
        client,
        interaction.guild.id,
        moderationLogEmbed('Desilenciar', interaction.user.id, user.id, reason),
      );
    } catch (error) {
      await interaction.reply({ embeds: [errorEmbed(describeApiError(error))], ephemeral: true });
    }
  },
};

export default command;
