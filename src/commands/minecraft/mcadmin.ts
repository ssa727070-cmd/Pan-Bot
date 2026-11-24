import {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ActionRowBuilder,
  type ButtonBuilder,
  type EmbedBuilder,
  type GuildMember,
} from 'discord.js';
import type { Command } from '../../types/command.js';
import { MinecraftRepository } from '../../database/repositories/minecraftRepository.js';
import { customCommandError } from '../../minecraft/allowlist.js';
import { getMinecraftConnection, rconUnavailableMessage } from '../../minecraft/connection.js';
import { isMinecraftLevel, isMinecraftOwner } from '../../minecraft/permissions.js';
import {
  checkMinecraftAccess,
  createMaintenanceConfirmation,
  executeMinecraftAction,
  sendMinecraftPanel,
} from '../../minecraft/service.js';
import type { MinecraftAction, MinecraftPanelKind } from '../../minecraft/types.js';
import { successEmbed, errorEmbed, infoEmbed } from '../../utils/embeds.js';

type ConfirmRow = ActionRowBuilder<ButtonBuilder>;

/** The Minecraft permission each /mcadmin subcommand requires (see docs/features/minecraft.md). */
export const SUBCOMMAND_ACTIONS: Record<string, MinecraftAction> = {
  setup: 'setup',
  roles: 'roles',
  allowlist: 'allowlist',
  panel: 'panel-send',
  notifications: 'notifications',
  maintenance: 'maintenance-status',
  'console-mode': 'setup',
  audit: 'audit',
};

const PANEL_TYPES: readonly MinecraftPanelKind[] = ['overview', 'status', 'players', 'maintenance'];

const command: Command = {
  category: 'minecraft',
  data: new SlashCommandBuilder()
    .setName('mcadmin')
    .setDescription('Configura la integración de administración de Minecraft.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName('setup')
        .setDescription('Activa o configura la integración.')
        .addBooleanOption((o) =>
          o.setName('enabled').setDescription('Activar integración').setRequired(true),
        )
        .addChannelOption((o) =>
          o
            .setName('notificaciones')
            .setDescription('Canal de notificaciones')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false),
        )
        .addChannelOption((o) =>
          o
            .setName('auditoria')
            .setDescription('Canal de auditoría')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('roles')
        .setDescription('Configura roles por nivel.')
        .addStringOption((o) =>
          o
            .setName('nivel')
            .setDescription('Nivel')
            .setRequired(true)
            .addChoices(
              { name: 'owner', value: 'owner' },
              { name: 'admin', value: 'admin' },
              { name: 'moderator', value: 'moderator' },
              { name: 'readonly', value: 'readonly' },
            ),
        )
        .addStringOption((o) =>
          o
            .setName('accion')
            .setDescription('Acción')
            .setRequired(true)
            .addChoices(
              { name: 'add', value: 'add' },
              { name: 'remove', value: 'remove' },
              { name: 'list', value: 'list' },
              { name: 'clear', value: 'clear' },
            ),
        )
        .addRoleOption((o) => o.setName('rol').setDescription('Rol de Discord').setRequired(false)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('allowlist')
        .setDescription('Gestiona comandos de consola permitidos.')
        .addStringOption((o) =>
          o
            .setName('accion')
            .setDescription('Acción')
            .setRequired(true)
            .addChoices(
              { name: 'add', value: 'add' },
              { name: 'remove', value: 'remove' },
              { name: 'list', value: 'list' },
            ),
        )
        .addStringOption((o) =>
          o.setName('comando').setDescription('Nombre del comando').setRequired(false),
        )
        .addStringOption((o) =>
          o
            .setName('patron')
            .setDescription('Regex segura para args (sin /, sin espacios raros)')
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('panel')
        .setDescription('Publica un panel persistente.')
        .addChannelOption((o) =>
          o
            .setName('canal')
            .setDescription('Canal de texto')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName('tipo')
            .setDescription('Tipo de panel')
            .setRequired(false)
            .addChoices(
              { name: 'overview', value: 'overview' },
              { name: 'status', value: 'status' },
              { name: 'players', value: 'players' },
              { name: 'maintenance', value: 'maintenance' },
            ),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('notifications')
        .setDescription('Configura notificaciones.')
        .addChannelOption((o) =>
          o
            .setName('canal')
            .setDescription('Canal')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false),
        )
        .addBooleanOption((o) => o.setName('join').setDescription('Avisar join').setRequired(false))
        .addBooleanOption((o) =>
          o.setName('leave').setDescription('Avisar leave').setRequired(false),
        )
        .addBooleanOption((o) =>
          o.setName('online').setDescription('Avisar online').setRequired(false),
        )
        .addBooleanOption((o) =>
          o.setName('offline').setDescription('Avisar offline').setRequired(false),
        )
        .addIntegerOption((o) =>
          o
            .setName('intervalo')
            .setDescription('Intervalo en segundos')
            .setMinValue(30)
            .setMaxValue(3600)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('maintenance')
        .setDescription('Activa/desactiva mantenimiento (requiere confirmación).')
        .addBooleanOption((o) =>
          o.setName('enabled').setDescription('Activar mantenimiento').setRequired(true),
        )
        .addBooleanOption((o) =>
          o
            .setName('whitelist')
            .setDescription('Aplicar whitelist durante mantenimiento')
            .setRequired(false),
        )
        .addStringOption((o) => o.setName('mensaje').setDescription('Mensaje').setRequired(false)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('console-mode')
        .setDescription('Activa/desactiva modo consola irrestricto (solo owner, peligroso).')
        .addBooleanOption((o) => o.setName('enabled').setDescription('Activar').setRequired(true)),
    )
    .addSubcommand((sub) => sub.setName('audit').setDescription('Muestra auditoría reciente.')),

  async execute(interaction, client) {
    if (!interaction.inGuild() || !interaction.guild) return;
    // Every subcommand answers privately; defer so slow work never misses Discord's 3 s window.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const guildId = interaction.guildId;
    const member = interaction.member as GuildMember;
    const repo = new MinecraftRepository(client.db.sqlite);
    const sub = interaction.options.getSubcommand();
    const respond = async (embeds: EmbedBuilder[], components: ConfirmRow[] = []) => {
      await interaction.editReply({ embeds, components });
    };

    const action = SUBCOMMAND_ACTIONS[sub];
    if (!action) {
      await respond([errorEmbed('Subcomando desconocido.')]);
      return;
    }
    // Configuration works while the integration is disabled, but always requires
    // the documented Minecraft level (admin) — not just Discord's Manage Guild.
    // console-mode is owner-gated below; every subcommand still requires an
    // authorised guild (MINECRAFT_GUILD_IDS) and, except console-mode, the admin level.
    const denied =
      sub === 'console-mode'
        ? getMinecraftConnection(client, guildId).guildAllowed
          ? null
          : {
              embeds: [
                errorEmbed(
                  'Este servidor de Discord no está autorizado para la integración de Minecraft (`MINECRAFT_GUILD_IDS`).',
                ),
              ],
            }
        : checkMinecraftAccess(client, member, action, { requireEnabled: false });
    if (denied) {
      await respond(denied.embeds);
      return;
    }

    if (sub === 'setup') {
      const settings = repo.updateSettings(guildId, {
        enabled: interaction.options.getBoolean('enabled', true),
        notificationChannelId: interaction.options.getChannel('notificaciones')?.id ?? undefined,
        auditChannelId: interaction.options.getChannel('auditoria')?.id ?? undefined,
      });
      const connection = getMinecraftConnection(client, guildId);
      const notes = [
        `Servidor: **${connection.host}:${connection.queryPort}** (fijado por el operador en el entorno).`,
        connection.rconConfigured
          ? 'RCON: **disponible**.'
          : `RCON: **no disponible** — ${rconUnavailableMessage(connection.rconUnavailableReason ?? 'no-password')}`,
        connection.ignoredOverrides
          ? '⚠️ Este servidor tenía host/puertos personalizados de v1.1.5. Ya no se usan: el destino solo se configura en el entorno.'
          : null,
      ].filter(Boolean);
      repo.recordAudit({ guildId, adminId: member.id, action: 'setup', result: 'success' });
      await respond([
        successEmbed(
          settings.enabled ? 'Minecraft activado' : 'Minecraft desactivado',
          notes.join('\n'),
        ),
      ]);
      return;
    }

    if (sub === 'roles') {
      const level = interaction.options.getString('nivel', true);
      if (!isMinecraftLevel(level)) {
        await respond([errorEmbed('Nivel inválido.')]);
        return;
      }
      const roleAction = interaction.options.getString('accion', true);
      const role = interaction.options.getRole('rol');
      if (roleAction === 'list') {
        const roles = repo.listRoles(guildId, level);
        await respond([
          infoEmbed(
            `Roles ${level}`,
            roles.length
              ? roles.map((r) => `<@&${r.roleId}>`).join(', ')
              : 'Sin roles configurados.',
          ),
        ]);
        return;
      }
      // Granting or revoking the owner level is itself an owner-only action.
      if (level === 'owner' && !isMinecraftOwner(member)) {
        await respond([
          errorEmbed('Solo el dueño del servidor puede gestionar roles de nivel owner.'),
        ]);
        return;
      }
      if (roleAction === 'clear') {
        repo.clearRoles(guildId, level);
        repo.recordAudit({
          guildId,
          adminId: member.id,
          action: 'roles',
          command: `clear ${level}`,
          result: 'success',
        });
        await respond([
          successEmbed('Roles limpiados', `Se eliminaron los roles del nivel ${level}.`),
        ]);
        return;
      }
      if (!role) {
        await respond([errorEmbed('Debes indicar un rol.')]);
        return;
      }
      if (roleAction === 'add') repo.addRole(guildId, level, role.id);
      if (roleAction === 'remove') repo.removeRole(guildId, level, role.id);
      repo.recordAudit({
        guildId,
        adminId: member.id,
        action: 'roles',
        command: `${roleAction} ${level} ${role.id}`,
        result: 'success',
      });
      await respond([successEmbed('Roles actualizados', `Nivel ${level}: <@&${role.id}>`)]);
      return;
    }

    if (sub === 'allowlist') {
      const allowAction = interaction.options.getString('accion', true);
      const name = interaction.options.getString('comando')?.toLowerCase().trim();
      const pattern = interaction.options.getString('patron')?.trim() ?? '';
      if (allowAction === 'list') {
        const entries = repo.listAllowedCommands(guildId);
        await respond([
          infoEmbed(
            'Allowlist de consola',
            entries.length
              ? entries
                  .map((e) => `\`${e.command}\`${e.argPattern ? ` — \`${e.argPattern}\`` : ''}`)
                  .join('\n')
              : 'Solo comandos read-only por defecto.',
          ),
        ]);
        return;
      }
      if (!name) {
        await respond([errorEmbed('Debes indicar un comando.')]);
        return;
      }
      if (allowAction === 'remove') {
        repo.removeAllowedCommand(guildId, name);
        repo.recordAudit({
          guildId,
          adminId: member.id,
          action: 'allowlist',
          command: `remove ${name}`,
          result: 'success',
        });
        await respond([successEmbed('Allowlist actualizada', `Se eliminó \`${name}\`.`)]);
        return;
      }
      const problem = customCommandError(name, pattern);
      if (problem) {
        repo.recordAudit({
          guildId,
          adminId: member.id,
          action: 'allowlist',
          command: `add ${name}`,
          result: 'denied',
          error: problem,
        });
        await respond([errorEmbed(problem)]);
        return;
      }
      repo.addAllowedCommand(guildId, name, pattern, member.id);
      repo.recordAudit({
        guildId,
        adminId: member.id,
        action: 'allowlist',
        command: `add ${name}`,
        result: 'success',
      });
      await respond([successEmbed('Allowlist actualizada', `\`${name}\` permitido.`)]);
      return;
    }

    if (sub === 'panel') {
      const channel = interaction.options.getChannel('canal', true);
      const kindOption = interaction.options.getString('tipo') ?? 'overview';
      const kind = PANEL_TYPES.find((entry) => entry === kindOption) ?? 'overview';
      const result = await sendMinecraftPanel(client, interaction, channel.id, kind);
      await respond(result.embeds);
      return;
    }

    if (sub === 'notifications') {
      repo.updateSettings(guildId, {
        notificationChannelId: interaction.options.getChannel('canal')?.id ?? undefined,
        notifyJoin: interaction.options.getBoolean('join') ?? undefined,
        notifyLeave: interaction.options.getBoolean('leave') ?? undefined,
        notifyOnline: interaction.options.getBoolean('online') ?? undefined,
        notifyOffline: interaction.options.getBoolean('offline') ?? undefined,
        notifyIntervalSeconds: interaction.options.getInteger('intervalo') ?? undefined,
      });
      repo.recordAudit({ guildId, adminId: member.id, action: 'notifications', result: 'success' });
      await respond([successEmbed('Notificaciones actualizadas', 'Configuración guardada.')]);
      return;
    }

    if (sub === 'maintenance') {
      const enabled = interaction.options.getBoolean('enabled', true);
      const maintenanceAction = enabled ? 'maintenance-enable' : 'maintenance-disable';
      const maintenanceDenied = checkMinecraftAccess(client, member, maintenanceAction, {
        requireEnabled: false,
      });
      if (maintenanceDenied) {
        await respond(maintenanceDenied.embeds);
        return;
      }
      const whitelist = interaction.options.getBoolean('whitelist') ?? false;
      const message =
        interaction.options.getString('mensaje')?.slice(0, 300) ??
        repo.getSettings(guildId).maintenanceMessage;
      const confirmation = createMaintenanceConfirmation({
        guildId,
        userId: member.id,
        enabled,
        whitelist,
        message,
      });
      await respond([confirmation.embed], confirmation.components);
      return;
    }

    if (sub === 'console-mode') {
      if (!isMinecraftOwner(member)) {
        repo.recordAudit({
          guildId,
          adminId: member.id,
          action: 'console-mode',
          result: 'denied',
          error: 'no es owner',
        });
        await respond([
          errorEmbed('Solo el dueño del servidor puede cambiar el modo consola irrestricto.'),
        ]);
        return;
      }
      const unrestricted = interaction.options.getBoolean('enabled', true);
      repo.updateSettings(guildId, { unrestrictedConsole: unrestricted });
      repo.recordAudit({
        guildId,
        adminId: member.id,
        action: 'console-mode',
        command: `unrestricted=${unrestricted}`,
        result: 'success',
      });
      await respond([
        successEmbed(
          'Modo consola actualizado',
          'El modo irrestricto sigue bloqueando comandos destructivos como stop/restart, también con namespace (`minecraft:stop`) o dentro de `execute ... run`.',
        ),
      ]);
      return;
    }

    if (sub === 'audit') {
      const result = await executeMinecraftAction(client, interaction, 'audit', {
        ephemeral: true,
      });
      await respond(result.embeds);
    }
  },
};

export default command;
