import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type Guild,
  type GuildMember,
  type MessageActionRowComponentBuilder,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
  type TextBasedChannel,
} from 'discord.js';
import { env } from '../config/env.js';
import type { PanClient } from '../core/client.js';
import { logger } from '../core/logger.js';
import {
  MinecraftRepository,
  type MinecraftPanel,
} from '../database/repositories/minecraftRepository.js';
import { createEmbed, errorEmbed, infoEmbed, successEmbed, warningEmbed } from '../utils/embeds.js';
import { validateConsoleInput } from './allowlist.js';
import { buildMinecraftCommand, type BuiltCommand } from './commands.js';
import {
  cancelConfirmation,
  consumeConfirmation,
  createConfirmation,
  type ConfirmationOutcome,
  type MinecraftConfirmationAction,
} from './confirmation.js';
import {
  getMinecraftConnection,
  rconUnavailableMessage,
  runRconCommand,
  type RconUnavailableReason,
} from './connection.js';
import { detectPlugins, softwareLabel, type MinecraftSoftware } from './integrations.js';
import { actionLevel, canManageMinecraft, isMinecraftOwner } from './permissions.js';
import { redactSecrets } from './redact.js';
import { queryMinecraftStatus } from './status.js';
import type {
  MinecraftAction,
  MinecraftActionOptions,
  MinecraftActionResult,
  MinecraftInteraction,
  MinecraftLevel,
  MinecraftPanelKind,
  MinecraftStatus,
} from './types.js';

export { sendMinecraftNotification } from './notifications.js';

export const MC_BUTTON_PREFIX = 'mc';
export const MC_SELECT_PREFIX = 'mc-select';
export const MC_MODAL_PREFIX = 'mc-modal';

const PANEL_KINDS: readonly MinecraftPanelKind[] = [
  'overview',
  'status',
  'players',
  'players-admin',
  'server-admin',
  'maintenance',
];

const ACTIONS_REQUIRING_RCON = new Set<MinecraftAction>([
  'kick',
  'ban',
  'pardon',
  'whitelist-add',
  'whitelist-remove',
  'whitelist-list',
  'op',
  'deop',
  'mute',
  'unmute',
  'time',
  'weather',
  'difficulty',
  'gamemode',
  'teleport',
  'heal',
  'feed',
  'xp',
  'save',
  'gamerules',
  'say',
  'broadcast',
  'announce',
  'console',
]);

function repo(client: PanClient): MinecraftRepository {
  return new MinecraftRepository(client.db.sqlite);
}

function isTextChannel(
  channel: unknown,
): channel is TextBasedChannel & { send: (...args: unknown[]) => Promise<unknown> } {
  return !!channel && typeof (channel as { send?: unknown }).send === 'function';
}

function asMember(interaction: MinecraftInteraction): GuildMember | null {
  const member = interaction.member;
  if (!member || typeof member !== 'object' || !('roles' in member)) return null;
  return member as GuildMember;
}

function ensureGuild(interaction: MinecraftInteraction): { guild: Guild; member: GuildMember } {
  if (!interaction.inGuild() || !interaction.guild)
    throw new Error('Este comando solo funciona en servidores.');
  const member = asMember(interaction);
  if (!member) throw new Error('No se pudo resolver el miembro del servidor.');
  return { guild: interaction.guild, member };
}

function audit(
  client: PanClient,
  input: {
    guildId: string;
    adminId: string;
    action: string;
    targetPlayer?: string | null;
    command?: string | null;
    result: 'success' | 'failure' | 'denied';
    error?: string | null;
  },
): void {
  repo(client).recordAudit(input);
}

async function sendAuditToChannel(
  client: PanClient,
  guildId: string,
  embed: EmbedBuilder,
): Promise<void> {
  const settings = repo(client).getSettings(guildId);
  if (!settings.auditChannelId) return;
  const channel = await client.channels.fetch(settings.auditChannelId).catch(() => null);
  if (!isTextChannel(channel)) return;
  await channel.send({ embeds: [embed] }).catch((error: unknown) => {
    logger.warn({ error, guildId }, 'No se pudo enviar audit log de Minecraft');
  });
}

function auditEmbed(input: {
  action: string;
  adminId: string;
  result: string;
  targetPlayer?: string | null;
  command?: string | null;
}): EmbedBuilder {
  return infoEmbed(
    'Auditoría Minecraft',
    [
      `Acción: **${input.action}**`,
      `Moderador: <@${input.adminId}>`,
      `Resultado: **${input.result}**`,
      input.targetPlayer ? `Objetivo: ${input.targetPlayer}` : null,
      input.command ? `Comando: \`${redactSecrets(input.command).slice(0, 300)}\`` : null,
    ]
      .filter(Boolean)
      .join('\n'),
  );
}

function actionDenied(level: MinecraftLevel): MinecraftActionResult {
  return {
    ephemeral: true,
    embeds: [
      errorEmbed(
        `No tienes permiso para esta acción. Nivel requerido: **${level}**. Usa \`/mcadmin roles\` para configurar roles de Minecraft.`,
      ),
    ],
  };
}

function rconMissing(reason: RconUnavailableReason): MinecraftActionResult {
  return {
    ephemeral: true,
    embeds: [warningEmbed('RCON no disponible', rconUnavailableMessage(reason))],
  };
}

/**
 * Single access gate for every Minecraft action, command, button and confirmation:
 * guild authorisation, integration enabled and Minecraft permission level.
 * Returns a denial to show, or null when the member may proceed.
 */
export function checkMinecraftAccess(
  client: PanClient,
  member: GuildMember,
  action: MinecraftAction,
  options: { requireEnabled?: boolean; target?: string | null; command?: string | null } = {},
): MinecraftActionResult | null {
  const guildId = member.guild.id;
  const connection = getMinecraftConnection(client, guildId);
  if (!connection.guildAllowed) {
    return {
      ephemeral: true,
      embeds: [
        errorEmbed(
          'Este servidor de Discord no está autorizado para la integración de Minecraft (`MINECRAFT_GUILD_IDS`).',
        ),
      ],
    };
  }
  if ((options.requireEnabled ?? true) && !connection.settings.enabled) {
    return {
      ephemeral: true,
      embeds: [
        warningEmbed(
          'Minecraft desactivado',
          'Un administrador debe ejecutar `/mcadmin setup enabled:true` primero.',
        ),
      ],
    };
  }
  if (!canManageMinecraft(client, member, action)) {
    audit(client, {
      guildId,
      adminId: member.id,
      action,
      targetPlayer: options.target ?? null,
      command: options.command ?? null,
      result: 'denied',
      error: 'permiso insuficiente',
    });
    return actionDenied(actionLevel(action));
  }
  return null;
}

function statusEmbed(
  status: MinecraftStatus | null,
  connection: ReturnType<typeof getMinecraftConnection>,
): EmbedBuilder {
  if (!status) {
    return warningEmbed(
      'Servidor sin respuesta',
      `No se pudo obtener el estado de **${connection.host}:${connection.queryPort}**. Comprueba que el servidor esté online y que el puerto de consulta/status sea accesible.`,
    );
  }

  const partial = status.playerNames.length < status.playersOnline;
  const players =
    status.playerNames.length > 0
      ? `${status.playerNames.slice(0, 20).join(', ')}${partial ? ' (lista parcial del ping)' : ''}`
      : status.playersOnline > 0
        ? 'Nombres no disponibles desde la respuesta del servidor.'
        : 'Nadie conectado.';

  return createEmbed({
    title: 'Estado de Minecraft',
    description: status.motd ? `**MOTD:** ${status.motd.slice(0, 300)}` : undefined,
    fields: [
      { name: 'Servidor', value: `${status.host}:${status.port}`, inline: true },
      { name: 'Estado', value: '🟢 Online', inline: true },
      {
        name: 'Latencia',
        value: status.latencyMs !== null ? `${status.latencyMs} ms` : 'N/D',
        inline: true,
      },
      { name: 'Versión', value: status.version || 'Desconocida', inline: true },
      {
        name: 'Software',
        value: softwareLabel(status.software as MinecraftSoftware),
        inline: true,
      },
      { name: 'Jugadores', value: `${status.playersOnline}/${status.playersMax}`, inline: true },
      { name: 'Nombres', value: players.slice(0, 1024) },
    ],
  });
}

function playersEmbed(status: MinecraftStatus | null): EmbedBuilder {
  const partial = status ? status.playerNames.length < status.playersOnline : false;
  return createEmbed({
    title: 'Jugadores conectados',
    description: status
      ? status.playerNames.length > 0
        ? `${status.playerNames
            .map((name) => `• ${name}`)
            .join('\n')
            .slice(
              0,
              3900,
            )}${partial ? '\n\n_El ping público solo muestra una parte de los jugadores._' : ''}`
        : status.playersOnline > 0
          ? 'Hay jugadores conectados, pero sus nombres no están disponibles desde el ping público.'
          : 'No hay jugadores conectados.'
      : 'No se pudo consultar el servidor.',
    fields: status
      ? [{ name: 'Conteo', value: `${status.playersOnline}/${status.playersMax}`, inline: true }]
      : [],
  });
}

/** Always queries the operator-configured endpoint; never a user-supplied host. */
async function fetchStatus(client: PanClient, guildId: string): Promise<MinecraftStatus | null> {
  const connection = getMinecraftConnection(client, guildId);
  return queryMinecraftStatus({
    host: connection.host,
    port: connection.queryPort,
    timeoutMs: env.MINECRAFT_STATUS_TIMEOUT_MS,
  });
}

function panelComponents(
  kind: MinecraftPanelKind,
  panelId: number,
): ActionRowBuilder<MessageActionRowComponentBuilder>[] {
  const row1 = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${MC_BUTTON_PREFIX}:refresh:${panelId}`)
      .setLabel('Actualizar')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`${MC_BUTTON_PREFIX}:status:${panelId}`)
      .setLabel('Estado')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${MC_BUTTON_PREFIX}:players:${panelId}`)
      .setLabel('Jugadores')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${MC_BUTTON_PREFIX}:maintenance:${panelId}`)
      .setLabel('Mantenimiento')
      .setStyle(ButtonStyle.Secondary),
  );

  const select = new StringSelectMenuBuilder()
    .setCustomId(`${MC_SELECT_PREFIX}:${panelId}`)
    .setPlaceholder('Selecciona una sección')
    .addOptions(
      {
        label: 'Resumen',
        value: 'overview',
        description: 'Estado, integración y configuración',
        default: kind === 'overview',
      },
      {
        label: 'Estado',
        value: 'status',
        description: 'Online/offline, versión, latencia',
        default: kind === 'status',
      },
      {
        label: 'Jugadores',
        value: 'players',
        description: 'Conteo y nombres visibles',
        default: kind === 'players',
      },
      {
        label: 'Admin jugadores',
        value: 'players-admin',
        description: 'Acciones moderadas',
        default: kind === 'players-admin',
      },
      {
        label: 'Admin servidor',
        value: 'server-admin',
        description: 'Acciones de servidor',
        default: kind === 'server-admin',
      },
      {
        label: 'Mantenimiento',
        value: 'maintenance',
        description: 'Estado y controles',
        default: kind === 'maintenance',
      },
    );

  const row2 = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(select);
  return [row1, row2];
}

async function buildPanelEmbeds(
  client: PanClient,
  guildId: string,
  kind: MinecraftPanelKind,
): Promise<EmbedBuilder[]> {
  const connection = getMinecraftConnection(client, guildId);
  const settings = connection.settings;
  const status = await fetchStatus(client, guildId);
  const base = statusEmbed(status, connection);

  if (kind === 'status') return [base];
  if (kind === 'players') return [playersEmbed(status)];
  if (kind === 'maintenance') {
    return [
      infoEmbed(
        'Mantenimiento de Minecraft',
        [
          `Estado: **${settings.maintenanceEnabled ? 'ACTIVO' : 'INACTIVO'}**`,
          `Whitelist en mantenimiento: **${settings.maintenanceWhitelist ? 'sí' : 'no'}**`,
          `Mensaje: ${settings.maintenanceMessage}`,
          'Usa `/mcadmin maintenance` para cambiarlo. La activación/desactivación peligrosa pide confirmación.',
        ].join('\n'),
      ),
    ];
  }
  if (kind === 'players-admin' || kind === 'server-admin') {
    return [
      infoEmbed(
        kind === 'players-admin' ? 'Administración de jugadores' : 'Administración del servidor',
        'Usa los comandos `/mc ...` desde Discord. Los botones del panel solo refrescan vistas seguras; las acciones sensibles requieren comandos con validación y permisos.',
      ),
      base,
    ];
  }

  const rcon = connection.rconConfigured
    ? 'configurado'
    : connection.rconUnavailableReason === 'guild-not-authorized'
      ? 'no autorizado para este servidor de Discord'
      : 'no configurado';
  return [
    base,
    infoEmbed(
      'Configuración',
      [
        `Integración: **${settings.enabled ? 'activa' : 'inactiva'}**`,
        `RCON: **${rcon}**`,
        `Canal notificaciones: ${settings.notificationChannelId ? `<#${settings.notificationChannelId}>` : 'no configurado'}`,
        `Canal auditoría: ${settings.auditChannelId ? `<#${settings.auditChannelId}>` : 'no configurado'}`,
        `Intervalo monitor: **${settings.notifyIntervalSeconds}s**`,
      ].join('\n'),
    ),
  ];
}

export async function renderMinecraftPanel(
  client: PanClient,
  guildId: string,
  panel: Pick<MinecraftPanel, 'id' | 'kind'>,
): Promise<{
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<MessageActionRowComponentBuilder>[];
}> {
  return {
    embeds: await buildPanelEmbeds(client, guildId, panel.kind),
    components: panelComponents(panel.kind, panel.id),
  };
}

function confirmationPrompt(token: string, title: string, description: string) {
  return {
    ephemeral: true,
    embeds: [warningEmbed(title, description)],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`${MC_BUTTON_PREFIX}:confirm:${token}`)
          .setLabel('Confirmar')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`${MC_BUTTON_PREFIX}:cancel:${token}`)
          .setLabel('Cancelar')
          .setStyle(ButtonStyle.Secondary),
      ),
    ],
  } satisfies MinecraftActionResult;
}

/** Runs an already validated command over RCON, audits it and reports to the audit channel. */
async function performRconCommand(
  client: PanClient,
  member: GuildMember,
  built: BuiltCommand,
  options: { ephemeral?: boolean } = {},
): Promise<MinecraftActionResult> {
  const guildId = member.guild.id;
  let output: string;
  try {
    output = await runRconCommand(client, guildId, built.command);
  } catch (error) {
    const message = redactSecrets(error instanceof Error ? error.message : error);
    audit(client, {
      guildId,
      adminId: member.id,
      action: built.action,
      targetPlayer: built.targetPlayer ?? null,
      command: built.command,
      result: 'failure',
      error: message,
    });
    await sendAuditToChannel(
      client,
      guildId,
      auditEmbed({
        action: built.action,
        adminId: member.id,
        result: 'failure',
        targetPlayer: built.targetPlayer,
        command: built.command,
      }),
    );
    logger.warn({ error: message, action: built.action, guildId }, 'Acción de Minecraft falló');
    return { ephemeral: true, embeds: [errorEmbed(`No se pudo completar la acción: ${message}`)] };
  }

  const suspiciousOutput = /unknown command|not found|no such command/i.test(output);
  const result = suspiciousOutput ? 'failure' : 'success';
  audit(client, {
    guildId,
    adminId: member.id,
    action: built.action,
    targetPlayer: built.targetPlayer ?? null,
    command: built.command,
    result,
    error: suspiciousOutput ? 'El servidor reportó comando desconocido/no disponible' : null,
  });
  await sendAuditToChannel(
    client,
    guildId,
    auditEmbed({
      action: built.action,
      adminId: member.id,
      result,
      targetPlayer: built.targetPlayer,
      command: built.command,
    }),
  );

  const safeOutput = redactSecrets(output).slice(0, 3500) || 'Sin salida';
  const pluginNote =
    built.plugin && suspiciousOutput
      ? `\n\n⚠️ Esta acción puede requerir plugin: **${built.plugin}**.`
      : '';
  return {
    ephemeral: options.ephemeral ?? true,
    embeds: [
      suspiciousOutput
        ? warningEmbed(
            'Comando no disponible',
            `El servidor respondió:\n\`\`\`\n${safeOutput}\n\`\`\`${pluginNote}`,
          )
        : successEmbed(
            'Acción ejecutada',
            `Comando: \`${redactSecrets(built.command)}\`\nSalida:\n\`\`\`\n${safeOutput}\n\`\`\`${built.plugin ? `\n\nDependencia: ${built.plugin}` : ''}`,
          ),
    ],
  };
}

function validateConsoleFor(client: PanClient, member: GuildMember, raw: string) {
  const settings = repo(client).getSettings(member.guild.id);
  return validateConsoleInput(raw, {
    custom: repo(client).listAllowedCommands(member.guild.id),
    unrestricted: settings.unrestrictedConsole,
    isOwner: isMinecraftOwner(member),
  });
}

export async function executeMinecraftAction(
  client: PanClient,
  interaction: MinecraftInteraction,
  action: MinecraftAction,
  options: MinecraftActionOptions = {},
): Promise<MinecraftActionResult> {
  const { guild, member } = ensureGuild(interaction);
  const guildId = guild.id;

  const denied = checkMinecraftAccess(client, member, action, {
    requireEnabled: action !== 'setup',
    target: options.player ?? null,
    command: options.command ?? null,
  });
  if (denied) return denied;

  const settings = repo(client).getSettings(guildId);

  try {
    if (action === 'status' || action === 'info' || action === 'version') {
      const status = await fetchStatus(client, guildId);
      audit(client, { guildId, adminId: member.id, action, result: 'success' });
      return {
        embeds: [statusEmbed(status, getMinecraftConnection(client, guildId))],
        ephemeral: options.ephemeral,
      };
    }

    if (action === 'players') {
      const status = await fetchStatus(client, guildId);
      audit(client, { guildId, adminId: member.id, action, result: 'success' });
      return { embeds: [playersEmbed(status)], ephemeral: options.ephemeral };
    }

    if (action === 'maintenance-status') {
      audit(client, { guildId, adminId: member.id, action, result: 'success' });
      return {
        embeds: [
          infoEmbed(
            'Mantenimiento',
            `Estado: **${settings.maintenanceEnabled ? 'ACTIVO' : 'INACTIVO'}**\nMensaje: ${settings.maintenanceMessage}\nWhitelist: **${settings.maintenanceWhitelist ? 'sí' : 'no'}**`,
          ),
        ],
        ephemeral: options.ephemeral,
      };
    }

    if (action === 'integrations') {
      const connection = getMinecraftConnection(client, guildId);
      const status = await fetchStatus(client, guildId);
      let plugins = detectPlugins('');
      if (connection.rconConfigured) {
        const list = await runRconCommand(client, guildId, 'plugins').catch(() => '');
        plugins = detectPlugins(list);
      }
      audit(client, { guildId, adminId: member.id, action, result: 'success' });
      return {
        ephemeral: true,
        embeds: [
          infoEmbed(
            'Integraciones de Minecraft',
            [
              `Software detectado: **${status ? softwareLabel(status.software as MinecraftSoftware) : 'desconocido (sin respuesta)'}**`,
              `RCON: **${connection.rconConfigured ? 'configurado' : 'no disponible'}**`,
              `LuckPerms: **${plugins.luckPerms ? 'detectado' : 'no detectado'}**`,
              `EssentialsX: **${plugins.essentialsX ? 'detectado' : 'no detectado'}**`,
              `PlaceholderAPI: **${plugins.placeholderApi ? 'detectado' : 'no detectado'}**`,
              `Vault: **${plugins.vault ? 'detectado (solo informativo, sin economía)' : 'no detectado'}**`,
              'Pan Bot no implementa economía, balances, tiendas, rankings ni recompensas aunque Vault esté presente.',
            ].join('\n'),
          ),
        ],
      };
    }

    if (action === 'audit') {
      const entries = repo(client).listAudit(guildId, 15);
      audit(client, { guildId, adminId: member.id, action, result: 'success' });
      return {
        ephemeral: true,
        embeds: [
          infoEmbed(
            'Auditoría de Minecraft',
            entries.length === 0
              ? 'No hay acciones registradas.'
              : entries
                  .map(
                    (entry) =>
                      `#${entry.id} • <t:${Math.floor(Date.parse(`${entry.createdAt.replace(' ', 'T')}Z`) / 1000)}:R> • <@${entry.adminId}> • **${entry.action}** • ${entry.result}${entry.targetPlayer ? ` • ${entry.targetPlayer}` : ''}${entry.error ? ` • ${redactSecrets(entry.error)}` : ''}`,
                  )
                  .join('\n')
                  .slice(0, 4000),
          ),
        ],
      };
    }

    if (ACTIONS_REQUIRING_RCON.has(action)) {
      const connection = getMinecraftConnection(client, guildId);
      if (connection.rconUnavailableReason) return rconMissing(connection.rconUnavailableReason);

      if (action === 'console') {
        const raw = options.command?.trim() ?? '';
        const validation = validateConsoleFor(client, member, raw);
        if (!validation.ok) {
          audit(client, {
            guildId,
            adminId: member.id,
            action,
            command: raw,
            result: 'denied',
            error: validation.error,
          });
          return { ephemeral: true, embeds: [errorEmbed(validation.error)] };
        }
        if (validation.mutating || validation.source === 'unrestricted') {
          const token = createConfirmation({
            guildId,
            userId: member.id,
            action: { kind: 'console', command: validation.command },
          });
          return confirmationPrompt(
            token,
            'Confirmar comando de consola',
            `Vas a ejecutar:\n\`\`\`\n${validation.command}\n\`\`\`\nOrigen: **${validation.source}**. Confirma solo si entiendes el impacto.`,
          );
        }
        return performRconCommand(client, member, {
          action: 'console',
          command: validation.command,
        });
      }

      // Validate first so the confirmation only ever stores a safe target.
      const built = buildMinecraftCommand(action, options);

      if (action === 'ban') {
        const token = createConfirmation({
          guildId,
          userId: member.id,
          action: { kind: 'ban', player: built.targetPlayer ?? '', reason: options.reason ?? null },
        });
        return confirmationPrompt(
          token,
          'Confirmar ban',
          `Vas a banear a **${built.targetPlayer}** del servidor de Minecraft.\nComando: \`${built.command}\``,
        );
      }

      return performRconCommand(client, member, built, { ephemeral: options.ephemeral ?? true });
    }

    return { ephemeral: true, embeds: [errorEmbed('Acción no implementada.')] };
  } catch (error) {
    const message = redactSecrets(error instanceof Error ? error.message : error);
    audit(client, {
      guildId,
      adminId: member.id,
      action,
      targetPlayer: options.player ?? null,
      command: options.command ?? null,
      result: 'failure',
      error: message,
    });
    logger.warn({ error: message, action, guildId }, 'Acción de Minecraft falló');
    return { ephemeral: true, embeds: [errorEmbed(`No se pudo completar la acción: ${message}`)] };
  }
}

export async function sendMinecraftPanel(
  client: PanClient,
  interaction: MinecraftInteraction,
  channelId: string,
  kind: MinecraftPanelKind,
): Promise<MinecraftActionResult> {
  const { guild, member } = ensureGuild(interaction);
  const denied = checkMinecraftAccess(client, member, 'panel-send', { requireEnabled: false });
  if (denied) return denied;

  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) {
    return { ephemeral: true, embeds: [errorEmbed('Selecciona un canal de texto válido.')] };
  }

  const panel = repo(client).createPanel({
    guildId: guild.id,
    channelId,
    kind,
    title: 'Panel de Minecraft',
  });
  const rendered = await renderMinecraftPanel(client, guild.id, panel);
  const message = await channel.send({ embeds: rendered.embeds, components: rendered.components });
  repo(client).setPanelMessage(guild.id, panel.id, message.id);
  repo(client).updateSettings(guild.id, { panelChannelId: channelId });
  audit(client, {
    guildId: guild.id,
    adminId: member.id,
    action: 'panel-send',
    result: 'success',
  });
  return {
    ephemeral: true,
    embeds: [successEmbed('Panel enviado', `Panel #${panel.id} publicado en <#${channelId}>.`)],
  };
}

export function buildMinecraftModal(
  action: 'say' | 'broadcast' | 'console' | 'maintenance',
): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(`${MC_MODAL_PREFIX}:${action}`)
    .setTitle(
      action === 'say'
        ? 'Enviar mensaje al servidor'
        : action === 'broadcast'
          ? 'Broadcast'
          : action === 'console'
            ? 'Comando de consola'
            : 'Mensaje de mantenimiento',
    );

  const input = new TextInputBuilder()
    .setCustomId('value')
    .setLabel(action === 'console' ? 'Comando (sin /)' : 'Mensaje')
    .setStyle(action === 'console' ? TextInputStyle.Short : TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(action === 'console' ? 200 : 300);

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  return modal;
}

export function createMaintenanceConfirmation(input: {
  guildId: string;
  userId: string;
  enabled: boolean;
  whitelist: boolean;
  message: string;
}): { token: string; components: ActionRowBuilder<ButtonBuilder>[]; embed: EmbedBuilder } {
  const token = createConfirmation({
    guildId: input.guildId,
    userId: input.userId,
    action: {
      kind: 'maintenance',
      enabled: input.enabled,
      whitelist: input.whitelist,
      message: input.message,
    },
  });
  const prompt = confirmationPrompt(
    token,
    'Confirmar mantenimiento',
    `Vas a **${input.enabled ? 'activar' : 'desactivar'}** el modo mantenimiento.\nWhitelist: **${input.whitelist ? 'sí' : 'no'}**\nMensaje: ${input.message}`,
  );
  return { token, embed: prompt.embeds[0]!, components: prompt.components };
}

/** The permission-checked action behind each kind of confirmation. */
function confirmationActionName(action: MinecraftConfirmationAction): MinecraftAction {
  switch (action.kind) {
    case 'ban':
      return 'ban';
    case 'console':
      return 'console';
    case 'maintenance':
      return action.enabled ? 'maintenance-enable' : 'maintenance-disable';
  }
}

function confirmationError(status: Exclude<ConfirmationOutcome['status'], 'ok'>): string {
  return status === 'forbidden'
    ? 'Esta confirmación pertenece a otro moderador.'
    : 'La confirmación expiró o ya se usó.';
}

/**
 * Executes a confirmed action. Permissions, guild authorisation, RCON availability
 * and (for console) the allowlist are re-checked now, not when the prompt was made.
 */
export async function applyConfirmedAction(
  client: PanClient,
  interaction: MinecraftInteraction,
  action: MinecraftConfirmationAction | null,
): Promise<MinecraftActionResult> {
  if (!action) return { ephemeral: true, embeds: [errorEmbed(confirmationError('expired'))] };
  const { guild, member } = ensureGuild(interaction);
  const actionName = confirmationActionName(action);

  const denied = checkMinecraftAccess(client, member, actionName, {
    requireEnabled: action.kind !== 'maintenance',
    target: action.kind === 'ban' ? action.player : null,
    command: action.kind === 'console' ? action.command : null,
  });
  if (denied) return denied;

  try {
    if (action.kind === 'console' || action.kind === 'ban') {
      const connection = getMinecraftConnection(client, guild.id);
      if (connection.rconUnavailableReason) return rconMissing(connection.rconUnavailableReason);
    }

    if (action.kind === 'console') {
      const validation = validateConsoleFor(client, member, action.command);
      if (!validation.ok || validation.command !== action.command) {
        const error = validation.ok ? 'El comando cambió tras la confirmación.' : validation.error;
        audit(client, {
          guildId: guild.id,
          adminId: member.id,
          action: 'console',
          command: action.command,
          result: 'denied',
          error,
        });
        return { ephemeral: true, embeds: [errorEmbed(error)] };
      }
      return performRconCommand(client, member, { action: 'console', command: action.command });
    }

    if (action.kind === 'ban') {
      const built = buildMinecraftCommand('ban', {
        player: action.player,
        reason: action.reason ?? undefined,
      });
      return performRconCommand(client, member, built);
    }

    const before = repo(client).getSettings(guild.id);
    repo(client).updateSettings(guild.id, {
      maintenanceEnabled: action.enabled,
      maintenanceWhitelist: action.whitelist,
      maintenanceMessage: action.message,
    });
    const connection = getMinecraftConnection(client, guild.id);
    if (action.enabled && action.whitelist && connection.rconConfigured) {
      await runRconCommand(client, guild.id, 'whitelist on').catch((error: unknown) => {
        logger.warn(
          { error: redactSecrets(error), guildId: guild.id },
          'No se pudo activar whitelist en mantenimiento',
        );
      });
    }
    if (!action.enabled && before.maintenanceWhitelist && connection.rconConfigured) {
      await runRconCommand(client, guild.id, 'whitelist off').catch((error: unknown) => {
        logger.warn(
          { error: redactSecrets(error), guildId: guild.id },
          'No se pudo desactivar whitelist al salir de mantenimiento',
        );
      });
    }
    audit(client, {
      guildId: guild.id,
      adminId: member.id,
      action: actionName,
      result: 'success',
      command: `maintenance whitelist=${action.whitelist}`,
    });
    await sendAuditToChannel(
      client,
      guild.id,
      auditEmbed({ action: actionName, adminId: member.id, result: 'success' }),
    );
    const next = repo(client).getSettings(guild.id);
    return {
      ephemeral: true,
      embeds: [
        successEmbed(
          'Mantenimiento actualizado',
          `Estado: **${next.maintenanceEnabled ? 'ACTIVO' : 'INACTIVO'}**\nWhitelist: **${next.maintenanceWhitelist ? 'sí' : 'no'}**`,
        ),
      ],
    };
  } catch (error) {
    const message = redactSecrets(error instanceof Error ? error.message : error);
    audit(client, {
      guildId: guild.id,
      adminId: member.id,
      action: actionName,
      result: 'failure',
      error: message,
    });
    return { ephemeral: true, embeds: [errorEmbed(`No se pudo completar la acción: ${message}`)] };
  }
}

export async function refreshMinecraftPanelMessage(
  client: PanClient,
  panel: MinecraftPanel,
): Promise<void> {
  const channel = await client.channels.fetch(panel.channelId).catch(() => null);
  if (!isTextChannel(channel) || !panel.messageId) return;
  const message = await channel.messages.fetch(panel.messageId).catch(() => null);
  if (!message) return;
  const rendered = await renderMinecraftPanel(client, panel.guildId, panel);
  await message
    .edit({ embeds: rendered.embeds, components: rendered.components })
    .catch(() => undefined);
}

/** Replies or edits the deferred reply with an action result, never answering twice. */
export async function respondWithResult(
  interaction: MinecraftInteraction,
  result: MinecraftActionResult,
): Promise<void> {
  const payload = { embeds: result.embeds, components: result.components ?? [] };
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(payload);
    return;
  }
  await interaction.reply({
    ...payload,
    ...(result.ephemeral === false ? {} : { flags: MessageFlags.Ephemeral as const }),
  });
}

async function replyEphemeral(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  embeds: EmbedBuilder[],
): Promise<void> {
  if (interaction.deferred || interaction.replied) {
    await interaction.followUp({ embeds, flags: MessageFlags.Ephemeral });
  } else {
    await interaction.reply({ embeds, flags: MessageFlags.Ephemeral });
  }
}

export async function handleMinecraftButton(
  client: PanClient,
  interaction: ButtonInteraction,
): Promise<void> {
  const [, kind, arg] = interaction.customId.split(':');
  if (!interaction.inGuild()) return;

  if (kind === 'confirm' || kind === 'cancel') {
    const token = arg ?? '';
    if (kind === 'cancel') {
      const status = cancelConfirmation(token, interaction.guildId, interaction.user.id);
      if (status === 'forbidden') {
        await replyEphemeral(interaction, [errorEmbed(confirmationError(status))]);
        return;
      }
      await interaction.update({
        embeds: [infoEmbed('Acción cancelada', 'No se ejecutó ningún cambio.')],
        components: [],
      });
      return;
    }

    // Ownership is checked before consuming: others can never invalidate the token.
    const outcome = consumeConfirmation(token, interaction.guildId, interaction.user.id);
    if (outcome.status !== 'ok') {
      await replyEphemeral(interaction, [errorEmbed(confirmationError(outcome.status))]);
      return;
    }
    // Acknowledge within Discord's 3 s window; RCON can take longer.
    await interaction.deferUpdate();
    const result = await applyConfirmedAction(client, interaction, outcome.action);
    // Replacing the prompt removes the buttons, so it cannot be pressed twice.
    await interaction.editReply({ embeds: result.embeds, components: result.components ?? [] });
    return;
  }

  const panelId = Number(arg);
  const panel = repo(client).getPanel(interaction.guildId, panelId);
  if (!panel) {
    await replyEphemeral(interaction, [errorEmbed('Este panel ya no existe.')]);
    return;
  }

  const member = asMember(interaction);
  if (!member) return;
  const action: MinecraftAction =
    kind === 'players' ? 'players' : kind === 'maintenance' ? 'maintenance-status' : 'status';
  const denied = checkMinecraftAccess(client, member, action);
  if (denied) {
    await replyEphemeral(interaction, denied.embeds);
    return;
  }

  const nextKind: MinecraftPanelKind =
    kind === 'players'
      ? 'players'
      : kind === 'maintenance'
        ? 'maintenance'
        : kind === 'status'
          ? 'status'
          : panel.kind;
  await interaction.deferUpdate();
  repo(client).setPanelKind(panel.guildId, panel.id, nextKind);
  const rendered = await renderMinecraftPanel(client, panel.guildId, {
    id: panel.id,
    kind: nextKind,
  });
  await interaction.editReply({ embeds: rendered.embeds, components: rendered.components });
}

function isPanelKind(value: unknown): value is MinecraftPanelKind {
  return typeof value === 'string' && (PANEL_KINDS as readonly string[]).includes(value);
}

export async function handleMinecraftSelect(
  client: PanClient,
  interaction: StringSelectMenuInteraction,
): Promise<void> {
  if (!interaction.inGuild()) return;
  const panelId = Number(interaction.customId.split(':')[1]);
  const panel = repo(client).getPanel(interaction.guildId, panelId);
  if (!panel) {
    await replyEphemeral(interaction, [errorEmbed('Este panel ya no existe.')]);
    return;
  }
  const kind = interaction.values[0];
  if (!isPanelKind(kind)) {
    await replyEphemeral(interaction, [errorEmbed('Sección desconocida.')]);
    return;
  }
  const member = asMember(interaction);
  if (!member) return;
  const required: MinecraftAction = kind.includes('admin')
    ? 'integrations'
    : kind === 'maintenance'
      ? 'maintenance-status'
      : 'status';
  const denied = checkMinecraftAccess(client, member, required);
  if (denied) {
    await replyEphemeral(interaction, denied.embeds);
    return;
  }
  await interaction.deferUpdate();
  repo(client).setPanelKind(panel.guildId, panel.id, kind);
  const rendered = await renderMinecraftPanel(client, panel.guildId, { id: panel.id, kind });
  await interaction.editReply({ embeds: rendered.embeds, components: rendered.components });
}

export async function handleMinecraftModal(
  client: PanClient,
  interaction: ModalSubmitInteraction,
): Promise<void> {
  if (!interaction.inGuild()) return;
  const action = interaction.customId.split(':')[1];
  const value = interaction.fields.getTextInputValue('value');
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const result =
    action === 'console'
      ? await executeMinecraftAction(client, interaction, 'console', {
          command: value,
          ephemeral: true,
        })
      : action === 'say' || action === 'broadcast'
        ? await executeMinecraftAction(client, interaction, action, {
            message: value,
            ephemeral: true,
          })
        : {
            ephemeral: true,
            embeds: [errorEmbed('Usa /mcadmin maintenance para cambios de mantenimiento.')],
          };
  await respondWithResult(interaction, result);
}
