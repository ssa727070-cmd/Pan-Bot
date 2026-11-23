import { SlashCommandBuilder } from 'discord.js';
import type { Track } from 'lavalink-client';
import { env } from '../../config/env.js';
import { requirePlayer } from '../../music/player.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { formatDuration, truncate } from '../../utils/format.js';
import type { Command } from '../../types/command.js';

const command: Command = {
  category: 'music',
  cooldownSeconds: 2,
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play a track or playlist from a URL or search term.')
    .addStringOption((option) =>
      option.setName('query').setDescription('Song name or URL').setRequired(true),
    ),

  async execute(interaction, client) {
    const query = interaction.options.getString('query', true);
    await interaction.deferReply();

    const player = await requirePlayer(interaction, client);
    if (!player) return;

    const result = await player.search(
      /^https?:\/\//i.test(query) ? { query } : { query, source: 'ytsearch' },
      interaction.user,
    );

    if (
      !result ||
      result.loadType === 'error' ||
      result.loadType === 'empty' ||
      result.tracks.length === 0
    ) {
      await interaction.editReply({
        embeds: [errorEmbed('No results found. Try a different search term or URL.')],
      });
      return;
    }

    const tracks = result.tracks.slice(0, env.MAX_QUEUE_SIZE) as Track[];
    const availableSlots = env.MAX_QUEUE_SIZE - player.queue.tracks.length;

    if (availableSlots <= 0) {
      await interaction.editReply({
        embeds: [errorEmbed(`The queue is full (${env.MAX_QUEUE_SIZE} tracks).`)],
      });
      return;
    }

    const tracksToAdd = tracks.slice(0, availableSlots);
    await player.queue.add(tracksToAdd);

    if (!player.playing && !player.paused) {
      await player.play();
    }

    const first = tracksToAdd[0]!;
    const playlistName = result.playlist?.name;
    const description = playlistName
      ? `**Playlist:** ${truncate(playlistName, 100)}\n**Tracks added:** ${tracksToAdd.length}`
      : `**Title:** [${truncate(first.info.title, 100)}](${first.info.uri})\n` +
        `**Author:** ${truncate(first.info.author, 100)}\n` +
        `**Duration:** ${formatDuration(first.info.duration)}`;

    await interaction.editReply({
      embeds: [
        successEmbed(playlistName ? 'Playlist added to queue' : 'Added to queue', description),
      ],
    });
  },
};

export default command;
