import type { Guild, User } from 'discord.js';
import { env } from '../config/env.js';
import type { PanClient } from '../core/client.js';
import type { GuildSettings } from '../database/repositories/guildSettings.js';
import { isSendable } from '../utils/channels.js';
import { createEmbed } from '../utils/embeds.js';
import {
  DEFAULT_GOODBYE_MESSAGE,
  DEFAULT_WELCOME_MESSAGE,
  parseEmbedColor,
  renderTemplate,
} from './messages.js';

export function greetingEmbed(
  user: User,
  guild: Guild,
  memberCount: number,
  settings: GuildSettings,
  welcome: boolean,
) {
  const template = welcome
    ? (settings.welcomeMessage ?? DEFAULT_WELCOME_MESSAGE)
    : (settings.goodbyeMessage ?? DEFAULT_GOODBYE_MESSAGE);

  return createEmbed({
    title: welcome ? '🎉 ¡Bienvenido!' : '👋 Hasta luego',
    description: renderTemplate(template, {
      userId: user.id,
      username: user.username,
      guildName: guild.name,
      memberCount,
    }),
    color: parseEmbedColor(settings.embedColor ?? '') ?? Number.parseInt(env.EMBED_COLOR, 16),
    thumbnail: user.displayAvatarURL(),
    footer: welcome ? `Miembro ${memberCount} de ${guild.name}` : guild.name,
  });
}

async function sendGreeting(
  client: PanClient,
  user: User,
  guild: Guild,
  settings: GuildSettings,
  welcome: boolean,
): Promise<boolean> {
  const channelId = welcome ? settings.welcomeChannelId : settings.goodbyeChannelId;
  if (!channelId) return false;

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || !isSendable(channel)) return false;
    await channel.send({
      embeds: [greetingEmbed(user, guild, guild.memberCount, settings, welcome)],
    });
    return true;
  } catch {
    return false;
  }
}

export function sendWelcome(client: PanClient, user: User, guild: Guild, settings: GuildSettings) {
  return sendGreeting(client, user, guild, settings, true);
}

export function sendGoodbye(client: PanClient, user: User, guild: Guild, settings: GuildSettings) {
  return sendGreeting(client, user, guild, settings, false);
}
