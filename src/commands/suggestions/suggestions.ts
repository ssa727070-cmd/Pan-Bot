import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import {
  SuggestionRepository,
  type SuggestionStatus,
} from '../../database/repositories/suggestionRepository.js';
import {
  isStaff,
  staffUpdate,
  suggestionEmbed,
  suggestionComponents,
} from '../../suggestions/service.js';
import type { Command } from '../../types/command.js';
import { createEmbed, errorEmbed, successEmbed } from '../../utils/embeds.js';
import { suggestionText } from '../../validation/config.js';

const STATUSES: Array<{ name: string; value: SuggestionStatus }> = [
  { name: 'Pendiente', value: 'pending' },
  { name: 'Aprobada', value: 'approved' },
  { name: 'Rechazada', value: 'rejected' },
  { name: 'Implementada', value: 'implemented' },
];

const command: Command = {
  category: 'suggestions',
  data: new SlashCommandBuilder()
    .setName('suggestions')
    .setDescription('Configura y gestiona el sistema de sugerencias.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName('setup')
        .setDescription('Configura el canal de sugerencias y el rol de staff.')
        .addChannelOption((option) =>
          option
            .setName('canal')
            .setDescription('Canal donde se publicarán las sugerencias')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        )
        .addRoleOption((option) =>
          option.setName('staff').setDescription('Rol con permisos de gestión').setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('config')
        .setDescription('Activa el sistema o personaliza las etiquetas de estado.')
        .addBooleanOption((option) =>
          option
            .setName('activar')
            .setDescription('Activa o desactiva las sugerencias')
            .setRequired(false),
        )
        .addStringOption((option) =>
          option
            .setName('estado')
            .setDescription('Estado cuyo nombre quieres personalizar')
            .setRequired(false)
            .addChoices(...STATUSES),
        )
        .addStringOption((option) =>
          option
            .setName('etiqueta')
            .setDescription('Nueva etiqueta (máx. 60 caracteres)')
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('view')
        .setDescription('Muestra una sugerencia y sus votos.')
        .addIntegerOption((option) =>
          option
            .setName('id')
            .setDescription('ID de la sugerencia')
            .setRequired(true)
            .setMinValue(1),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('status')
        .setDescription('Cambia el estado de una sugerencia (staff).')
        .addIntegerOption((option) =>
          option
            .setName('id')
            .setDescription('ID de la sugerencia')
            .setRequired(true)
            .setMinValue(1),
        )
        .addStringOption((option) =>
          option
            .setName('estado')
            .setDescription('Nuevo estado')
            .setRequired(true)
            .addChoices(...STATUSES),
        )
        .addStringOption((option) =>
          option
            .setName('respuesta')
            .setDescription('Respuesta opcional del equipo')
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('disable').setDescription('Desactiva el sistema de sugerencias.'),
    ),

  async execute(interaction, client) {
    if (!interaction.guild) return;
    const guildId = interaction.guild.id;
    const repo = new SuggestionRepository(client.db.sqlite);
    const settings = repo.getSettings(guildId);
    const subcommand = interaction.options.getSubcommand(true);

    if (subcommand === 'setup') {
      const channel = interaction.options.getChannel('canal', true);
      const staff = interaction.options.getRole('staff');
      repo.setSettings(guildId, {
        channelId: channel.id,
        staffRoleId: staff?.id ?? settings.staffRoleId,
        enabled: true,
      });
      await interaction.reply({
        embeds: [
          successEmbed(
            'Sugerencias configuradas',
            `El canal es <#${channel.id}> y el sistema está activado. Los usuarios pueden usar \`/suggest\`.`,
          ),
        ],
        ephemeral: true,
      });
      return;
    }

    if (subcommand === 'config') {
      const enable = interaction.options.getBoolean('activar');
      const status = interaction.options.getString('estado');
      const label = interaction.options.getString('etiqueta');

      if (enable !== null) repo.setSettings(guildId, { enabled: enable });
      if (status && label) {
        if (label.length > 60) {
          await interaction.reply({
            embeds: [errorEmbed('La etiqueta no puede superar los 60 caracteres.')],
            ephemeral: true,
          });
          return;
        }
        repo.setStatusLabel(guildId, status as SuggestionStatus, label);
      }

      const current = repo.getSettings(guildId);
      await interaction.reply({
        embeds: [
          createEmbed({
            title: '⚙️ Configuración de sugerencias',
            fields: [
              { name: 'Estado', value: current.enabled ? 'Activado' : 'Desactivado', inline: true },
              {
                name: 'Canal',
                value: current.channelId ? `<#${current.channelId}>` : 'Sin configurar',
                inline: true,
              },
              {
                name: 'Rol de staff',
                value: current.staffRoleId ? `<@&${current.staffRoleId}>` : 'Sin configurar',
                inline: true,
              },
            ],
            footer: 'PAN BOT · Sugerencias',
          }),
        ],
        ephemeral: true,
      });
      return;
    }

    if (subcommand === 'disable') {
      repo.setSettings(guildId, { enabled: false });
      await interaction.reply({
        embeds: [
          successEmbed(
            'Sugerencias desactivadas',
            'El comando `/suggest` ya no estará disponible.',
          ),
        ],
        ephemeral: true,
      });
      return;
    }

    const id = interaction.options.getInteger('id', true);
    const suggestion = repo.get(guildId, id);
    if (!suggestion) {
      await interaction.reply({
        embeds: [errorEmbed('No existe esa sugerencia en este servidor.')],
        ephemeral: true,
      });
      return;
    }

    if (subcommand === 'view') {
      await interaction.reply({
        embeds: [suggestionEmbed(suggestion, repo.counts(id), repo.getStatusLabels(guildId))],
        components: [suggestionComponents(id)],
        ephemeral: true,
      });
      return;
    }

    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (!member || !isStaff(member, settings)) {
      await interaction.reply({
        embeds: [errorEmbed('No tienes permisos para gestionar sugerencias.')],
        ephemeral: true,
      });
      return;
    }

    const status = interaction.options.getString('estado', true) as SuggestionStatus;
    const rawResponse = interaction.options.getString('respuesta');
    const response = rawResponse ? suggestionText.safeParse(rawResponse) : null;
    if (response && !response.success) {
      await interaction.reply({
        embeds: [errorEmbed('La respuesta debe tener entre 10 y 1000 caracteres.')],
        ephemeral: true,
      });
      return;
    }
    await staffUpdate(client, interaction, guildId, id, status, response?.data);
  },
};

export default command;
