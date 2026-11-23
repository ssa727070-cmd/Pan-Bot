import { EmbedBuilder, type APIEmbedField } from 'discord.js';
import { env } from '../config/env.js';

const brandColor = Number.parseInt(env.EMBED_COLOR, 16);

export interface EmbedOptions {
  title?: string;
  description?: string;
  fields?: APIEmbedField[];
  footer?: string;
  thumbnail?: string;
  color?: number;
}

export function createEmbed(options: EmbedOptions): EmbedBuilder {
  const embed = new EmbedBuilder().setColor(options.color ?? brandColor).setTimestamp();

  if (options.title) embed.setTitle(options.title);
  if (options.description) embed.setDescription(options.description);
  if (options.fields?.length) embed.addFields(options.fields);
  if (options.footer) embed.setFooter({ text: options.footer });
  if (options.thumbnail) embed.setThumbnail(options.thumbnail);

  return embed;
}

export function successEmbed(title: string, description?: string): EmbedBuilder {
  return createEmbed({
    title: `✅ ${title}`,
    description,
    footer: 'PAN BOT',
  });
}

export function errorEmbed(description: string): EmbedBuilder {
  return createEmbed({
    title: '❌ Error',
    description,
    footer: 'PAN BOT',
  });
}

export function warningEmbed(title: string, description?: string): EmbedBuilder {
  return createEmbed({
    title: `⚠️ ${title}`,
    description,
    footer: 'PAN BOT',
  });
}

export function infoEmbed(title: string, description?: string): EmbedBuilder {
  return createEmbed({ title, description, footer: 'PAN BOT' });
}

export function loadingEmbed(description: string): EmbedBuilder {
  return createEmbed({ title: '⏳ Espera…', description, footer: 'PAN BOT' });
}
