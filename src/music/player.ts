import type { ChatInputCommandInteraction, TextChannel } from 'discord.js';
import type { Player } from 'lavalink-client';
import { env } from '../config/env.js';
import type { PanClient } from '../core/client.js';
import { GuildSettingsRepository } from '../database/repositories/guildSettings.js';
import { errorEmbed } from '../utils/embeds.js';

/** Returns the active player for a guild, if any. */
export function getPlayer(client: PanClient, guildId: string): Player | undefined {
  return client.lavalink.getPlayer(guildId);
}

/** Sends an error embed, respecting an already deferred interaction. */
async function replyError(
  interaction: ChatInputCommandInteraction,
  description: string,
): Promise<void> {
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply({ embeds: [errorEmbed(description)] });
    return;
  }
  await interaction.reply({ embeds: [errorEmbed(description)], ephemeral: true });
}

/** Resolves the voice channel of the caller, replying with an error when absent. */
function callerVoiceChannelId(interaction: ChatInputCommandInteraction): string | null {
  const member = interaction.member;
  if (member && 'voice' in member) {
    return member.voice.channelId ?? null;
  }
  return null;
}

/**
 * Makes sure a player exists for the guild, connects it if needed and verifies
 * that the requester is in the same voice channel as the bot.
 */
export async function requirePlayer(
  interaction: ChatInputCommandInteraction,
  client: PanClient,
  options: { requireSameVoice?: boolean } = {},
): Promise<Player | null> {
  const voiceChannelId = callerVoiceChannelId(interaction);

  if (!voiceChannelId) {
    await replyError(interaction, 'You need to join a voice channel first.');
    return null;
  }

  let player = getPlayer(client, interaction.guildId!);

  if (!player) {
    const settings = new GuildSettingsRepository(client.db.sqlite, env.DEFAULT_VOLUME).get(
      interaction.guildId!,
    );

    player = client.lavalink.createPlayer({
      guildId: interaction.guildId!,
      voiceChannelId,
      textChannelId: interaction.channelId,
      selfDeaf: true,
      volume: settings.defaultVolume,
    });
  }

  if (options.requireSameVoice !== false && player.voiceChannelId !== voiceChannelId) {
    await replyError(
      interaction,
      `I am currently playing in <#${player.voiceChannelId ?? 'unknown'}>.`,
    );
    return null;
  }

  if (!player.connected) {
    await player.connect();
  }

  return player;
}

/** Returns a player that must already exist, replying with an error when it does not. */
export async function existingPlayer(
  interaction: ChatInputCommandInteraction,
  client: PanClient,
  options: { requireSameVoice?: boolean } = {},
): Promise<Player | null> {
  const player = getPlayer(client, interaction.guildId!);

  if (!player || !player.playing) {
    await replyError(interaction, 'Nothing is playing right now.');
    return null;
  }

  const voiceChannelId = callerVoiceChannelId(interaction);
  if (
    options.requireSameVoice !== false &&
    voiceChannelId &&
    player.voiceChannelId !== voiceChannelId
  ) {
    await interaction.reply({
      embeds: [errorEmbed(`I am currently playing in <#${player.voiceChannelId}>.`)],
      ephemeral: true,
    });
    return null;
  }

  return player;
}

/** Resolves the text channel associated with a player, if still accessible. */
export async function playerTextChannel(
  client: PanClient,
  player: Player,
): Promise<TextChannel | null> {
  if (!player.textChannelId) return null;
  try {
    const channel = await client.channels.fetch(player.textChannelId);
    return channel?.isTextBased() && !channel.isDMBased() ? (channel as TextChannel) : null;
  } catch {
    return null;
  }
}
