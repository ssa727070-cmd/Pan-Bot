import { EmbedBuilder, type APIEmbedField } from 'discord.js';
import type { PanClient } from '../core/client.js';
import { GuildSettingsRepository } from '../database/repositories/guildSettings.js';
import { TicketRepository } from '../database/repositories/ticketRepository.js';
import { LogSettingsRepository } from '../database/repositories/logSettingsRepository.js';
import { isSendable } from '../utils/channels.js';
import { createEmbed } from '../utils/embeds.js';
import type { LogEvent } from './events.js';

export function logEmbed(
  title: string,
  fields: APIEmbedField[],
  description?: string,
): EmbedBuilder {
  return createEmbed({
    title: `📝 ${title}`,
    description,
    fields,
    footer: 'PAN BOT · Registros',
  });
}

async function sendToChannel(
  client: PanClient,
  channelId: string | null,
  embed: EmbedBuilder,
  files?: Array<{ name: string; attachment: Buffer }>,
): Promise<boolean> {
  if (!channelId) return false;

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || !isSendable(channel)) return false;
    await channel.send({ embeds: [embed], ...(files ? { files } : {}) });
    return true;
  } catch {
    return false;
  }
}

/** Sends an event embed to the configured channel, honouring the event toggle. */
export async function sendLogEvent(
  client: PanClient,
  guildId: string,
  event: LogEvent,
  embed: EmbedBuilder,
): Promise<boolean> {
  const setting = new LogSettingsRepository(client.db.sqlite).get(guildId, event);
  if (!setting.enabled || !setting.channelId) return false;
  return sendToChannel(client, setting.channelId, embed);
}

/** Convenience wrapper for simple event embeds. */
export function notifyLogEvent(
  client: PanClient,
  guildId: string,
  event: LogEvent,
  title: string,
  fields: APIEmbedField[],
  description?: string,
): Promise<boolean> {
  return sendLogEvent(client, guildId, event, logEmbed(title, fields, description));
}

/** Sends a moderation embed to the moderation channel (falls back to general logs). */
export async function sendModerationLog(
  client: PanClient,
  guildId: string,
  embed: EmbedBuilder,
): Promise<boolean> {
  const settings = new GuildSettingsRepository(client.db.sqlite).get(guildId);
  if (settings.modLogChannelId) {
    return sendToChannel(client, settings.modLogChannelId, embed);
  }
  return sendLogEvent(client, guildId, 'moderation', embed);
}

/** Whether a closed ticket's transcript has anywhere configured to go (besides the database). */
export function hasTranscriptDestination(client: PanClient, guildId: string): boolean {
  const archive = new TicketRepository(client.db.sqlite).getSettings(guildId).archiveChannelId;
  const settings = new GuildSettingsRepository(client.db.sqlite).get(guildId);
  const logSetting = new LogSettingsRepository(client.db.sqlite).get(guildId, 'ticket');
  return Boolean(archive || settings.modLogChannelId || logSetting.channelId);
}

/** Sends a transcript file to the ticket archive channel, falling back to the log channels. */
export async function sendTicketTranscript(
  client: PanClient,
  guildId: string,
  embed: EmbedBuilder,
  transcript: string,
  fileName: string,
): Promise<boolean> {
  const settings = new GuildSettingsRepository(client.db.sqlite).get(guildId);
  const files = [{ name: fileName, attachment: Buffer.from(transcript, 'utf8') }];
  const archiveChannelId = new TicketRepository(client.db.sqlite).getSettings(
    guildId,
  ).archiveChannelId;
  if (archiveChannelId && (await sendToChannel(client, archiveChannelId, embed, files))) {
    return true;
  }
  if (
    settings.modLogChannelId &&
    (await sendToChannel(client, settings.modLogChannelId, embed, files))
  ) {
    return true;
  }
  const logSetting = new LogSettingsRepository(client.db.sqlite).get(guildId, 'ticket');
  return sendToChannel(client, logSetting.channelId, embed, files);
}
