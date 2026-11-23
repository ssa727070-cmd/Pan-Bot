import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type GuildMember,
  type ModalSubmitInteraction,
  type TextBasedChannel,
} from 'discord.js';
import type { PanClient } from '../core/client.js';
import { logger } from '../core/logger.js';
import {
  SuggestionRepository,
  type Suggestion,
  type SuggestionSettings,
  type SuggestionStatus,
  type VoteCounts,
} from '../database/repositories/suggestionRepository.js';
import { notifyLogEvent } from '../logging/logService.js';
import { isSendable } from '../utils/channels.js';
import { createEmbed, errorEmbed, successEmbed } from '../utils/embeds.js';
import { SUGGEST_MODAL, SUGGEST_TEXT_INPUT, SUGGEST_VOTE_PREFIX } from './constants.js';

const STATUS_EMOJI: Record<SuggestionStatus, string> = {
  pending: '🕒 Pendiente',
  approved: '✅ Aprobada',
  rejected: '❌ Rechazada',
  implemented: '🚀 Implementada',
};

export function suggestionModal(): ModalBuilder {
  const input = new TextInputBuilder()
    .setCustomId(SUGGEST_TEXT_INPUT)
    .setLabel('Tu sugerencia')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Describe tu idea con el mayor detalle posible')
    .setMinLength(10)
    .setMaxLength(1000)
    .setRequired(true);

  return new ModalBuilder()
    .setCustomId(SUGGEST_MODAL)
    .setTitle('Nueva sugerencia')
    .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
}

export function suggestionEmbed(
  suggestion: Suggestion,
  counts: VoteCounts,
  labels: Partial<Record<SuggestionStatus, string>> = {},
): ReturnType<typeof createEmbed> {
  const statusLabel = labels[suggestion.status]
    ? `${STATUS_EMOJI[suggestion.status]} — ${labels[suggestion.status]}`
    : STATUS_EMOJI[suggestion.status];

  return createEmbed({
    title: `💡 Sugerencia #${suggestion.id}`,
    description: suggestion.content,
    fields: [
      { name: 'Estado', value: statusLabel, inline: true },
      {
        name: 'Votos',
        value: `👍 ${counts.up} · 👎 ${counts.down} · **${counts.score}**`,
        inline: true,
      },
      { name: 'Autor', value: `<@${suggestion.authorId}>`, inline: true },
      ...(suggestion.staffResponse
        ? [{ name: 'Respuesta del equipo', value: suggestion.staffResponse }]
        : []),
    ],
    footer: `PAN BOT · Sugerencia #${suggestion.id}`,
  });
}

export function suggestionComponents(id: number): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${SUGGEST_VOTE_PREFIX}${id}:up`)
      .setEmoji('👍')
      .setLabel('A favor')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`${SUGGEST_VOTE_PREFIX}${id}:down`)
      .setEmoji('👎')
      .setLabel('En contra')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`${SUGGEST_VOTE_PREFIX}${id}:clear`)
      .setEmoji('↩️')
      .setLabel('Quitar voto')
      .setStyle(ButtonStyle.Secondary),
  );
}

function repo(client: PanClient): SuggestionRepository {
  return new SuggestionRepository(client.db.sqlite);
}

export function isStaff(member: GuildMember, settings: SuggestionSettings): boolean {
  return Boolean(
    member.permissions.has(PermissionFlagsBits.ManageMessages) ||
    (settings.staffRoleId && member.roles.cache.has(settings.staffRoleId)),
  );
}

/** Creates the persistent suggestion and publishes its voting message. */
export async function publishSuggestion(
  client: PanClient,
  interaction: ModalSubmitInteraction,
  content: string,
): Promise<void> {
  if (!interaction.guild) return;
  const settings = repo(client).getSettings(interaction.guild.id);
  if (!settings.enabled || !settings.channelId) {
    await interaction.reply({
      embeds: [errorEmbed('El sistema de sugerencias no está configurado en este servidor.')],
      ephemeral: true,
    });
    return;
  }

  const repository = repo(client);
  const suggestion = repository.create({
    guildId: interaction.guild.id,
    authorId: interaction.user.id,
    channelId: settings.channelId,
    content,
  });

  try {
    const channel = await client.channels.fetch(settings.channelId);
    if (!isSendable(channel)) {
      throw new Error('Suggestion channel is not sendable');
    }
    const message = await channel.send({
      embeds: [suggestionEmbed(suggestion, repository.counts(suggestion.id))],
      components: [suggestionComponents(suggestion.id)],
    });
    repository.setMessageId(interaction.guild.id, suggestion.id, message.id);

    await interaction.reply({
      embeds: [
        successEmbed('Sugerencia enviada', `Tu sugerencia se publicó como \`#${suggestion.id}\`.`),
      ],
      ephemeral: true,
    });
  } catch (error) {
    logger.error({ error, guildId: interaction.guild.id }, 'Could not publish suggestion');
    await interaction.reply({
      embeds: [errorEmbed('No se pudo publicar la sugerencia. Avisa al equipo de staff.')],
      ephemeral: true,
    });
  }
}

/** Refreshes the persistent message after a vote or staff action; dead messages are ignored. */
export async function refreshSuggestionMessage(
  client: PanClient,
  suggestion: Suggestion,
): Promise<void> {
  if (!suggestion.channelId || !suggestion.messageId) return;
  const repository = repo(client);
  try {
    const channel = await client.channels.fetch(suggestion.channelId);
    if (!channel || !('messages' in channel)) return;
    const message = await (channel as TextBasedChannel).messages.fetch(suggestion.messageId);
    await message.edit({
      embeds: [
        suggestionEmbed(
          suggestion,
          repository.counts(suggestion.id),
          repository.getStatusLabels(suggestion.guildId),
        ),
      ],
    });
  } catch (error) {
    logger.warn({ error, suggestionId: suggestion.id }, 'Could not refresh suggestion message');
  }
}

export async function handleVote(
  client: PanClient,
  interaction: ButtonInteraction,
  id: number,
  action: 'up' | 'down' | 'clear',
): Promise<void> {
  if (!interaction.guild) return;
  const repository = repo(client);
  const suggestion = repository.get(interaction.guild.id, id);
  if (!suggestion) {
    await interaction.reply({
      embeds: [errorEmbed('Esa sugerencia ya no existe.')],
      ephemeral: true,
    });
    return;
  }

  const value = action === 'up' ? 1 : action === 'down' ? -1 : null;
  const counts = repository.vote(interaction.guild.id, id, interaction.user.id, value);
  if (!counts) return;

  await refreshSuggestionMessage(client, suggestion);
  await interaction.reply({
    embeds: [
      successEmbed(
        action === 'clear' ? 'Voto eliminado' : 'Voto registrado',
        `👍 ${counts.up} · 👎 ${counts.down} · **${counts.score}**`,
      ),
    ],
    ephemeral: true,
  });
}

export async function staffUpdate(
  client: PanClient,
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  guildId: string,
  id: number,
  status: SuggestionStatus,
  response?: string,
): Promise<void> {
  const repository = repo(client);
  const suggestion = repository.get(guildId, id);
  if (!suggestion) {
    await interaction.reply({
      embeds: [errorEmbed('Esa sugerencia ya no existe.')],
      ephemeral: true,
    });
    return;
  }

  repository.setStatus(guildId, id, status);
  if (response) repository.setResponse(guildId, id, response);
  const updated = repository.get(guildId, id)!;
  await refreshSuggestionMessage(client, updated);

  await notifyLogEvent(client, guildId, 'moderation', `Sugerencia ${status}`, [
    { name: 'Sugerencia', value: `#${id}` },
    { name: 'Estado', value: STATUS_EMOJI[status] },
    { name: 'Staff', value: `<@${interaction.user.id}>` },
  ]);

  await interaction.reply({
    embeds: [
      successEmbed(
        'Sugerencia actualizada',
        `La sugerencia \`#${id}\` ahora está ${STATUS_EMOJI[status]}.`,
      ),
    ],
    ephemeral: true,
  });
}
