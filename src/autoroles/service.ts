import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ButtonInteraction,
  type Guild,
  type GuildMember,
  type Role,
} from 'discord.js';
import type { PanClient } from '../core/client.js';
import { logger } from '../core/logger.js';
import {
  AutoroleRepository,
  type AutorolePanel,
  type PanelRole,
} from '../database/repositories/autoroleRepository.js';
import { createEmbed, errorEmbed, successEmbed } from '../utils/embeds.js';
import { AUTOROLE_PANEL_PREFIX } from './constants.js';

/** Validates hierarchy, bot permissions and role existence before any assignment. */
export function validateAssignableRole(
  guild: Guild,
  bot: GuildMember | null,
  roleId: string,
): string | null {
  const role = guild.roles.cache.get(roleId) ?? null;
  if (!role) return 'El rol ya no existe en este servidor.';
  if (role.managed) return 'No puedo asignar roles gestionados por integraciones.';
  if (!bot) return 'No pude verificar mis permisos en este servidor.';
  if (!bot.permissions.has('ManageRoles')) {
    return 'Me falta el permiso **Gestionar roles** para asignar roles automáticos.';
  }
  if (role.position >= bot.roles.highest.position) {
    return 'El rol está por encima o al mismo nivel que mi rol más alto.';
  }
  return null;
}

function repository(client: PanClient): AutoroleRepository {
  return new AutoroleRepository(client.db.sqlite);
}

/** Assigns all configured join roles, tolerating deleted roles and Discord failures. */
export async function assignJoinRoles(client: PanClient, member: GuildMember): Promise<number> {
  const settings = repository(client).getSettings(member.guild.id);
  if (!settings.enabled) return 0;
  if (member.user.bot && !settings.includeBots) return 0;

  const repo = repository(client);
  const roleIds = repo.listRoles(member.guild.id);
  const bot = member.guild.members.me ?? null;
  const validIds = new Set(member.guild.roles.cache.keys());
  let assigned = 0;

  for (const roleId of roleIds) {
    if (!validIds.has(roleId)) continue;
    const problem = validateAssignableRole(member.guild, bot, roleId);
    if (problem) {
      logger.warn({ guildId: member.guild.id, roleId, reason: problem }, 'Skipped automatic role');
      continue;
    }
    try {
      await member.roles.add(roleId, 'Rol automático PAN BOT');
      assigned += 1;
    } catch (error) {
      logger.warn({ error, guildId: member.guild.id, roleId }, 'Could not assign automatic role');
    }
  }

  return assigned;
}

export function panelEmbed(panel: AutorolePanel, roles: PanelRole[]) {
  const description = [
    panel.description,
    ...roles.map(
      (role, index) => `**${index + 1}. ${role.label}** — <@&${role.roleId}>\n${role.description}`,
    ),
  ]
    .filter(Boolean)
    .join('\n\n');

  return createEmbed({
    title: `🎭 ${panel.title}`,
    description: description || 'Selecciona tus roles con los botones de abajo.',
    fields: [
      {
        name: 'Límite',
        value: `Puedes tener hasta ${panel.maxSelections} rol(es) de este panel.`,
        inline: false,
      },
    ],
    footer: 'PAN BOT · Roles automáticos',
  });
}

/** Up to 5 buttons per row, 25 total (Discord component limits). */
export function panelComponents(
  panel: AutorolePanel,
  roles: PanelRole[],
): ActionRowBuilder<ButtonBuilder>[] {
  const usable = roles.slice(0, 25);
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];

  for (let index = 0; index < usable.length; index += 5) {
    const row = new ActionRowBuilder<ButtonBuilder>();
    for (const role of usable.slice(index, index + 5)) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`${AUTOROLE_PANEL_PREFIX}${panel.id}:${role.roleId}`)
          .setLabel(role.label.slice(0, 80))
          .setStyle(ButtonStyle.Secondary),
      );
    }
    rows.push(row);
  }

  return rows;
}

/** Toggles a panel role for the interacting member with hierarchy and limit checks. */
export async function handlePanelButton(
  client: PanClient,
  interaction: ButtonInteraction,
  panelId: number,
  roleId: string,
): Promise<void> {
  if (!interaction.guild) return;
  const guild = interaction.guild;
  const repo = repository(client);
  const panel = repo.getPanel(guild.id, panelId);
  const panelRoles = panel ? repo.getPanelRoles(panel.id) : [];

  if (!panel || !panelRoles.some((role) => role.roleId === roleId)) {
    await interaction.reply({
      embeds: [errorEmbed('Este panel ya no está disponible.')],
      ephemeral: true,
    });
    return;
  }

  const role = guild.roles.cache.get(roleId) as Role | undefined;
  if (!role) {
    await interaction.reply({
      embeds: [errorEmbed('El rol de este botón ya no existe.')],
      ephemeral: true,
    });
    return;
  }

  let member: GuildMember;
  try {
    member = await guild.members.fetch(interaction.user.id);
  } catch (error) {
    logger.warn({ error, guildId: guild.id }, 'Could not resolve panel member');
    await interaction.reply({
      embeds: [errorEmbed('No pude verificarte en este servidor. Inténtalo de nuevo.')],
      ephemeral: true,
    });
    return;
  }
  const problem = validateAssignableRole(guild, guild.members.me ?? null, roleId);
  if (problem) {
    await interaction.reply({ embeds: [errorEmbed(problem)], ephemeral: true });
    return;
  }

  const held = panelRoles.filter((entry) => member.roles.cache.has(entry.roleId));

  try {
    if (member.roles.cache.has(roleId)) {
      await member.roles.remove(roleId, 'Panel de roles PAN BOT');
      await interaction.reply({
        embeds: [successEmbed('Rol eliminado', `Ya no tienes **${role.name}**.`)],
        ephemeral: true,
      });
      return;
    }

    if (held.length >= panel.maxSelections) {
      await interaction.reply({
        embeds: [
          errorEmbed(
            `Solo puedes elegir ${panel.maxSelections} rol(es) de este panel. Quita uno primero.`,
          ),
        ],
        ephemeral: true,
      });
      return;
    }

    await member.roles.add(roleId, 'Panel de roles PAN BOT');
    await interaction.reply({
      embeds: [successEmbed('Rol asignado', `Ahora tienes **${role.name}**.`)],
      ephemeral: true,
    });
  } catch (error) {
    logger.warn({ error, guildId: guild.id, roleId }, 'Panel role toggle failed');
    await interaction.reply({
      embeds: [errorEmbed('No se pudo actualizar tu rol. Revisa mis permisos.')],
      ephemeral: true,
    });
  }
}
