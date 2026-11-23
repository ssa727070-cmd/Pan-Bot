import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { WarningRepository } from '../../database/repositories/warningRepository.js';
import { sanitizeReason } from '../../moderation/format.js';
import { moderationLogEmbed } from '../../moderation/log.js';
import { validateModerationAction } from '../../moderation/permissions.js';
import { sendModerationLog } from '../../logging/logService.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import type { Command } from '../../types/command.js';

const command: Command = {
  category: 'moderation',
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Registra una advertencia persistente para un miembro.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) =>
      option.setName('usuario').setDescription('Miembro a advertir').setRequired(true),
    )
    .addStringOption((option) =>
      option.setName('razon').setDescription('Razón de la advertencia').setRequired(true),
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

    const repository = new WarningRepository(client.db.sqlite);
    repository.add(interaction.guild.id, user.id, interaction.user.id, reason);
    const total = repository.countActive(interaction.guild.id, user.id);

    await interaction.reply({
      embeds: [
        successEmbed(
          'Advertencia registrada',
          `${user} ha recibido una advertencia.\n**Razón:** ${reason}\n**Advertencias activas:** ${total}`,
        ),
      ],
    });

    await sendModerationLog(
      client,
      interaction.guild.id,
      moderationLogEmbed('Advertencia', interaction.user.id, user.id, reason, [
        { name: 'Totales activas', value: String(total), inline: true },
      ]),
    );
  },
};

export default command;
