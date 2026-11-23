import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type GuildMember,
  type ModalSubmitInteraction,
  type TextBasedChannel,
  type User,
} from 'discord.js';
import type { PanClient } from '../core/client.js';
import { GuildSettingsRepository } from '../database/repositories/guildSettings.js';
import { TicketRepository, type Ticket } from '../database/repositories/ticketRepository.js';
import { logEmbed, sendLogEvent, sendTicketTranscript } from '../logging/logService.js';
import { createEmbed, errorEmbed, successEmbed } from '../utils/embeds.js';
import {
  TICKET_CLAIM,
  TICKET_CLOSE,
  TICKET_CREATE,
  TICKET_TOPIC_INPUT,
  TICKET_TOPIC_MODAL,
} from './constants.js';
import { formatTranscript, ticketChannelName } from './format.js';

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

export function ticketControls(): ActionRowBuilder<ButtonBuilder> {
  const claim = new ButtonBuilder()
    .setCustomId(TICKET_CLAIM)
    .setLabel('Reclamar ticket')
    .setStyle(ButtonStyle.Success)
    .setEmoji('🙋');
  const close = new ButtonBuilder()
    .setCustomId(TICKET_CLOSE)
    .setLabel('Cerrar ticket')
    .setStyle(ButtonStyle.Danger)
    .setEmoji('🔒');

  return new ActionRowBuilder<ButtonBuilder>().addComponents(claim, close);
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

function settingsFor(client: PanClient, guildId: string) {
  return new GuildSettingsRepository(client.db.sqlite).get(guildId);
}

export type TicketInteraction =
  ButtonInteraction | ModalSubmitInteraction | ChatInputCommandInteraction;

export function isSupport(member: GuildMember, supportRoleId: string | null): boolean {
  return Boolean(
    (supportRoleId && member.roles.cache.has(supportRoleId)) ||
    member.permissions.has(PermissionFlagsBits.ManageChannels),
  );
}

function canManage(ticket: Ticket, member: GuildMember, supportRoleId: string | null): boolean {
  return ticket.creatorId === member.id || isSupport(member, supportRoleId);
}

async function logTicket(
  client: PanClient,
  guildId: string,
  title: string,
  fields: Array<{ name: string; value: string }>,
) {
  await sendLogEvent(client, guildId, 'ticket', logEmbed(title, fields));
}

/** Creates the private channel and the persistent ticket record. */
export async function openTicket(
  client: PanClient,
  interaction: ModalSubmitInteraction,
  topic: string,
): Promise<void> {
  if (!interaction.guild || !interaction.channel) return;
  const guild = interaction.guild;
  const member = await guild.members.fetch(interaction.user.id);
  const settings = settingsFor(client, guild.id);

  if (!settings.ticketSupportRoleId) {
    await interaction.reply({
      embeds: [errorEmbed('El servidor aún no tiene configurado un rol de soporte.')],
      ephemeral: true,
    });
    return;
  }

  const tickets = new TicketRepository(client.db.sqlite);
  const existing = tickets.openByCreator(guild.id, member.id);
  if (existing.length > 0) {
    await interaction.reply({
      embeds: [errorEmbed(`Ya tienes un ticket abierto en <#${existing[0]!.channelId}>.`)],
      ephemeral: true,
    });
    return;
  }

  // nextTicketNumber reserves the value atomically.
  const ticketNumber = new GuildSettingsRepository(client.db.sqlite).nextTicketNumber(guild.id);
  const name = ticketChannelName(ticketNumber, member.user.username);
  const supportRoleId = settings.ticketSupportRoleId;

  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: client.user!.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ManageMessages,
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
    {
      id: supportRoleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages,
      ],
    },
  ];

  const parent =
    settings.ticketCategoryId && guild.channels.cache.has(settings.ticketCategoryId)
      ? settings.ticketCategoryId
      : undefined;

  try {
    const channel = await guild.channels.create({
      name,
      type: ChannelType.GuildText,
      parent,
      topic: `Ticket #${ticketNumber} — ${member.user.tag}`,
      permissionOverwrites: overwrites,
    });

    tickets.create(guild.id, channel.id, member.id, topic);
    tickets.addParticipant(tickets.getByChannel(channel.id)!.id, member.id);

    await channel.send({
      content: `${member} <@&${supportRoleId}>`,
      embeds: [
        createEmbed({
          title: `🎫 Ticket #${ticketNumber}`,
          description: `**Motivo:** ${topic}\n\nEl equipo de soporte atenderá tu consulta.`,
          footer: 'PAN BOT · Soporte',
        }),
      ],
      components: [ticketControls()],
    });

    await interaction.reply({
      embeds: [successEmbed('Ticket creado', `Tu ticket está listo: <#${channel.id}>`)],
      ephemeral: true,
    });

    await logTicket(client, guild.id, 'Ticket creado', [
      { name: 'Ticket', value: `#${ticketNumber}` },
      { name: 'Usuario', value: `<@${member.id}>` },
      { name: 'Canal', value: `<#${channel.id}>` },
      { name: 'Motivo', value: topic },
    ]);
  } catch (error) {
    await interaction.reply({
      embeds: [
        errorEmbed(
          'No se pudo crear el canal del ticket. Revisa mis permisos e inténtalo de nuevo.',
        ),
      ],
      ephemeral: true,
    });
    throw error;
  }
}

export async function claimTicket(
  client: PanClient,
  interaction: TicketInteraction,
): Promise<void> {
  if (!interaction.guild || !interaction.channel) return;
  const member = await interaction.guild.members.fetch(interaction.user.id);
  const settings = settingsFor(client, interaction.guild.id);
  const ticket = new TicketRepository(client.db.sqlite).getByChannel(interaction.channel.id);

  if (!ticket || ticket.status === 'closed') {
    await interaction.reply({
      embeds: [errorEmbed('Este ticket no está abierto.')],
      ephemeral: true,
    });
    return;
  }
  if (!isSupport(member, settings.ticketSupportRoleId)) {
    await interaction.reply({
      embeds: [errorEmbed('Solo el equipo de soporte puede reclamar tickets.')],
      ephemeral: true,
    });
    return;
  }

  const claimed = new TicketRepository(client.db.sqlite).claim(interaction.channel.id, member.id);
  if (!claimed) {
    await interaction.reply({
      embeds: [errorEmbed('Este ticket ya ha sido reclamado.')],
      ephemeral: true,
    });
    return;
  }

  await interaction.reply({
    embeds: [successEmbed('Ticket reclamado', `${member} se encargará de este ticket.`)],
  });
  await logTicket(client, interaction.guild.id, 'Ticket reclamado', [
    { name: 'Canal', value: `<#${interaction.channel.id}>` },
    { name: 'Soporte', value: `<@${member.id}>` },
  ]);
}

export async function closeTicket(
  client: PanClient,
  interaction: TicketInteraction,
): Promise<void> {
  if (!interaction.guild || !interaction.channel) return;
  const member = await interaction.guild.members.fetch(interaction.user.id);
  const settings = settingsFor(client, interaction.guild.id);
  const repository = new TicketRepository(client.db.sqlite);
  const ticket = repository.getByChannel(interaction.channel.id);

  if (!ticket || ticket.status === 'closed') {
    await interaction.reply({
      embeds: [errorEmbed('Este ticket ya está cerrado.')],
      ephemeral: true,
    });
    return;
  }
  if (!canManage(ticket, member, settings.ticketSupportRoleId)) {
    await interaction.reply({
      embeds: [errorEmbed('Solo el creador del ticket o el equipo de soporte puede cerrarlo.')],
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply();

  let transcript = '';
  try {
    const channel = (await client.channels.fetch(
      interaction.channel.id,
    )) as TextBasedChannel | null;
    if (channel?.isTextBased()) {
      const messages = await channel.messages.fetch({ limit: 100 });
      transcript = formatTranscript(
        [...messages.values()]
          .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
          .map((message) => ({
            createdAt: message.createdAt,
            author: message.author.tag,
            content: message.content,
            attachments: message.attachments.map((attachment) => attachment.url),
          })),
        interaction.guild.name,
      );
    }
  } catch {
    transcript = 'No se pudo generar el transcripto completo.';
  }

  repository.close(interaction.channel.id, transcript);

  await interaction.editReply({
    embeds: [
      successEmbed(
        'Ticket cerrado',
        'El transcripto se ha enviado al registro. El canal se eliminará.',
      ),
    ],
  });

  await sendTicketTranscript(
    client,
    interaction.guild.id,
    logEmbed('Ticket cerrado', [
      { name: 'Canal', value: `<#${interaction.channel.id}>` },
      { name: 'Cerrado por', value: `<@${member.id}>` },
      { name: 'Creador', value: `<@${ticket.creatorId}>` },
    ]),
    transcript,
    `ticket-${ticket.id}.txt`,
  );

  try {
    const channel = await client.channels.fetch(interaction.channel.id);
    if (channel?.isTextBased()) await channel.delete('Ticket cerrado');
  } catch {
    // The channel may already have been deleted by a moderator.
  }
}

export async function addTicketUser(
  client: PanClient,
  interaction: TicketInteraction,
  user: User,
): Promise<void> {
  if (!interaction.guild || !interaction.channel) return;
  const member = await interaction.guild.members.fetch(interaction.user.id);
  const settings = settingsFor(client, interaction.guild.id);
  const repository = new TicketRepository(client.db.sqlite);
  const ticket = repository.getByChannel(interaction.channel.id);

  if (!ticket || ticket.status === 'closed') {
    await interaction.reply({
      embeds: [errorEmbed('Este ticket no está abierto.')],
      ephemeral: true,
    });
    return;
  }
  if (!canManage(ticket, member, settings.ticketSupportRoleId)) {
    await interaction.reply({
      embeds: [errorEmbed('No tienes permiso para gestionar los usuarios de este ticket.')],
      ephemeral: true,
    });
    return;
  }

  repository.addParticipant(ticket.id, user.id);
  const channel = await client.channels.fetch(interaction.channel.id);
  if (channel?.isTextBased() && 'permissionOverwrites' in channel) {
    await channel.permissionOverwrites.edit(user.id, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
    });
  }

  await interaction.reply({
    embeds: [successEmbed('Usuario añadido', `${user} ahora puede ver el ticket.`)],
  });
  await logTicket(client, interaction.guild.id, 'Usuario añadido al ticket', [
    { name: 'Ticket', value: `<#${interaction.channel.id}>` },
    { name: 'Usuario', value: `<@${user.id}>` },
  ]);
}

export async function removeTicketUser(
  client: PanClient,
  interaction: TicketInteraction,
  user: User,
): Promise<void> {
  if (!interaction.guild || !interaction.channel) return;
  const member = await interaction.guild.members.fetch(interaction.user.id);
  const settings = settingsFor(client, interaction.guild.id);
  const repository = new TicketRepository(client.db.sqlite);
  const ticket = repository.getByChannel(interaction.channel.id);

  if (!ticket || ticket.status === 'closed') {
    await interaction.reply({
      embeds: [errorEmbed('Este ticket no está abierto.')],
      ephemeral: true,
    });
    return;
  }
  if (!canManage(ticket, member, settings.ticketSupportRoleId)) {
    await interaction.reply({
      embeds: [errorEmbed('No tienes permiso para gestionar los usuarios de este ticket.')],
      ephemeral: true,
    });
    return;
  }
  if (user.id === ticket.creatorId) {
    await interaction.reply({
      embeds: [errorEmbed('No puedes eliminar al creador del ticket.')],
      ephemeral: true,
    });
    return;
  }

  if (!repository.removeParticipant(ticket.id, user.id)) {
    await interaction.reply({
      embeds: [errorEmbed('Ese usuario no estaba en el ticket.')],
      ephemeral: true,
    });
    return;
  }

  const channel = await client.channels.fetch(interaction.channel.id);
  if (channel?.isTextBased() && 'permissionOverwrites' in channel) {
    await channel.permissionOverwrites.edit(user.id, { ViewChannel: false });
  }

  await interaction.reply({
    embeds: [successEmbed('Usuario eliminado', `${user} ya no puede ver el ticket.`)],
  });
  await logTicket(client, interaction.guild.id, 'Usuario eliminado del ticket', [
    { name: 'Ticket', value: `<#${interaction.channel.id}>` },
    { name: 'Usuario', value: `<@${user.id}>` },
  ]);
}
