import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../types/command.js';
import { GuildSettingsRepository } from '../../database/repositories/guildSettings.js';
import { createEmbed, errorEmbed, successEmbed } from '../../utils/embeds.js';

const command: Command = {
  category: 'configuration',
  data: new SlashCommandBuilder()
    .setName('settings')
    .setDescription('Configura PAN BOT en este servidor.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) => sub.setName('view').setDescription('Muestra la configuración actual.'))
    .addSubcommand((sub) =>
      sub
        .setName('modlog')
        .setDescription('Establece el canal de registro de moderación.')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Canal de logs de moderación')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false),
        ),
    ),

  async execute(interaction, client) {
    const repository = new GuildSettingsRepository(client.db.sqlite);
    const guildId = interaction.guildId!;
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'view') {
      const settings = repository.get(guildId);
      await interaction.reply({
        embeds: [
          createEmbed({
            title: 'Configuración del servidor',
            fields: [
              {
                name: 'Logs de moderación',
                value: settings.modLogChannelId
                  ? `<#${settings.modLogChannelId}>`
                  : 'Sin configurar',
                inline: true,
              },
              {
                name: 'Bienvenidas',
                value: settings.welcomeChannelId
                  ? `<#${settings.welcomeChannelId}>`
                  : 'Desactivadas',
                inline: true,
              },
              {
                name: 'Despedidas',
                value: settings.goodbyeChannelId
                  ? `<#${settings.goodbyeChannelId}>`
                  : 'Desactivadas',
                inline: true,
              },
            ],
            footer: 'PAN BOT',
          }),
        ],
        ephemeral: true,
      });
      return;
    }

    if (subcommand === 'modlog') {
      const channel = interaction.options.getChannel('channel');
      repository.update(guildId, { modLogChannelId: channel?.id ?? null });
      await interaction.reply({
        embeds: [
          successEmbed(
            'Canal de moderación actualizado',
            channel
              ? `Las acciones de moderación se registrarán en <#${channel.id}>.`
              : 'Los registros de moderación se han desactivado.',
          ),
        ],
        ephemeral: true,
      });
      return;
    }

    await interaction.reply({
      embeds: [errorEmbed('Configuración desconocida.')],
      ephemeral: true,
    });
  },
};

export default command;
