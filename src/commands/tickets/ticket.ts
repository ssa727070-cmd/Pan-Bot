import {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { PanClient } from '../../core/client.js';
import { logger } from '../../core/logger.js';
import { GuildSettingsRepository } from '../../database/repositories/guildSettings.js';
import {
  TicketRepository,
  type TicketRoleKind,
} from '../../database/repositories/ticketRepository.js';
import {
  addTicketUser,
  removeTicketUser,
  ticketPanelComponents,
  ticketPanelEmbed,
} from '../../tickets/service.js';
import type { Command } from '../../types/command.js';
import { isSendable } from '../../utils/channels.js';
import { createEmbed, errorEmbed, successEmbed } from '../../utils/embeds.js';

const EPHEMERAL = MessageFlags.Ephemeral;
const ROLE_KIND_CHOICES = [
  { name: 'Atención (soporte)', value: 'support' },
  { name: 'Excluido', value: 'excluded' },
  { name: 'Puede cerrar', value: 'closer' },
] as const;
const ROLE_KIND_LABEL: Record<TicketRoleKind, string> = {
  support: 'Atención',
  excluded: 'Excluidos',
  closer: 'Pueden cerrar',
};
const CONFIG_SUBCOMMANDS = new Set(['setup', 'panel', 'roles', 'archivo', 'opciones', 'estado']);

function roleList(ids: string[]): string {
  return ids.length ? ids.map((id) => `<@&${id}>`).join(' ') : '—';
}

const command: Command = {
  category: 'tickets',
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Gestiona el sistema de tickets de soporte.')
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
        .setName('roles')
        .setDescription('Añade o quita roles de atención, excluidos o con permiso para cerrar.')
        .addStringOption((option) =>
          option
            .setName('tipo')
            .setDescription('Tipo de rol')
            .addChoices(...ROLE_KIND_CHOICES)
            .setRequired(true),
        )
        .addRoleOption((option) =>
          option.setName('rol').setDescription('Rol a modificar').setRequired(true),
        )
        .addBooleanOption((option) =>
          option
            .setName('quitar')
            .setDescription('Quitar el rol de esta lista en vez de añadirlo')
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('archivo')
        .setDescription(
          'Define el canal donde se archivan las transcripciones de tickets cerrados.',
        )
        .addChannelOption((option) =>
          option
            .setName('canal')
            .setDescription('Canal de archivo (omítelo para quitarlo)')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('opciones')
        .setDescription('Ajusta el módulo de tickets.')
        .addBooleanOption((option) =>
          option
            .setName('activo')
            .setDescription('Activar o desactivar tickets')
            .setRequired(false),
        )
        .addBooleanOption((option) =>
          option
            .setName('multiples')
            .setDescription('Permitir más de un ticket abierto por usuario')
            .setRequired(false),
        )
        .addIntegerOption((option) =>
          option
            .setName('maximo')
            .setDescription('Máximo de tickets abiertos por usuario (1-10)')
            .setMinValue(1)
            .setMaxValue(10)
            .setRequired(false),
        )
        .addBooleanOption((option) =>
          option
            .setName('creador_cierra')
            .setDescription('Permitir que el creador cierre su ticket')
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('estado').setDescription('Muestra la configuración de tickets de este servidor.'),
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

  async execute(interaction: ChatInputCommandInteraction, client: PanClient) {
    if (!interaction.guild || !interaction.channel) return;
    const guildId = interaction.guild.id;
    const subcommand = interaction.options.getSubcommand();
    const tickets = new TicketRepository(client.db.sqlite);
    const guildSettings = new GuildSettingsRepository(client.db.sqlite);

    // Configuration needs Manage Server (or Administrator). Participant commands are
    // authorised per ticket inside the service.
    if (CONFIG_SUBCOMMANDS.has(subcommand)) {
      const permissions = interaction.memberPermissions;
      if (
        !permissions?.has(PermissionFlagsBits.Administrator) &&
        !permissions?.has(PermissionFlagsBits.ManageGuild)
      ) {
        await interaction.reply({
          embeds: [
            errorEmbed('Necesitas el permiso **Gestionar servidor** para configurar tickets.'),
          ],
          flags: EPHEMERAL,
        });
        return;
      }
    }

    if (subcommand === 'setup') {
      const role = interaction.options.getRole('soporte', true);
      const category = interaction.options.getChannel('categoria');
      const panel = interaction.options.getChannel('panel');

      guildSettings.update(guildId, {
        ticketSupportRoleId: role.id,
        ticketCategoryId: category?.id ?? null,
        ticketPanelChannelId: panel?.id ?? null,
      });
      tickets.addRole(guildId, 'support', role.id);
      tickets.updateSettings(guildId, {
        categoryId: category?.id ?? null,
        panelChannelId: panel?.id ?? null,
      });

      await interaction.reply({
        embeds: [
          successEmbed(
            'Tickets configurados',
            `Rol de soporte: <@&${role.id}>\n` +
              `Categoría: ${category ? `<#${category.id}>` : 'predeterminada'}\n` +
              `Panel: ${panel ? `<#${panel.id}>` : 'sin publicar'}\n\n` +
              'Usa `/ticket panel` para publicar el panel y `/ticket roles` para más roles.',
          ),
        ],
        flags: EPHEMERAL,
      });
      return;
    }

    if (subcommand === 'panel') {
      const target = interaction.options.getChannel('canal') ?? interaction.channel;
      const channel = await client.channels.fetch(target.id);
      if (
        !channel ||
        !isSendable(channel) ||
        !('guildId' in channel) ||
        channel.guildId !== guildId
      ) {
        await interaction.reply({
          embeds: [errorEmbed('No puedo enviar mensajes en ese canal. Revisa mis permisos.')],
          flags: EPHEMERAL,
        });
        return;
      }

      try {
        await channel.send({ embeds: [ticketPanelEmbed()], components: [ticketPanelComponents()] });
        guildSettings.update(guildId, { ticketPanelChannelId: channel.id });
        tickets.updateSettings(guildId, { panelChannelId: channel.id });
        await interaction.reply({
          embeds: [
            successEmbed('Panel publicado', `El panel de tickets está en <#${channel.id}>.`),
          ],
          flags: EPHEMERAL,
        });
      } catch (error) {
        logger.error({ error, guildId }, 'No se pudo publicar el panel de tickets');
        await interaction.reply({
          embeds: [errorEmbed('No se pudo publicar el panel. Revisa mis permisos en ese canal.')],
          flags: EPHEMERAL,
        });
      }
      return;
    }

    if (subcommand === 'roles') {
      const kind = interaction.options.getString('tipo', true) as TicketRoleKind;
      const role = interaction.options.getRole('rol', true);
      const remove = interaction.options.getBoolean('quitar') ?? false;

      if (remove) {
        const removed = tickets.removeRole(guildId, kind, role.id);
        if (
          kind === 'support' &&
          removed &&
          guildSettings.get(guildId).ticketSupportRoleId === role.id
        ) {
          guildSettings.update(guildId, { ticketSupportRoleId: null });
        }
        await interaction.reply({
          embeds: [
            removed
              ? successEmbed(
                  'Rol quitado',
                  `<@&${role.id}> ya no está en **${ROLE_KIND_LABEL[kind]}**.`,
                )
              : errorEmbed('Ese rol no estaba en esa lista.'),
          ],
          allowedMentions: { parse: [] },
          flags: EPHEMERAL,
        });
        return;
      }

      if (role.id === guildId) {
        await interaction.reply({
          embeds: [errorEmbed('No puedes usar @everyone como rol de tickets.')],
          flags: EPHEMERAL,
        });
        return;
      }
      tickets.addRole(guildId, kind, role.id);
      await interaction.reply({
        embeds: [
          successEmbed('Rol añadido', `<@&${role.id}> añadido a **${ROLE_KIND_LABEL[kind]}**.`),
        ],
        allowedMentions: { parse: [] },
        flags: EPHEMERAL,
      });
      return;
    }

    if (subcommand === 'archivo') {
      const channel = interaction.options.getChannel('canal');
      tickets.updateSettings(guildId, { archiveChannelId: channel?.id ?? null });
      await interaction.reply({
        embeds: [
          successEmbed(
            'Archivo de tickets',
            channel
              ? `Las transcripciones se enviarán a <#${channel.id}>.`
              : 'Canal de archivo eliminado; se usarán los logs del servidor.',
          ),
        ],
        flags: EPHEMERAL,
      });
      return;
    }

    if (subcommand === 'opciones') {
      const patch = {
        enabled: interaction.options.getBoolean('activo'),
        allowMultiple: interaction.options.getBoolean('multiples'),
        maxOpenPerUser: interaction.options.getInteger('maximo'),
        creatorCanClose: interaction.options.getBoolean('creador_cierra'),
      };
      const changes = Object.fromEntries(
        Object.entries(patch).filter(([, value]) => value !== null),
      );
      if (Object.keys(changes).length === 0) {
        await interaction.reply({
          embeds: [errorEmbed('Indica al menos una opción que cambiar.')],
          flags: EPHEMERAL,
        });
        return;
      }
      tickets.updateSettings(guildId, changes);
      await interaction.reply({
        embeds: [
          successEmbed('Opciones actualizadas', 'La configuración de tickets se ha guardado.'),
        ],
        flags: EPHEMERAL,
      });
      return;
    }

    if (subcommand === 'estado') {
      const settings = tickets.getSettings(guildId);
      const channel = (id: string | null) => (id ? `<#${id}>` : '—');
      await interaction.reply({
        embeds: [
          createEmbed({
            title: '🎫 Configuración de tickets',
            description: [
              `**Estado:** ${settings.enabled ? 'activado' : 'desactivado'}`,
              `**Panel:** ${channel(settings.panelChannelId)}`,
              `**Categoría:** ${channel(settings.categoryId)}`,
              `**Archivo:** ${channel(settings.archiveChannelId)}`,
              `**Múltiples tickets:** ${settings.allowMultiple ? `sí (máx. ${settings.maxOpenPerUser})` : 'no'}`,
              `**El creador puede cerrar:** ${settings.creatorCanClose ? 'sí' : 'no'}`,
              `**Atención:** ${roleList(tickets.listRoles(guildId, 'support'))}`,
              `**Excluidos:** ${roleList(tickets.listRoles(guildId, 'excluded'))}`,
              `**Pueden cerrar:** ${roleList(tickets.listRoles(guildId, 'closer'))}`,
              '**Administradores:** acceso completo',
            ].join('\n'),
          }),
        ],
        allowedMentions: { parse: [] },
        flags: EPHEMERAL,
      });
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
