import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { GuildSettingsRepository } from '../../database/repositories/guildSettings.js';
import { LogSettingsRepository } from '../../database/repositories/logSettingsRepository.js';
import { LOG_EVENTS, LOG_EVENT_LABELS, isLogEvent } from '../../logging/events.js';
import type { Command } from '../../types/command.js';
import { createEmbed, errorEmbed, successEmbed } from '../../utils/embeds.js';

const command: Command = {
  category: 'logging',
  data: new SlashCommandBuilder()
    .setName('logs')
    .setDescription('Configura los registros de eventos del servidor.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName('setup')
        .setDescription('Activa todos los eventos en un canal de registros.')
        .addChannelOption((option) =>
          option
            .setName('canal')
            .setDescription('Canal donde enviar todos los registros')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('Configura un evento específico.')
        .addStringOption((option) =>
          option
            .setName('evento')
            .setDescription('Evento a configurar')
            .setRequired(true)
            .addChoices(
              ...LOG_EVENTS.map((event) => ({ name: LOG_EVENT_LABELS[event], value: event })),
            ),
        )
        .addChannelOption((option) =>
          option
            .setName('canal')
            .setDescription('Canal de registro (vacío para desactivar)')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('view').setDescription('Muestra la configuración de registros.'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('disable')
        .setDescription('Desactiva un evento específico.')
        .addStringOption((option) =>
          option
            .setName('evento')
            .setDescription('Evento a desactivar')
            .setRequired(true)
            .addChoices(
              ...LOG_EVENTS.map((event) => ({ name: LOG_EVENT_LABELS[event], value: event })),
            ),
        ),
    ),

  async execute(interaction, client) {
    if (!interaction.guild) return;
    const repository = new LogSettingsRepository(client.db.sqlite);
    const guildSettings = new GuildSettingsRepository(client.db.sqlite);
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'setup') {
      const channel = interaction.options.getChannel('canal', true);
      repository.setChannelForAll(interaction.guild.id, channel.id, LOG_EVENTS);
      guildSettings.update(interaction.guild.id, { logChannelId: channel.id });
      await interaction.reply({
        embeds: [
          successEmbed(
            'Registros activados',
            `Todos los eventos se registrarán en <#${channel.id}>.\n` +
              'Puedes personalizar cada evento con `/logs set`.',
          ),
        ],
        ephemeral: true,
      });
      return;
    }

    if (subcommand === 'set') {
      const value = interaction.options.getString('evento', true);
      if (!isLogEvent(value)) {
        await interaction.reply({ embeds: [errorEmbed('Evento no válido.')], ephemeral: true });
        return;
      }
      const channel = interaction.options.getChannel('canal');
      repository.set(interaction.guild.id, value, channel?.id ?? null, Boolean(channel));
      await interaction.reply({
        embeds: [
          successEmbed(
            'Evento actualizado',
            channel
              ? `${LOG_EVENT_LABELS[value]} se registrará en <#${channel.id}>.`
              : `${LOG_EVENT_LABELS[value]} se ha desactivado.`,
          ),
        ],
        ephemeral: true,
      });
      return;
    }

    if (subcommand === 'disable') {
      const value = interaction.options.getString('evento', true);
      if (!isLogEvent(value)) {
        await interaction.reply({ embeds: [errorEmbed('Evento no válido.')], ephemeral: true });
        return;
      }
      repository.set(interaction.guild.id, value, null, false);
      await interaction.reply({
        embeds: [
          successEmbed('Evento desactivado', `${LOG_EVENT_LABELS[value]} ya no se registrará.`),
        ],
        ephemeral: true,
      });
      return;
    }

    const configured = repository.list(interaction.guild.id);
    const byName = new Map(configured.map((setting) => [setting.eventName, setting]));
    const fields = LOG_EVENTS.map((event) => {
      const setting = byName.get(event);
      return {
        name: LOG_EVENT_LABELS[event],
        value:
          setting?.enabled && setting.channelId
            ? `Activado en <#${setting.channelId}>`
            : 'Desactivado',
        inline: false,
      };
    });

    await interaction.reply({
      embeds: [
        createEmbed({
          title: 'Configuración de registros',
          description: 'Usa `/logs setup` o `/logs set` para configurar los eventos.',
          fields,
          footer: 'PAN BOT · Registros',
        }),
      ],
      ephemeral: true,
    });
  },
};

export default command;
