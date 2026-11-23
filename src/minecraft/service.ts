import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  type Guild,
  type GuildMember,
  type MessageActionRowComponentBuilder,
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
import { buildMinecraftCommand } from './commands.js';
import { createConfirmation } from './confirmation.js';
import { getMinecraftConnection, runRconCommand } from './connection.js';
import { detectPlugins, softwareLabel, type MinecraftSoftware } from './integrations.js';
import { actionLevel, canManageMinecraft, isApplicationOwner } from './permissions.js';
import { minecraftRateLimiter } from './rateLimiter.js';
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

export const MC_BUTTON_PREFIX = 'mc';
export const MC_SELECT_PREFIX = 'mc-select';
export const MC_MODAL_PREFIX = 'mc-modal';

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

function actionDenied(action: MinecraftAction, level: MinecraftLevel): MinecraftActionResult {
  return {
    ephemeral: true,
    embeds: [
      errorEmbed(
        `No tienes permiso para esta acción. Nivel requerido: **${level}**. Usa \`/mcadmin roles\` para configurar roles de Minecraft.`,
      ),
    ],
  };
}

// Reserved for future plugin-gated actions.

function rconMissing(): MinecraftActionResult {
  return {
    ephemeral: true,
    embeds: [
      warningEmbed(
        'RCON no configurado',
        'Configura `MINECRAFT_RCON_PASSWORD` en el entorno y asegúrate de que el hosting permita RCON. Las consultas de estado siguen disponibles si el puerto del servidor responde.',
      ),
    ],
  };
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

  const players =
    status.playerNames.length > 0
      ? status.playerNames.slice(0, 20).join(', ')
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
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
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

  const row2 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
  return [row1, row2 as unknown as ActionRowBuilder<MessageActionRowComponentBuilder>];
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
  if (kind === 'players') {
    return [
      createEmbed({
        title: 'Jugadores conectados',
        description: status
          ? status.playerNames.length > 0
            ? status.playerNames
                .map((name) => `• ${name}`)
                .join('\n')
                .slice(0, 4000)
            : status.playersOnline > 0
              ? 'Hay jugadores conectados, pero el servidor no expuso sus nombres en el ping.'
              : 'No hay jugadores conectados.'
          : 'No se pudo consultar el servidor.',
        fields: status
          ? [
              {
                name: 'Conteo',
                value: `${status.playersOnline}/${status.playersMax}`,
                inline: true,
              },
            ]
          : [],
      }),
    ];
  }
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

  return [
    base,
    infoEmbed(
      'Configuración',
      [
        `Integración: **${settings.enabled ? 'activa' : 'inactiva'}**`,
        `RCON: **${connection.rconConfigured ? 'configurado' : 'no configurado'}**`,
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

async function assertManageGuild(interaction: MinecraftInteraction): Promise<void> {
  const { member } = ensureGuild(interaction);
  if (!member.permissions.has(PermissionFlagsBits.ManageGuild)) {
    throw new Error('Necesitas el permiso **Gestionar servidor** para configurar Minecraft.');
  }
}

export async function executeMinecraftAction(
  client: PanClient,
  interaction: MinecraftInteraction,
  action: MinecraftAction,
  options: MinecraftActionOptions = {},
): Promise<MinecraftActionResult> {
  const { guild, member } = ensureGuild(interaction);
  const guildId = guild.id;
  const settings = repo(client).getSettings(guildId);
  const level = actionLevel(action);

  if (action !== 'setup' && !settings.enabled) {
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
      targetPlayer: options.player ?? null,
      command: options.command ?? null,
      result: 'denied',
      error: 'permiso insuficiente',
    });
    return actionDenied(action, level);
  }

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
      return {
        embeds: [
          createEmbed({
            title: 'Jugadores conectados',
            description: status
              ? status.playerNames.length > 0
                ? status.playerNames
                    .map((name) => `• ${name}`)
                    .join('\n')
                    .slice(0, 4000)
                : status.playersOnline > 0
                  ? 'Hay jugadores conectados, pero sus nombres no están disponibles desde el ping público.'
                  : 'No hay jugadores conectados.'
              : 'No se pudo consultar el servidor.',
            fields: status
              ? [
                  {
                    name: 'Conteo',
                    value: `${status.playersOnline}/${status.playersMax}`,
                    inline: true,
                  },
                ]
              : [],
          }),
        ],
        ephemeral: options.ephemeral,
      };
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
      const status = await fetchStatus(client, guildId);
      let plugins = detectPlugins('');
      if (getMinecraftConnection(client, guildId).rconConfigured) {
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
              `RCON: **${getMinecraftConnection(client, guildId).rconConfigured ? 'configurado' : 'no configurado'}**`,
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
                      `#${entry.id} • <t:${Math.floor(Date.parse(entry.createdAt) / 1000)}:R> • <@${entry.adminId}> • **${entry.action}** • ${entry.result}${entry.targetPlayer ? ` • ${entry.targetPlayer}` : ''}${entry.error ? ` • ${redactSecrets(entry.error)}` : ''}`,
                  )
                  .join('\n')
                  .slice(0, 4000),
          ),
        ],
      };
    }

    if (ACTIONS_REQUIRING_RCON.has(action)) {
      const connection = getMinecraftConnection(client, guildId);
      if (!connection.rconConfigured) return rconMissing();

      if (action === 'console') {
        const raw = options.command?.trim() ?? '';
        const validation = validateConsoleInput(raw, {
          custom: repo(client).listAllowedCommands(guildId),
          unrestricted: settings.unrestrictedConsole,
          isOwner: isApplicationOwner(member),
        });
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
          return {
            ephemeral: true,
            embeds: [
              warningEmbed(
                'Confirmar comando de consola',
                `Vas a ejecutar:\n\`\`\`\n${validation.command}\n\`\`\`\nOrigen: **${validation.source}**. Confirma solo si entiendes el impacto.`,
              ),
            ],
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
          };
        }
        const output = await runRconCommand(client, guildId, validation.command);
        audit(client, {
          guildId,
          adminId: member.id,
          action,
          command: validation.command,
          result: 'success',
        });
        return {
          ephemeral: true,
          embeds: [
            successEmbed(
              'Comando ejecutado',
              `Salida:\n\`\`\`\n${redactSecrets(output).slice(0, 3500) || 'Sin salida'}\n\`\`\``,
            ),
          ],
        };
      }

      const built = buildMinecraftCommand(action, options);
      const output = await runRconCommand(client, guildId, built.command);
      const suspiciousOutput = /unknown command|not found|no such command/i.test(output);
      audit(client, {
        guildId,
        adminId: member.id,
        action,
        targetPlayer: built.targetPlayer ?? null,
        command: built.command,
        result: suspiciousOutput ? 'failure' : 'success',
        error: suspiciousOutput ? 'El servidor reportó comando desconocido/no disponible' : null,
      });
      await sendAuditToChannel(
        client,
        guildId,
        infoEmbed(
          'Auditoría Minecraft',
          `Acción: **${action}**\nModerador: <@${member.id}>\nResultado: **${suspiciousOutput ? 'failure' : 'success'}**${built.targetPlayer ? `\nObjetivo: ${built.targetPlayer}` : ''}`,
        ),
      );
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
                `El servidor respondió:\n\`\`\`\n${redactSecrets(output).slice(0, 3500) || 'Sin salida'}\n\`\`\`${pluginNote}`,
              )
            : successEmbed(
                'Acción ejecutada',
                `Comando: \`${built.command}\`\nSalida:\n\`\`\`\n${redactSecrets(output).slice(0, 3500) || 'Sin salida'}\n\`\`\`${built.plugin ? `\n\nDependencia: ${built.plugin}` : ''}`,
              ),
        ],
      };
    }

    return { ephemeral: true, embeds: [errorEmbed('Acción no implementada.')] };
  } catch (error) {
    const message = redactSecrets(error);
    audit(client, {
      guildId,
      adminId: member.id,
      action,
      targetPlayer: options.player ?? null,
      command: options.command ?? null,
      result: 'failure',
      error: message,
    });
    logger.warn({ error, action, guildId }, 'Acción de Minecraft falló');
    return { ephemeral: true, embeds: [errorEmbed(`No se pudo completar la acción: ${message}`)] };
  }
}

export async function sendMinecraftPanel(
  client: PanClient,
  interaction: MinecraftInteraction,
  channelId: string,
  kind: MinecraftPanelKind,
): Promise<MinecraftActionResult> {
  const { guild } = ensureGuild(interaction);
  await assertManageGuild(interaction);
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
    adminId: interaction.user.id,
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

// createMaintenanceConfirmation is the safe public API and is defined below.

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
  return {
    token,
    embed: warningEmbed(
      'Confirmar mantenimiento',
      `Vas a **${input.enabled ? 'activar' : 'desactivar'}** el modo mantenimiento.\nWhitelist: **${input.whitelist ? 'sí' : 'no'}**\nMensaje: ${input.message}`,
    ),
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
  };
}

export async function applyConfirmedAction(
  client: PanClient,
  interaction: MinecraftInteraction,
  action: ReturnType<typeof import('./confirmation.js').consumeConfirmation>,
): Promise<MinecraftActionResult> {
  const { guild, member } = ensureGuild(interaction);
  if (!action) {
    return { ephemeral: true, embeds: [errorEmbed('La confirmación expiró o no te pertenece.')] };
  }

  if (action.kind === 'console') {
    const result = await executeMinecraftAction(client, interaction, 'console', {
      command: action.command,
      ephemeral: true,
    });
    // executeMinecraftAction(console) creates another confirmation for mutating/unrestricted; avoid loop by executing directly if already confirmed.
    if (result.embeds[0]?.data.title?.includes('Confirmar')) {
      const connection = getMinecraftConnection(client, guild.id);
      if (!connection.rconConfigured) return rconMissing();
      const output = await runRconCommand(client, guild.id, action.command).catch((error) => {
        throw error;
      });
      audit(client, {
        guildId: guild.id,
        adminId: member.id,
        action: 'console',
        command: action.command,
        result: 'success',
      });
      return {
        ephemeral: true,
        embeds: [
          successEmbed(
            'Comando ejecutado',
            `\`\`\`\n${redactSecrets(output).slice(0, 3500) || 'Sin salida'}\n\`\`\``,
          ),
        ],
      };
    }
    return result;
  }

  if (action.kind === 'maintenance') {
    const before = repo(client).getSettings(guild.id);
    repo(client).updateSettings(guild.id, {
      maintenanceEnabled: action.enabled,
      maintenanceWhitelist: action.whitelist,
      maintenanceMessage: action.message,
    });
    audit(client, {
      guildId: guild.id,
      adminId: member.id,
      action: action.enabled ? 'maintenance-enable' : 'maintenance-disable',
      result: 'success',
      command: `maintenance whitelist=${action.whitelist}`,
    });
    const next = repo(client).getSettings(guild.id);
    if (
      action.enabled &&
      action.whitelist &&
      getMinecraftConnection(client, guild.id).rconConfigured
    ) {
      await runRconCommand(client, guild.id, 'whitelist on').catch((error) => {
        logger.warn({ error, guildId: guild.id }, 'No se pudo activar whitelist en mantenimiento');
      });
    }
    if (
      !action.enabled &&
      before.maintenanceWhitelist &&
      getMinecraftConnection(client, guild.id).rconConfigured
    ) {
      await runRconCommand(client, guild.id, 'whitelist off').catch((error) => {
        logger.warn(
          { error, guildId: guild.id },
          'No se pudo desactivar whitelist al salir de mantenimiento',
        );
      });
    }
    return {
      ephemeral: true,
      embeds: [
        successEmbed(
          'Mantenimiento actualizado',
          `Estado: **${next.maintenanceEnabled ? 'ACTIVO' : 'INACTIVO'}**\nWhitelist: **${next.maintenanceWhitelist ? 'sí' : 'no'}**`,
        ),
      ],
    };
  }

  return { ephemeral: true, embeds: [errorEmbed('Acción confirmada no soportada.')] };
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

export async function handleMinecraftButton(
  client: PanClient,
  interaction: import('discord.js').ButtonInteraction,
): Promise<void> {
  const [, kind, arg] = interaction.customId.split(':');
  if (!interaction.inGuild()) return;

  if (kind === 'confirm' || kind === 'cancel') {
    const token = arg ?? '';
    if (kind === 'cancel') {
      await interaction.reply({
        embeds: [infoEmbed('Acción cancelada', 'No se ejecutó ningún cambio.')],
        ephemeral: true,
      });
      return;
    }
    const { consumeConfirmation } = await import('./confirmation.js');
    const action = consumeConfirmation(token, interaction.guildId!, interaction.user.id);
    const result = await applyConfirmedAction(client, interaction, action);
    await interaction.reply({
      embeds: result.embeds,
      components: result.components ?? [],
      ephemeral: true,
    });
    return;
  }

  const panelId = Number(arg);
  const panel = repo(client).getPanel(interaction.guildId!, panelId);
  if (!panel) {
    await interaction.reply({ embeds: [errorEmbed('Este panel ya no existe.')], ephemeral: true });
    return;
  }

  const member = interaction.member as GuildMember;
  const action: MinecraftAction =
    kind === 'players' ? 'players' : kind === 'maintenance' ? 'maintenance-status' : 'status';
  if (!canManageMinecraft(client, member, action)) {
    await interaction.reply({
      embeds: actionDenied(action, actionLevel(action)).embeds,
      ephemeral: true,
    });
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
  repo(client).setPanelKind(panel.guildId, panel.id, nextKind);
  const rendered = await renderMinecraftPanel(client, panel.guildId, {
    id: panel.id,
    kind: nextKind,
  });
  await interaction.update({ embeds: rendered.embeds, components: rendered.components });
}

export async function handleMinecraftSelect(
  client: PanClient,
  interaction: import('discord.js').StringSelectMenuInteraction,
): Promise<void> {
  if (!interaction.inGuild()) return;
  const panelId = Number(interaction.customId.split(':')[1]);
  const panel = repo(client).getPanel(interaction.guildId!, panelId);
  if (!panel) {
    await interaction.reply({ embeds: [errorEmbed('Este panel ya no existe.')], ephemeral: true });
    return;
  }
  const kind = (interaction.values[0] as MinecraftPanelKind) ?? 'overview';
  const member = interaction.member as GuildMember;
  const required: MinecraftAction = kind.includes('admin')
    ? 'integrations'
    : kind === 'maintenance'
      ? 'maintenance-status'
      : 'status';
  if (!canManageMinecraft(client, member, required)) {
    await interaction.reply({
      embeds: actionDenied(required, actionLevel(required)).embeds,
      ephemeral: true,
    });
    return;
  }
  repo(client).setPanelKind(panel.guildId, panel.id, kind);
  const rendered = await renderMinecraftPanel(client, panel.guildId, { id: panel.id, kind });
  await interaction.update({ embeds: rendered.embeds, components: rendered.components });
}

export async function handleMinecraftModal(
  client: PanClient,
  interaction: import('discord.js').ModalSubmitInteraction,
): Promise<void> {
  if (!interaction.inGuild()) return;
  const action = interaction.customId.split(':')[1] as
    'say' | 'broadcast' | 'console' | 'maintenance';
  const value = interaction.fields.getTextInputValue('value');
  const result =
    action === 'console'
      ? await executeMinecraftAction(client, interaction, 'console', {
          command: value,
          ephemeral: true,
        })
      : action === 'maintenance'
        ? {
            ephemeral: true,
            embeds: [errorEmbed('Usa /mcadmin maintenance para cambios de mantenimiento.')],
          }
        : await executeMinecraftAction(
            client,
            interaction,
            action === 'say' ? 'say' : 'broadcast',
            {
              message: value,
              ephemeral: true,
            },
          );
  await interaction.reply({
    embeds: result.embeds,
    components: result.components ?? [],
    ephemeral: true,
  });
}

export async function sendMinecraftNotification(
  client: PanClient,
  guildId: string,
  eventKey: string,
  subject: string,
  fingerprint: string,
  embed: EmbedBuilder,
): Promise<boolean> {
  const settings = repo(client).getSettings(guildId);
  if (!settings.notificationChannelId) return false;
  if (repo(client).getNotificationFingerprint(guildId, eventKey, subject) === fingerprint)
    return false;
  if (!minecraftRateLimiter.tryAcquire(`mc-notify:${guildId}:${eventKey}`, 15_000)) return false;
  const channel = await client.channels.fetch(settings.notificationChannelId).catch(() => null);
  if (!isTextChannel(channel)) return false;
  await channel.send({ embeds: [embed] }).catch(() => undefined);
  repo(client).markNotification(guildId, eventKey, subject, fingerprint);
  return true;
}
