import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../types/command.js';
import { MinecraftRepository } from '../../database/repositories/minecraftRepository.js';
import {
  executeMinecraftAction,
  sendMinecraftPanel,
  createMaintenanceConfirmation,
} from '../../minecraft/service.js';
import { successEmbed, errorEmbed, infoEmbed } from '../../utils/embeds.js';

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
        .addStringOption((o) =>
          o.setName('host').setDescription('Host del servidor').setRequired(false),
        )
        .addIntegerOption((o) =>
          o
            .setName('query_port')
            .setDescription('Puerto de estado/query')
            .setMinValue(1)
            .setMaxValue(65535)
            .setRequired(false),
        )
        .addIntegerOption((o) =>
          o
            .setName('rcon_port')
            .setDescription('Puerto RCON')
            .setMinValue(1)
            .setMaxValue(65535)
            .setRequired(false),
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
    const repo = new MinecraftRepository(client.db.sqlite);
    const sub = interaction.options.getSubcommand();

    if (sub === 'setup') {
      repo.updateSettings(interaction.guildId!, {
        enabled: interaction.options.getBoolean('enabled', true),
        host: interaction.options.getString('host') ?? undefined,
        queryPort: interaction.options.getInteger('query_port') ?? undefined,
        rconPort: interaction.options.getInteger('rcon_port') ?? undefined,
        notificationChannelId: interaction.options.getChannel('notificaciones')?.id ?? undefined,
        auditChannelId: interaction.options.getChannel('auditoria')?.id ?? undefined,
      });
      await interaction.reply({
        embeds: [
          successEmbed(
            'Minecraft configurado',
            'La configuración se guardó. Recuerda configurar `MINECRAFT_RCON_PASSWORD` en el entorno si necesitas RCON.',
          ),
        ],
        ephemeral: true,
      });
      return;
    }

    if (sub === 'roles') {
      const level = interaction.options.getString('nivel', true) as any;
      const action = interaction.options.getString('accion', true);
      const role = interaction.options.getRole('rol');
      if (action === 'list') {
        const roles = repo.listRoles(interaction.guildId!, level);
        await interaction.reply({
          embeds: [
            infoEmbed(
              `Roles ${level}`,
              roles.length
                ? roles.map((r) => `<@&${r.roleId}>`).join(', ')
                : 'Sin roles configurados.',
            ),
          ],
          ephemeral: true,
        });
        return;
      }
      if (action === 'clear') {
        repo.clearRoles(interaction.guildId!, level);
        await interaction.reply({
          embeds: [successEmbed('Roles limpiados', `Se eliminaron los roles del nivel ${level}.`)],
          ephemeral: true,
        });
        return;
      }
      if (!role) {
        await interaction.reply({ embeds: [errorEmbed('Debes indicar un rol.')], ephemeral: true });
        return;
      }
      if (action === 'add') repo.addRole(interaction.guildId!, level, role.id);
      if (action === 'remove') repo.removeRole(interaction.guildId!, level, role.id);
      await interaction.reply({
        embeds: [successEmbed('Roles actualizados', `Nivel ${level}: <@&${role.id}>`)],
        ephemeral: true,
      });
      return;
    }

    if (sub === 'allowlist') {
      const action = interaction.options.getString('accion', true);
      const name = interaction.options.getString('comando')?.toLowerCase().trim();
      const pattern = interaction.options.getString('patron') ?? '';
      if (action === 'list') {
        const entries = repo.listAllowedCommands(interaction.guildId!);
        await interaction.reply({
          embeds: [
            infoEmbed(
              'Allowlist de consola',
              entries.length
                ? entries
                    .map((e) => `\`${e.command}\`${e.argPattern ? ` — \`${e.argPattern}\`` : ''}`)
                    .join('\n')
                : 'Solo comandos read-only por defecto.',
            ),
          ],
          ephemeral: true,
        });
        return;
      }
      if (!name) {
        await interaction.reply({
          embeds: [errorEmbed('Debes indicar un comando.')],
          ephemeral: true,
        });
        return;
      }
      if (action === 'remove') {
        repo.removeAllowedCommand(interaction.guildId!, name);
        await interaction.reply({
          embeds: [successEmbed('Allowlist actualizada', `Se eliminó \`${name}\`.`)],
          ephemeral: true,
        });
        return;
      }
      if (!/^[a-z][a-z0-9:._-]{0,63}$/.test(name) || !/^[A-Za-z0-9 _.,:@#+-]*$/.test(pattern)) {
        await interaction.reply({
          embeds: [errorEmbed('Comando o patrón no seguro.')],
          ephemeral: true,
        });
        return;
      }
      repo.addAllowedCommand(interaction.guildId!, name, pattern, interaction.user.id);
      await interaction.reply({
        embeds: [successEmbed('Allowlist actualizada', `\`${name}\` permitido.`)],
        ephemeral: true,
      });
      return;
    }

    if (sub === 'panel') {
      const channel = interaction.options.getChannel('canal', true);
      const kind = (interaction.options.getString('tipo') ?? 'overview') as any;
      const result = await sendMinecraftPanel(client, interaction, channel.id, kind);
      await interaction.reply({
        embeds: result.embeds,
        components: result.components ?? [],
        ephemeral: true,
      });
      return;
    }

    if (sub === 'notifications') {
      repo.updateSettings(interaction.guildId!, {
        notificationChannelId: interaction.options.getChannel('canal')?.id ?? undefined,
        notifyJoin: interaction.options.getBoolean('join') ?? undefined,
        notifyLeave: interaction.options.getBoolean('leave') ?? undefined,
        notifyOnline: interaction.options.getBoolean('online') ?? undefined,
        notifyOffline: interaction.options.getBoolean('offline') ?? undefined,
        notifyIntervalSeconds: interaction.options.getInteger('intervalo') ?? undefined,
      });
      await interaction.reply({
        embeds: [successEmbed('Notificaciones actualizadas', 'Configuración guardada.')],
        ephemeral: true,
      });
      return;
    }

    if (sub === 'maintenance') {
      const enabled = interaction.options.getBoolean('enabled', true);
      const whitelist = interaction.options.getBoolean('whitelist') ?? false;
      const message =
        interaction.options.getString('mensaje') ??
        repo.getSettings(interaction.guildId!).maintenanceMessage;
      const confirmation = createMaintenanceConfirmation({
        guildId: interaction.guildId!,
        userId: interaction.user.id,
        enabled,
        whitelist,
        message,
      });
      await interaction.reply({
        embeds: [confirmation.embed],
        components: confirmation.components,
        ephemeral: true,
      });
      return;
    }

    if (sub === 'console-mode') {
      if (interaction.guild.ownerId !== interaction.user.id) {
        await interaction.reply({
          embeds: [
            errorEmbed('Solo el dueño del servidor puede cambiar el modo consola irrestricto.'),
          ],
          ephemeral: true,
        });
        return;
      }
      repo.updateSettings(interaction.guildId!, {
        unrestrictedConsole: interaction.options.getBoolean('enabled', true),
      });
      await interaction.reply({
        embeds: [
          successEmbed(
            'Modo consola actualizado',
            'El modo irrestricto sigue bloqueando comandos destructivos como stop/restart.',
          ),
        ],
        ephemeral: true,
      });
      return;
    }

    if (sub === 'audit') {
      const result = await executeMinecraftAction(client, interaction, 'audit', {
        ephemeral: true,
      });
      await interaction.reply({ embeds: result.embeds, ephemeral: true });
    }
  },
};

export default command;
