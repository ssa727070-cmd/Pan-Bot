import type { EmbedBuilder } from 'discord.js';
import type { PanClient } from '../core/client.js';
import { logger } from '../core/logger.js';
import { MinecraftRepository } from '../database/repositories/minecraftRepository.js';

function isSendable(
  channel: unknown,
): channel is { send: (payload: { embeds: EmbedBuilder[] }) => Promise<unknown> } {
  return !!channel && typeof (channel as { send?: unknown }).send === 'function';
}

/** Sends embeds to the guild's notification channel. Returns true only if Discord accepted them. */
export async function sendNotificationEmbeds(
  client: PanClient,
  guildId: string,
  embeds: EmbedBuilder[],
): Promise<boolean> {
  if (embeds.length === 0) return false;
  const settings = new MinecraftRepository(client.db.sqlite).getSettings(guildId);
  if (!settings.notificationChannelId) return false;
  const channel = await client.channels.fetch(settings.notificationChannelId).catch(() => null);
  if (!isSendable(channel)) return false;
  try {
    // Discord accepts up to 10 embeds per message.
    for (let index = 0; index < embeds.length; index += 10) {
      await channel.send({ embeds: embeds.slice(index, index + 10) });
    }
    return true;
  } catch (error) {
    logger.warn({ error, guildId }, 'No se pudo enviar la notificación de Minecraft');
    return false;
  }
}

/**
 * Sends one notification unless the same (event, subject) was already sent with
 * this fingerprint. The fingerprint is stored only after a successful send.
 */
export async function sendMinecraftNotification(
  client: PanClient,
  guildId: string,
  eventKey: string,
  subject: string,
  fingerprint: string,
  embed: EmbedBuilder,
): Promise<boolean> {
  const repo = new MinecraftRepository(client.db.sqlite);
  if (repo.getNotificationFingerprint(guildId, eventKey, subject) === fingerprint) return false;
  const sent = await sendNotificationEmbeds(client, guildId, [embed]);
  if (sent) repo.markNotification(guildId, eventKey, subject, fingerprint);
  return sent;
}
