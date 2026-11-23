import {
  PermissionFlagsBits,
  SlashCommandBuilder,
  type GuildBasedChannel,
  type TextBasedChannel,
} from 'discord.js';
import { moderationLogEmbed } from '../../moderation/log.js';
import { validateClearAmount } from '../../moderation/format.js';
import { validateChannelPermission } from '../../moderation/permissions.js';
import { sendModerationLog } from '../../logging/logService.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { describeApiError } from '../../utils/errors.js';
import type { Command } from '../../types/command.js';
import { isBulkDeletable } from '../../utils/channels.js';

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

const command: Command = {
  category: 'moderation',
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Elimina mensajes recientes del canal actual.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption((option) =>
      option
        .setName('cantidad')
        .setDescription('Cantidad de mensajes (1-100)')
        .setMinValue(1)
        .setMaxValue(100)
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

    const amount = interaction.options.getInteger('cantidad', true);
    const invalid = validateClearAmount(amount);
    if (invalid) {
      await interaction.reply({ embeds: [errorEmbed(invalid)], ephemeral: true });
      return;
    }

    const moderator = await interaction.guild.members.fetch(interaction.user.id);
    const channel = interaction.channel as TextBasedChannel;
    const guildChannel = channel as unknown as GuildBasedChannel;
    const problem =
      validateChannelPermission(
        moderator,
        guildChannel,
        PermissionFlagsBits.ManageMessages,
        'Gestionar mensajes',
      ) ??
      (!interaction.guild.members.me
        ? 'No pude verificar mis permisos en este canal.'
        : validateChannelPermission(
            interaction.guild.members.me,
            guildChannel,
            PermissionFlagsBits.ManageMessages,
            'Gestionar mensajes',
          ));

    if (problem) {
      await interaction.reply({ embeds: [errorEmbed(problem)], ephemeral: true });
      return;
    }

    try {
      const messages = await channel.messages.fetch({ limit: amount });
      const deletable = messages.filter(
        (message) => Date.now() - message.createdTimestamp < TWO_WEEKS_MS,
      );
      const skipped = messages.size - deletable.size;

      if (deletable.size >= 2 && isBulkDeletable(channel)) {
        await channel.bulkDelete(deletable, true);
      } else {
        await Promise.all([...deletable.values()].map((message) => message.delete()));
      }

      await interaction.reply({
        embeds: [
          successEmbed(
            'Mensajes eliminados',
            `Se eliminaron **${deletable.size}** mensaje(s) de ${channel}.${
              skipped ? `\nSe omitieron ${skipped} mensaje(s) por tener más de 14 días.` : ''
            }`,
          ),
        ],
      });

      await sendModerationLog(
        client,
        interaction.guild.id,
        moderationLogEmbed(
          'Limpieza',
          interaction.user.id,
          interaction.user.id,
          `Mensajes eliminados en ${channel}`,
          [{ name: 'Cantidad', value: String(deletable.size), inline: true }],
        ),
      );
    } catch (error) {
      await interaction.reply({ embeds: [errorEmbed(describeApiError(error))], ephemeral: true });
    }
  },
};

export default command;
