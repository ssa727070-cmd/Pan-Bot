import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  DiscordAPIError,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Guild,
  type GuildMember,
  type Message,
  type ModalSubmitInteraction,
  type User,
} from 'discord.js';
import type { PanClient } from '../core/client.js';
import { logger } from '../core/logger.js';
import { GuildSettingsRepository } from '../database/repositories/guildSettings.js';
import {
  TicketRepository,
  type Ticket,
  type TicketStatus,
} from '../database/repositories/ticketRepository.js';
import {
  hasTranscriptDestination,
  logEmbed,
  sendLogEvent,
  sendTicketTranscript,
} from '../logging/logService.js';
import { createEmbed, errorEmbed, successEmbed } from '../utils/embeds.js';
import {
  TICKET_ACCEPT,
  TICKET_CLAIM,
  TICKET_CLOSE,
  TICKET_CREATE,
  TICKET_TOPIC_INPUT,
  TICKET_TOPIC_MODAL,
} from './constants.js';
import { formatTranscript, neutralizeMentions, ticketChannelName } from './format.js';
import {
  canCloseTicket,
  canManageParticipants,
  canOpenTicket,
  isTicketStaff,
  type TicketActor,
  type TicketPolicy,
} from './permissions.js';

const EPHEMERAL = MessageFlags.Ephemeral;
const TRANSCRIPT_MAX_MESSAGES = 1000;
const TRANSCRIPT_MAX_CHARS = 1_500_000;

export type TicketInteraction =
  ButtonInteraction | ModalSubmitInteraction | ChatInputCommandInteraction;

export function ticketPanelEmbed() {
  return createEmbed({
    title: '🎫 Panel de tickets',
    description:
      '¿Necesitas ayuda? Pulsa el botón de abajo para abrir un ticket privado con el equipo de soporte.\n' +
      'Cuando termines, usa el botón **Cerrar ticket**.',
    footer: 'PAN BOT · Soporte',
  });
}

export function ticketPanelComponents(): ActionRowBuilder<ButtonBuilder> {
  const button = new ButtonBuilder()
    .setCustomId(TICKET_CREATE)
    .setLabel('Crear ticket')
    .setStyle(ButtonStyle.Primary)
    .setEmoji('🎫');

  return new ActionRowBuilder<ButtonBuilder>().addComponents(button);
}

/** Buttons inside a ticket. Their IDs are static, so they keep working after a restart. */
export function ticketControls(status: TicketStatus = 'open'): ActionRowBuilder<ButtonBuilder> {
  const accept = new ButtonBuilder()
    .setCustomId(TICKET_ACCEPT)
    .setLabel('Aceptar ticket')
    .setStyle(ButtonStyle.Primary)
    .setEmoji('✅')
    .setDisabled(status !== 'open');
  const claim = new ButtonBuilder()
    .setCustomId(TICKET_CLAIM)
    .setLabel('Reclamar ticket')
    .setStyle(ButtonStyle.Success)
    .setEmoji('🙋')
    .setDisabled(status === 'claimed' || status === 'closing' || status === 'closed');
  const close = new ButtonBuilder()
    .setCustomId(TICKET_CLOSE)
    .setLabel('Cerrar ticket')
    .setStyle(ButtonStyle.Danger)
    .setEmoji('🔒')
    .setDisabled(status === 'closing' || status === 'closed');

  return new ActionRowBuilder<ButtonBuilder>().addComponents(accept, claim, close);
}

export function createTopicModal(): ModalBuilder {
  const input = new TextInputBuilder()
    .setCustomId(TICKET_TOPIC_INPUT)
    .setLabel('¿En qué podemos ayudarte?')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Describe brevemente tu consulta')
    .setMinLength(5)
    .setMaxLength(1000)
    .setRequired(true);

  return new ModalBuilder()
    .setCustomId(TICKET_TOPIC_MODAL)
    .setTitle('Nuevo ticket')
    .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
}

// ───────────────────────────── helpers ─────────────────────────────

export function actorOf(member: GuildMember): TicketActor {
  return {
    id: member.id,
    roleIds: new Set(member.roles.cache.keys()),
    isAdministrator: member.permissions.has(PermissionFlagsBits.Administrator),
  };
}

export function policyFor(repository: TicketRepository, guildId: string): TicketPolicy {
  const settings = repository.getSettings(guildId);
  return {
    supportRoleIds: repository.listRoles(guildId, 'support'),
    excludedRoleIds: repository.listRoles(guildId, 'excluded'),
    closerRoleIds: repository.listRoles(guildId, 'closer'),
    creatorCanClose: settings.creatorCanClose,
  };
}

/** Kept for callers that only know a single support role (pre-1.2.0 API). */
export function isSupport(member: GuildMember, supportRoleId: string | null): boolean {
  return isTicketStaff(actorOf(member), {
    supportRoleIds: supportRoleId ? [supportRoleId] : [],
    excludedRoleIds: [],
    closerRoleIds: [],
    creatorCanClose: true,
  });
}

async function deny(interaction: TicketInteraction, description: string): Promise<void> {
  const payload = { embeds: [errorEmbed(description)], flags: EPHEMERAL } as const;
  if (interaction.deferred || interaction.replied) {
    await interaction.followUp(payload);
  } else {
    await interaction.reply(payload);
  }
}

async function logTicket(
  client: PanClient,
  guildId: string,
  title: string,
  fields: Array<{ name: string; value: string }>,
) {
  await sendLogEvent(client, guildId, 'ticket', logEmbed(title, fields));
}

function isMissingChannel(error: unknown): boolean {
  return error instanceof DiscordAPIError && error.code === 10003;
}

interface TicketContext {
  guild: Guild;
  member: GuildMember;
  repository: TicketRepository;
  policy: TicketPolicy;
  actor: TicketActor;
  ticket: Ticket;
}

/**
 * Resolves the ticket for the interaction's channel and verifies it belongs to this
 * guild. Replies with a clear error and returns null when the action cannot proceed.
 */
async function loadTicketContext(
  client: PanClient,
  interaction: TicketInteraction,
  options: { allowClosing?: boolean } = {},
): Promise<TicketContext | null> {
  if (!interaction.guild || !interaction.channel) return null;
  const guild = interaction.guild;
  const repository = new TicketRepository(client.db.sqlite);
  const ticket = repository.getByChannel(interaction.channel.id);

  if (!ticket || ticket.guildId !== guild.id) {
    await deny(interaction, 'Este canal no es un ticket de este servidor.');
    return null;
  }
  if (ticket.status === 'closed' || (ticket.status === 'closing' && !options.allowClosing)) {
    await deny(
      interaction,
      ticket.status === 'closing'
        ? 'Este ticket se está cerrando.'
        : 'Este ticket ya está cerrado.',
    );
    return null;
  }

  let member: GuildMember;
  try {
    member = await guild.members.fetch(interaction.user.id);
  } catch {
    await deny(interaction, 'No he podido comprobar tus permisos en este servidor.');
    return null;
  }

  return {
    guild,
    member,
    repository,
    policy: policyFor(repository, guild.id),
    actor: actorOf(member),
    ticket,
  };
}

/** Users currently opening a ticket, to stop double clicks from creating two channels. */
const opening = new Set<string>();

/** Closes DB records of tickets whose channel was deleted by hand so they stop blocking users. */
async function pruneMissingTickets(
  repository: TicketRepository,
  guild: Guild,
  tickets: Ticket[],
): Promise<Ticket[]> {
  const alive: Ticket[] = [];
  for (const ticket of tickets) {
    try {
      await guild.channels.fetch(ticket.channelId);
      alive.push(ticket);
    } catch (error) {
      if (isMissingChannel(error)) {
        repository.forceClose(ticket.channelId, 'Canal eliminado manualmente.');
        repository.recordEvent({
          guildId: guild.id,
          ticketId: ticket.id,
          type: 'orphaned',
          detail: 'El canal ya no existe',
        });
      } else {
        alive.push(ticket);
      }
    }
  }
  return alive;
}

// ───────────────────────────── open ─────────────────────────────

/** Creates the private channel and the persistent ticket record. */
export async function openTicket(
  client: PanClient,
  interaction: ModalSubmitInteraction,
  topic: string,
): Promise<void> {
  if (!interaction.guild || !interaction.channel) return;
  const guild = interaction.guild;
  const repository = new TicketRepository(client.db.sqlite);
  const settings = repository.getSettings(guild.id);

  if (!settings.enabled) {
    await deny(interaction, 'El sistema de tickets está desactivado en este servidor.');
    return;
  }
  const policy = policyFor(repository, guild.id);
  if (policy.supportRoleIds.length === 0) {
    await deny(
      interaction,
      'El servidor aún no tiene configurado un rol de soporte. Un administrador debe usar `/ticket roles`.',
    );
    return;
  }

  let member: GuildMember;
  try {
    member = await guild.members.fetch(interaction.user.id);
  } catch {
    await deny(interaction, 'No he podido comprobar tus permisos en este servidor.');
    return;
  }
  if (!canOpenTicket(actorOf(member), policy)) {
    await deny(interaction, 'No tienes permiso para abrir tickets en este servidor.');
    return;
  }

  const me = guild.members.me;
  if (!me?.permissions.has([PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles])) {
    await deny(
      interaction,
      'No tengo los permisos **Gestionar canales** y **Gestionar roles**. Avisa a un administrador.',
    );
    return;
  }

  const lockKey = `${guild.id}:${member.id}`;
  if (opening.has(lockKey)) {
    await deny(interaction, 'Ya se está creando tu ticket. Espera un momento.');
    return;
  }
  opening.add(lockKey);

  try {
    const limit = settings.allowMultiple ? settings.maxOpenPerUser : 1;
    const existing = await pruneMissingTickets(
      repository,
      guild,
      repository.openByCreator(guild.id, member.id),
    );
    if (existing.length >= limit) {
      await deny(
        interaction,
        limit === 1
          ? `Ya tienes un ticket abierto en <#${existing[0]!.channelId}>.`
          : `Has alcanzado el máximo de ${limit} tickets abiertos.`,
      );
      return;
    }

    const excluded = new Set(policy.excludedRoleIds);
    // A role that is both support and excluded must not gain channel visibility.
    const staffRoles = policy.supportRoleIds.filter((roleId) => !excluded.has(roleId));
    if (staffRoles.length === 0) {
      await deny(interaction, 'Los roles de soporte configurados no están disponibles.');
      return;
    }

    const category =
      settings.categoryId &&
      guild.channels.cache.get(settings.categoryId)?.type === ChannelType.GuildCategory
        ? settings.categoryId
        : undefined;
    if (settings.categoryId && !category) {
      logger.warn({ guildId: guild.id }, 'La categoría de tickets configurada ya no existe');
    }

    const ticketNumber = new GuildSettingsRepository(client.db.sqlite).nextTicketNumber(guild.id);
    const name = ticketChannelName(ticketNumber, member.user.username);
    const staffAllow = [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.AttachFiles,
      PermissionFlagsBits.ManageMessages,
    ];

    const channel = await guild.channels.create({
      name,
      type: ChannelType.GuildText,
      parent: category,
      topic: `Ticket #${ticketNumber} — ${member.user.username}`,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        {
          id: client.user!.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.ManageMessages,
            PermissionFlagsBits.EmbedLinks,
            PermissionFlagsBits.AttachFiles,
          ],
        },
        {
          id: member.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles,
          ],
        },
        ...staffRoles.map((id) => ({ id, allow: staffAllow })),
      ],
    });

    let ticket: Ticket;
    try {
      ticket = repository.create(guild.id, channel.id, member.id, topic, ticketNumber);
      repository.addParticipant(ticket.id, member.id);
      repository.recordEvent({
        guildId: guild.id,
        ticketId: ticket.id,
        type: 'opened',
        actorId: member.id,
        detail: topic.slice(0, 200),
      });
    } catch (error) {
      // Never leave a channel that the database does not know about.
      await channel.delete('No se pudo registrar el ticket').catch(() => undefined);
      throw error;
    }

    await channel
      .send({
        content: `${member} ${staffRoles.map((id) => `<@&${id}>`).join(' ')}`,
        allowedMentions: { users: [member.id], roles: staffRoles },
        embeds: [
          createEmbed({
            title: `🎫 Ticket #${ticketNumber}`,
            description: `**Motivo:** ${neutralizeMentions(topic)}\n\nEl equipo de soporte atenderá tu consulta.`,
            footer: 'PAN BOT · Soporte',
          }),
        ],
        components: [ticketControls('open')],
      })
      .catch((error: unknown) =>
        logger.warn(
          { error, guildId: guild.id },
          'No se pudo enviar el mensaje inicial del ticket',
        ),
      );

    await interaction.reply({
      embeds: [successEmbed('Ticket creado', `Tu ticket está listo: <#${channel.id}>`)],
      flags: EPHEMERAL,
    });

    await logTicket(client, guild.id, 'Ticket creado', [
      { name: 'Ticket', value: `#${ticketNumber}` },
      { name: 'Usuario', value: `<@${member.id}>` },
      { name: 'Canal', value: `<#${channel.id}>` },
      { name: 'Motivo', value: neutralizeMentions(topic).slice(0, 900) },
    ]);
  } catch (error) {
    logger.error({ error, guildId: guild.id }, 'No se pudo crear el ticket');
    if (!interaction.replied) {
      await deny(
        interaction,
        'No se pudo crear el canal del ticket. Revisa mis permisos e inténtalo de nuevo.',
      );
    }
  } finally {
    opening.delete(lockKey);
  }
}

// ───────────────────────────── accept / claim ─────────────────────────────

async function refreshControls(interaction: TicketInteraction, status: TicketStatus) {
  if (!interaction.isButton()) return;
  await interaction.message.edit({ components: [ticketControls(status)] }).catch(() => undefined);
}

export async function acceptTicket(
  client: PanClient,
  interaction: TicketInteraction,
): Promise<void> {
  const context = await loadTicketContext(client, interaction);
  if (!context) return;
  const { member, repository, policy, actor, ticket, guild } = context;

  if (!isTicketStaff(actor, policy)) {
    await deny(interaction, 'Solo el equipo de soporte puede aceptar tickets.');
    return;
  }
  if (!repository.accept(ticket.channelId, member.id)) {
    await deny(interaction, 'Este ticket ya fue aceptado o reclamado.');
    return;
  }
  repository.recordEvent({
    guildId: guild.id,
    ticketId: ticket.id,
    type: 'accepted',
    actorId: member.id,
  });

  await refreshControls(interaction, 'accepted');
  await interaction.reply({
    embeds: [successEmbed('Ticket aceptado', `${member} está atendiendo este ticket.`)],
    allowedMentions: { parse: [] },
  });
  await logTicket(client, guild.id, 'Ticket aceptado', [
    { name: 'Canal', value: `<#${ticket.channelId}>` },
    { name: 'Soporte', value: `<@${member.id}>` },
  ]);
}

export async function claimTicket(
  client: PanClient,
  interaction: TicketInteraction,
): Promise<void> {
  const context = await loadTicketContext(client, interaction);
  if (!context) return;
  const { member, repository, policy, actor, ticket, guild } = context;

  if (!isTicketStaff(actor, policy)) {
    await deny(interaction, 'Solo el equipo de soporte puede reclamar tickets.');
    return;
  }
  if (!repository.claim(ticket.channelId, member.id)) {
    await deny(interaction, 'Este ticket ya ha sido reclamado.');
    return;
  }
  repository.recordEvent({
    guildId: guild.id,
    ticketId: ticket.id,
    type: 'claimed',
    actorId: member.id,
  });

  await refreshControls(interaction, 'claimed');
  await interaction.reply({
    embeds: [successEmbed('Ticket reclamado', `${member} se encargará de este ticket.`)],
    allowedMentions: { parse: [] },
  });
  await logTicket(client, guild.id, 'Ticket reclamado', [
    { name: 'Canal', value: `<#${ticket.channelId}>` },
    { name: 'Soporte', value: `<@${member.id}>` },
  ]);
}

// ───────────────────────────── close ─────────────────────────────

async function collectTranscript(
  client: PanClient,
  guild: Guild,
  ticket: Ticket,
  repository: TicketRepository,
): Promise<string> {
  const header = [
    `Ticket: #${ticket.ticketNumber ?? ticket.id} (ID ${ticket.id})`,
    `Creador: ${ticket.creatorId}`,
    `Motivo: ${ticket.topic ? neutralizeMentions(ticket.topic) : '(sin motivo)'}`,
    `Abierto: ${ticket.createdAt} UTC`,
  ];
  const events = repository
    .listEvents(ticket.id)
    .map(
      (event) =>
        `  ${event.createdAt} · ${event.type}${event.actorId ? ` · ${event.actorId}` : ''}`,
    );
  if (events.length) header.push('Eventos:', ...events);

  try {
    const channel = await client.channels.fetch(ticket.channelId);
    if (!channel?.isTextBased()) throw new Error('not text based');

    const collected: Message[] = [];
    let before: string | undefined;
    while (collected.length < TRANSCRIPT_MAX_MESSAGES) {
      const page = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
      if (page.size === 0) break;
      collected.push(...page.values());
      before = page.last()?.id;
      if (page.size < 100) break;
    }

    const text = formatTranscript(
      collected
        .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
        .map((message) => ({
          createdAt: message.createdAt,
          author: message.author.tag,
          content: message.content,
          attachments: message.attachments.map((attachment) => attachment.url),
          embeds: message.embeds
            .map((embed) => [embed.title, embed.description].filter(Boolean).join(' — '))
            .filter((value) => value.length > 0),
        })),
      guild.name,
      header,
    );
    return text.length > TRANSCRIPT_MAX_CHARS
      ? `${text.slice(0, TRANSCRIPT_MAX_CHARS)}\n[Transcripción truncada]`
      : text;
  } catch (error) {
    logger.warn({ error, guildId: guild.id, ticket: ticket.id }, 'Transcripción incompleta');
    return formatTranscript([], guild.name, [
      ...header,
      'No se pudo generar el transcripto completo.',
    ]);
  }
}

export interface FinalizeResult {
  archived: boolean;
  deleted: boolean;
}

/**
 * Second half of closing: transcript, archive, database and channel deletion. It is
 * idempotent and also used to resume tickets left in `closing` by a crash.
 */
export async function finalizeTicketClose(
  client: PanClient,
  guild: Guild,
  ticket: Ticket,
): Promise<FinalizeResult> {
  const repository = new TicketRepository(client.db.sqlite);
  const transcript = await collectTranscript(client, guild, ticket, repository);
  repository.finishClose(ticket.channelId, transcript);
  repository.recordEvent({
    guildId: guild.id,
    ticketId: ticket.id,
    type: 'closed',
    actorId: ticket.closedBy,
  });

  const archived = await sendTicketTranscript(
    client,
    guild.id,
    logEmbed('Ticket cerrado', [
      { name: 'Ticket', value: `#${ticket.ticketNumber ?? ticket.id}` },
      { name: 'Creador', value: `<@${ticket.creatorId}>` },
      { name: 'Reclamado por', value: ticket.claimerId ? `<@${ticket.claimerId}>` : '—' },
      { name: 'Cerrado por', value: ticket.closedBy ? `<@${ticket.closedBy}>` : 'Sistema' },
    ]),
    transcript,
    `ticket-${ticket.ticketNumber ?? ticket.id}.txt`,
  );

  // If a destination exists but delivery failed, keep the channel so nothing is lost.
  const keepChannel = !archived && hasTranscriptDestination(client, guild.id);
  if (keepChannel) return { archived, deleted: false };

  try {
    const channel = await client.channels.fetch(ticket.channelId);
    if (channel?.isTextBased()) await channel.delete('Ticket cerrado');
    return { archived, deleted: true };
  } catch (error) {
    if (isMissingChannel(error)) return { archived, deleted: true };
    return { archived, deleted: false };
  }
}

export async function closeTicket(
  client: PanClient,
  interaction: TicketInteraction,
): Promise<void> {
  const context = await loadTicketContext(client, interaction);
  if (!context) return;
  const { member, repository, policy, actor, ticket, guild } = context;

  if (!canCloseTicket(actor, policy, ticket)) {
    await deny(interaction, 'No tienes permiso para cerrar este ticket.');
    return;
  }
  if (!repository.beginClose(ticket.channelId, member.id)) {
    await deny(interaction, 'Este ticket ya se está cerrando.');
    return;
  }

  await interaction.deferReply();
  const closing = repository.getByChannel(ticket.channelId) ?? ticket;
  const result = await finalizeTicketClose(client, guild, closing);

  await interaction
    .editReply({
      embeds: [
        successEmbed(
          'Ticket cerrado',
          result.deleted
            ? 'La transcripción se ha archivado. El canal se ha eliminado.'
            : 'El ticket está cerrado, pero no he podido archivar la transcripción o eliminar el canal. Se conserva el canal; un administrador puede borrarlo.',
        ),
      ],
    })
    .catch(() => undefined);

  await logTicket(client, guild.id, 'Ticket cerrado', [
    { name: 'Canal', value: `#${closing.ticketNumber ?? closing.id}` },
    { name: 'Cerrado por', value: `<@${member.id}>` },
    { name: 'Transcripción archivada', value: result.archived ? 'sí' : 'no' },
  ]);
}

// ───────────────────────────── participants ─────────────────────────────

export async function addTicketUser(
  client: PanClient,
  interaction: TicketInteraction,
  user: User,
): Promise<void> {
  const context = await loadTicketContext(client, interaction);
  if (!context) return;
  const { repository, policy, actor, ticket, guild } = context;

  if (!canManageParticipants(actor, policy, ticket)) {
    await deny(interaction, 'No tienes permiso para gestionar los usuarios de este ticket.');
    return;
  }
  if (user.bot) {
    await deny(interaction, 'No se pueden añadir bots a un ticket.');
    return;
  }

  repository.addParticipant(ticket.id, user.id);
  repository.recordEvent({
    guildId: guild.id,
    ticketId: ticket.id,
    type: 'user_added',
    actorId: interaction.user.id,
    detail: user.id,
  });
  const channel = await client.channels.fetch(ticket.channelId);
  if (channel?.isTextBased() && 'permissionOverwrites' in channel) {
    await channel.permissionOverwrites.edit(user.id, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
    });
  }

  await interaction.reply({
    embeds: [successEmbed('Usuario añadido', `${user} ahora puede ver el ticket.`)],
    allowedMentions: { parse: [] },
  });
  await logTicket(client, guild.id, 'Usuario añadido al ticket', [
    { name: 'Ticket', value: `<#${ticket.channelId}>` },
    { name: 'Usuario', value: `<@${user.id}>` },
  ]);
}

export async function removeTicketUser(
  client: PanClient,
  interaction: TicketInteraction,
  user: User,
): Promise<void> {
  const context = await loadTicketContext(client, interaction);
  if (!context) return;
  const { repository, policy, actor, ticket, guild } = context;

  if (!canManageParticipants(actor, policy, ticket)) {
    await deny(interaction, 'No tienes permiso para gestionar los usuarios de este ticket.');
    return;
  }
  if (user.id === ticket.creatorId) {
    await deny(interaction, 'No puedes eliminar al creador del ticket.');
    return;
  }
  if (!repository.removeParticipant(ticket.id, user.id)) {
    await deny(interaction, 'Ese usuario no estaba en el ticket.');
    return;
  }

  repository.recordEvent({
    guildId: guild.id,
    ticketId: ticket.id,
    type: 'user_removed',
    actorId: interaction.user.id,
    detail: user.id,
  });
  const channel = await client.channels.fetch(ticket.channelId);
  if (channel?.isTextBased() && 'permissionOverwrites' in channel) {
    await channel.permissionOverwrites.edit(user.id, { ViewChannel: false });
  }

  await interaction.reply({
    embeds: [successEmbed('Usuario eliminado', `${user} ya no puede ver el ticket.`)],
    allowedMentions: { parse: [] },
  });
  await logTicket(client, guild.id, 'Usuario eliminado del ticket', [
    { name: 'Ticket', value: `<#${ticket.channelId}>` },
    { name: 'Usuario', value: `<@${user.id}>` },
  ]);
}

// ───────────────────────────── recovery ─────────────────────────────

/**
 * Runs once after login. Tickets whose channel disappeared are closed in the database,
 * and tickets left in `closing` by a crash are finished. Errors in one guild never stop
 * the others. Buttons keep working because their IDs are static and state lives in SQLite.
 */
export async function reconcileTickets(
  client: PanClient,
): Promise<{ closed: number; resumed: number }> {
  const repository = new TicketRepository(client.db.sqlite);
  let closed = 0;
  let resumed = 0;

  for (const ticket of repository.listUnfinished()) {
    try {
      const guild = client.guilds.cache.get(ticket.guildId);
      if (!guild) continue;

      let exists = true;
      try {
        await guild.channels.fetch(ticket.channelId);
      } catch (error) {
        if (!isMissingChannel(error)) continue;
        exists = false;
      }

      if (!exists) {
        if (
          repository.forceClose(
            ticket.channelId,
            'Canal eliminado mientras Pan Bot estaba apagado.',
          )
        ) {
          repository.recordEvent({ guildId: guild.id, ticketId: ticket.id, type: 'orphaned' });
          closed += 1;
        }
        continue;
      }

      if (ticket.status === 'closing') {
        await finalizeTicketClose(client, guild, ticket);
        repository.recordEvent({ guildId: guild.id, ticketId: ticket.id, type: 'recovered' });
        resumed += 1;
      }
    } catch (error) {
      logger.warn(
        { error, ticket: ticket.id, guildId: ticket.guildId },
        'No se pudo reconciliar el ticket',
      );
    }
  }
  return { closed, resumed };
}
