import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { WarningRepository } from '../../database/repositories/warningRepository.js';
import { errorEmbed, infoEmbed } from '../../utils/embeds.js';
import type { Command } from '../../types/command.js';

const command: Command = {
  category: 'moderation',
  data: new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('Consulta las advertencias activas de un miembro.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) =>
      option.setName('usuario').setDescription('Miembro a consultar').setRequired(true),
    ),

  async execute(interaction, client) {
    if (!interaction.guild) return;
    const user = interaction.options.getUser('usuario', true);

    const moderator = await interaction.guild.members.fetch(interaction.user.id);
    if (!moderator.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      await interaction.reply({
        embeds: [errorEmbed('No tienes el permiso **Moderar miembros** para ver advertencias.')],
        ephemeral: true,
      });
      return;
    }

    const warnings = new WarningRepository(client.db.sqlite).list(interaction.guild.id, user.id);
    const description = warnings.length
      ? warnings
          .slice(0, 10)
          .map(
            (warning, index) =>
              `**${index + 1}.** ${warning.reason} — <@${warning.moderatorId}> (${warning.createdAt} UTC)`,
          )
          .join('\n')
      : 'Este miembro no tiene advertencias activas.';

    await interaction.reply({
      embeds: [
        infoEmbed(
          `Advertencias de ${user.username}`,
          `${description}\n\n**Total:** ${warnings.length}${warnings.length > 10 ? ' (mostrando 10)' : ''}`,
        ),
      ],
      ephemeral: true,
    });
  },
};

export default command;
