import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { PanClient } from '../../core/client.js';
import { logger } from '../../core/logger.js';
import { GuildSettingsRepository } from '../../database/repositories/guildSettings.js';
import {
  addTicketUser,
  removeTicketUser,
  ticketPanelComponents,
  ticketPanelEmbed,
} from '../../tickets/service.js';
import type { Command } from '../../types/command.js';
import { isSendable } from '../../utils/channels.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';

const command: Command = {
  category: 'tickets',
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Gestiona el sistema de tickets de soporte.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName('setup')
        .setDescription('Configura el rol de soporte, la categoría y el canal del panel.')
        .addRoleOption((option) =>
          option
            .setName('soporte')
            .setDescription('Rol que atenderá los tickets')
            .setRequired(true),
        )
        .addChannelOption((option) =>
          option
            .setName('categoria')
            .setDescription('Categoría donde se crearán los canales de ticket')
            .addChannelTypes(ChannelType.GuildCategory)
            .setRequired(false),
        )
        .addChannelOption((option) =>
          option
            .setName('panel')
            .setDescription('Canal donde se publicará el panel de tickets')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('panel')
        .setDescription('Publica el panel de tickets en el canal indicado (o en el actual).')
        .addChannelOption((option) =>
          option
            .setName('canal')
            .setDescription('Canal donde publicar el panel')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Añade un usuario al ticket actual.')
        .addUserOption((option) =>
          option.setName('usuario').setDescription('Usuario a añadir').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Elimina un usuario del ticket actual.')
        .addUserOption((option) =>
          option.setName('usuario').setDescription('Usuario a eliminar').setRequired(true),
        ),
    ),

  async execute(interaction, client: PanClient) {
    if (!interaction.guild || !interaction.channel) return;
    const repository = new GuildSettingsRepository(client.db.sqlite);
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'setup') {
      const role = interaction.options.getRole('soporte', true);
      const category = interaction.options.getChannel('categoria');
      const panel = interaction.options.getChannel('panel');

      repository.update(interaction.guild.id, {
        ticketSupportRoleId: role.id,
        ticketCategoryId: category?.id ?? null,
        ticketPanelChannelId: panel?.id ?? null,
      });

      await interaction.reply({
        embeds: [
          successEmbed(
            'Tickets configurados',
            `Rol de soporte: <@&${role.id}>\n` +
              `Categoría: ${category ? `<#${category.id}>` : 'predeterminada'}\n` +
              `Panel: ${panel ? `<#${panel.id}>` : 'sin publicar'}\n\n` +
              'Usa `/ticket panel` para publicar el panel.',
          ),
        ],
        ephemeral: true,
      });
      return;
    }

    if (subcommand === 'panel') {
      const target = interaction.options.getChannel('canal') ?? interaction.channel;
      const channel = await client.channels.fetch(target.id);
      if (!channel || !isSendable(channel)) {
        await interaction.reply({
          embeds: [errorEmbed('No puedo enviar mensajes en ese canal. Revisa mis permisos.')],
          ephemeral: true,
        });
        return;
      }

      try {
        await channel.send({ embeds: [ticketPanelEmbed()], components: [ticketPanelComponents()] });
        repository.update(interaction.guild.id, { ticketPanelChannelId: channel.id });
        await interaction.reply({
          embeds: [
            successEmbed('Panel publicado', `El panel de tickets está en <#${channel.id}>.`),
          ],
          ephemeral: true,
        });
      } catch (error) {
        logger.error({ error }, 'No se pudo publicar el panel de tickets');
        await interaction.reply({
          embeds: [errorEmbed('No se pudo publicar el panel. Revisa mis permisos en ese canal.')],
          ephemeral: true,
        });
      }
      return;
    }

    const user = interaction.options.getUser('usuario', true);
    if (subcommand === 'add') {
      await addTicketUser(client, interaction, user);
      return;
    }

    if (subcommand === 'remove') {
      await removeTicketUser(client, interaction, user);
    }
  },
};

export default command;
