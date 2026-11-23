import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type GuildBasedChannel,
} from 'discord.js';
import { panelComponents, panelEmbed, validateAssignableRole } from '../../autoroles/service.js';
import {
  AutoroleRepository,
  type PanelRoleInput,
} from '../../database/repositories/autoroleRepository.js';
import { logger } from '../../core/logger.js';
import type { Command } from '../../types/command.js';
import { isSendable } from '../../utils/channels.js';
import { createEmbed, errorEmbed, successEmbed } from '../../utils/embeds.js';
import { panelLabel, panelDescription } from '../../validation/config.js';

const command: Command = {
  category: 'autoroles',
  data: new SlashCommandBuilder()
    .setName('autorole')
    .setDescription('Configura roles automáticos y paneles de selección.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName('setup')
        .setDescription('Activa los roles automáticos para nuevos miembros.')
        .addBooleanOption((option) =>
          option
            .setName('bots')
            .setDescription('Asignar roles también a bots (por defecto, no)')
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Añade un rol que se asignará al entrar.')
        .addRoleOption((option) =>
          option.setName('rol').setDescription('Rol a asignar').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Quita un rol automático.')
        .addRoleOption((option) =>
          option.setName('rol').setDescription('Rol a quitar').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('list').setDescription('Muestra la configuración y los roles automáticos.'),
    )
    .addSubcommand((sub) =>
      sub.setName('disable').setDescription('Desactiva los roles automáticos.'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('panel-create')
        .setDescription('Crea y publica un panel de roles.')
        .addChannelOption((option) =>
          option
            .setName('canal')
            .setDescription('Canal donde publicar el panel')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        )
        .addStringOption((option) =>
          option.setName('titulo').setDescription('Título del panel').setRequired(true),
        )
        .addStringOption((option) =>
          option.setName('descripcion').setDescription('Descripción del panel').setRequired(false),
        )
        .addIntegerOption((option) =>
          option
            .setName('limite')
            .setDescription('Máximo de roles por miembro (1-10)')
            .setMinValue(1)
            .setMaxValue(10)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('panel-edit')
        .setDescription('Añade o quita un rol de un panel.')
        .addIntegerOption((option) =>
          option.setName('panel').setDescription('ID del panel').setRequired(true).setMinValue(1),
        )
        .addRoleOption((option) =>
          option.setName('rol').setDescription('Rol del panel').setRequired(true),
        )
        .addStringOption((option) =>
          option.setName('etiqueta').setDescription('Texto del botón').setRequired(false),
        )
        .addStringOption((option) =>
          option.setName('descripcion').setDescription('Descripción del rol').setRequired(false),
        )
        .addStringOption((option) =>
          option
            .setName('accion')
            .setDescription('Añadir o quitar el rol del panel')
            .setRequired(true)
            .addChoices({ name: 'Añadir', value: 'add' }, { name: 'Quitar', value: 'remove' }),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('panel-delete')
        .setDescription('Elimina un panel y su mensaje.')
        .addIntegerOption((option) =>
          option.setName('panel').setDescription('ID del panel').setRequired(true).setMinValue(1),
        ),
    ),

  async execute(interaction, client) {
    if (!interaction.guild) return;
    const guild = interaction.guild;
    const repo = new AutoroleRepository(client.db.sqlite);
    const subcommand = interaction.options.getSubcommand(true);
    const guildId = guild.id;
    const isPanelCommand = subcommand.startsWith('panel-');

    if (isPanelCommand) {
      if (subcommand === 'panel-create') {
        const channel = interaction.options.getChannel('canal', true) as GuildBasedChannel;
        const titleResult = panelLabel.safeParse(interaction.options.getString('titulo', true));
        const descriptionResult = panelDescription.safeParse(
          interaction.options.getString('descripcion') ?? '',
        );
        if (!titleResult.success || !descriptionResult.success) {
          await interaction.reply({
            embeds: [errorEmbed('El título o la descripción no son válidos.')],
            ephemeral: true,
          });
          return;
        }

        const panel = repo.createPanel({
          guildId,
          channelId: channel.id,
          title: titleResult.data,
          description: descriptionResult.data,
          maxSelections: interaction.options.getInteger('limite') ?? 1,
          roles: [],
        });

        if (!isSendable(channel)) {
          repo.deletePanel(guildId, panel.id);
          await interaction.reply({
            embeds: [errorEmbed('No puedo enviar mensajes en ese canal.')],
            ephemeral: true,
          });
          return;
        }

        try {
          const message = await channel.send({
            embeds: [panelEmbed(panel, [])],
          });
          repo.setPanelMessage(guildId, panel.id, message.id);
          await interaction.reply({
            embeds: [
              successEmbed(
                'Panel creado',
                `Panel \`#${panel.id}\` publicado en <#${channel.id}>. Usa \`/autorole panel-edit\` para añadir roles.`,
              ),
            ],
            ephemeral: true,
          });
        } catch (error) {
          repo.deletePanel(guildId, panel.id);
          logger.warn({ error, guildId }, 'Could not publish role panel');
          await interaction.reply({
            embeds: [errorEmbed('No se pudo publicar el panel. Revisa mis permisos.')],
            ephemeral: true,
          });
        }
        return;
      }

      const panelId = interaction.options.getInteger('panel', true);
      const panel = repo.getPanel(guildId, panelId);
      if (!panel) {
        await interaction.reply({
          embeds: [errorEmbed('No existe ese panel en este servidor.')],
          ephemeral: true,
        });
        return;
      }

      if (subcommand === 'panel-delete') {
        repo.deletePanel(guildId, panelId);
        try {
          const channel = await client.channels.fetch(panel.channelId);
          if (isSendable(channel) && panel.messageId) {
            const message = await channel.messages.fetch(panel.messageId);
            await message.delete();
          }
        } catch {
          // The panel message may already have been deleted.
        }
        await interaction.reply({
          embeds: [successEmbed('Panel eliminado', `El panel \`#${panelId}\` se ha eliminado.`)],
          ephemeral: true,
        });
        return;
      }

      const role = interaction.options.getRole('rol', true);
      const problem = validateAssignableRole(guild, guild.members.me ?? null, role.id);
      if (problem) {
        await interaction.reply({ embeds: [errorEmbed(problem)], ephemeral: true });
        return;
      }

      const existing = repo.getPanelRoles(panelId);
      const labelResult = panelLabel.safeParse(
        interaction.options.getString('etiqueta') ?? role.name,
      );
      const descriptionResult = panelDescription.safeParse(
        interaction.options.getString('descripcion') ?? '',
      );
      if (!labelResult.success || !descriptionResult.success) {
        await interaction.reply({
          embeds: [errorEmbed('La etiqueta o descripción no son válidas.')],
          ephemeral: true,
        });
        return;
      }

      const action = interaction.options.getString('accion', true);
      if (action === 'add' && existing.length >= 25) {
        await interaction.reply({
          embeds: [errorEmbed('Un panel puede tener como máximo 25 roles.')],
          ephemeral: true,
        });
        return;
      }

      if (action === 'remove') {
        repo.replacePanelRoles(
          panelId,
          existing.filter((entry) => entry.roleId !== role.id),
        );
      } else {
        const entry: PanelRoleInput = {
          roleId: role.id,
          label: labelResult.data,
          description: descriptionResult.data,
          position: existing.length,
        };
        repo.replacePanelRoles(panelId, [
          ...existing.filter((item) => item.roleId !== role.id),
          entry,
        ]);
      }

      try {
        const channel = await client.channels.fetch(panel.channelId);
        if (isSendable(channel) && panel.messageId) {
          const message = await channel.messages.fetch(panel.messageId);
          await message.edit({
            embeds: [panelEmbed(panel, repo.getPanelRoles(panelId))],
            components: panelComponents(panel, repo.getPanelRoles(panelId)),
          });
        }
      } catch (error) {
        logger.warn({ error, guildId, panelId }, 'Could not refresh role panel');
      }

      await interaction.reply({
        embeds: [successEmbed('Panel actualizado', `El panel \`#${panelId}\` se ha actualizado.`)],
        ephemeral: true,
      });
      return;
    }

    if (subcommand === 'setup' || subcommand === 'disable') {
      const enabled = subcommand === 'setup';
      repo.setSettings(guildId, {
        enabled,
        ...(enabled && interaction.options.getBoolean('bots') !== null
          ? { includeBots: interaction.options.getBoolean('bots') === true }
          : {}),
      });
      await interaction.reply({
        embeds: [
          successEmbed(
            enabled ? 'Roles automáticos activados' : 'Roles automáticos desactivados',
            enabled
              ? 'Los nuevos miembros recibirán los roles configurados.'
              : 'Los nuevos miembros ya no recibirán roles automáticos.',
          ),
        ],
        ephemeral: true,
      });
      return;
    }

    if (subcommand === 'add' || subcommand === 'remove') {
      const role = interaction.options.getRole('rol', true);
      if (subcommand === 'add') {
        const problem = validateAssignableRole(guild, guild.members.me ?? null, role.id);
        if (problem) {
          await interaction.reply({ embeds: [errorEmbed(problem)], ephemeral: true });
          return;
        }
        const added = repo.addRole(guildId, role.id);
        await interaction.reply({
          embeds: [
            added
              ? successEmbed('Rol añadido', `<@&${role.id}> se asignará a los nuevos miembros.`)
              : errorEmbed('Ese rol ya estaba configurado.'),
          ],
          ephemeral: true,
        });
        return;
      }

      const removed = repo.removeRole(guildId, role.id);
      await interaction.reply({
        embeds: [
          removed
            ? successEmbed('Rol eliminado', `<@&${role.id}> ya no se asignará automáticamente.`)
            : errorEmbed('Ese rol no estaba configurado.'),
        ],
        ephemeral: true,
      });
      return;
    }

    if (subcommand === 'list') {
      const settings = repo.getSettings(guildId);
      const roles = repo.listRoles(guildId);
      const panels = repo.listPanels(guildId);
      await interaction.reply({
        embeds: [
          createEmbed({
            title: '⚙️ Roles automáticos',
            fields: [
              {
                name: 'Estado',
                value: settings.enabled ? 'Activado' : 'Desactivado',
                inline: true,
              },
              {
                name: 'Bots incluidos',
                value: settings.includeBots ? 'Sí' : 'No',
                inline: true,
              },
              {
                name: 'Roles de entrada',
                value: roles.length ? roles.map((id) => `<@&${id}>`).join('\n') : 'Ninguno',
              },
              {
                name: 'Paneles',
                value: panels.length
                  ? panels
                      .map(
                        (panel) =>
                          `\`#${panel.id}\` — ${panel.title} (${repo.getPanelRoles(panel.id).length} roles)`,
                      )
                      .join('\n')
                  : 'Ninguno',
              },
            ],
            footer: 'PAN BOT · Roles automáticos',
          }),
        ],
        ephemeral: true,
      });
    }
  },
};

export default command;
