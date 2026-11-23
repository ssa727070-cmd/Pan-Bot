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
    .setName('ban')
    .setDescription('Banea a un miembro del servidor.')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((option) =>
      option.setName('usuario').setDescription('Miembro a banear').setRequired(true),
    )
    .addStringOption((option) =>
      option.setName('razon').setDescription('Razón del baneo').setRequired(false),
    )
    .addIntegerOption((option) =>
      option
        .setName('dias')
        .setDescription('Días de mensajes a eliminar (0-7)')
        .setMinValue(0)
        .setMaxValue(7)
        .setRequired(false),
    ),

  async execute(interaction, client) {
    if (!interaction.guild) return;
    const reason = sanitizeReason(interaction.options.getString('razon'));
    const days = interaction.options.getInteger('dias') ?? 0;
    const user = interaction.options.getUser('usuario', true);

    const moderator = await interaction.guild.members.fetch(interaction.user.id);
    const target = await interaction.guild.members.fetch(user.id).catch(() => null);
    const problem = validateModerationAction({
      guild: interaction.guild,
      moderator,
      bot: interaction.guild.members.me,
      target,
      permission: PermissionFlagsBits.BanMembers,
      permissionName: 'Banear miembros',
    });

    if (problem) {
      await interaction.reply({ embeds: [errorEmbed(problem)], ephemeral: true });
      return;
    }

    try {
      await interaction.guild.bans.create(user.id, {
        reason,
        deleteMessageSeconds: days * 86_400,
      });

      await interaction.reply({
        embeds: [
          successEmbed(
            'Miembro baneado',
            `${user} (\`${user.id}\`) ha sido baneado.\n**Razón:** ${reason}`,
          ),
        ],
      });

      await sendModerationLog(
        client,
        interaction.guild.id,
        moderationLogEmbed('Ban', interaction.user.id, user.id, reason, [
          { name: 'Mensajes eliminados', value: `${days} día(s)`, inline: true },
        ]),
      );
    } catch (error) {
      await interaction.reply({
        embeds: [errorEmbed(describeApiError(error))],
        ephemeral: true,
      });
    }
  },
};

export default command;
