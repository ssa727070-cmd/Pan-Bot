import { SlashCommandBuilder } from 'discord.js';
import { existingPlayer } from '../../music/player.js';
import { createEmbed } from '../../utils/embeds.js';
import { formatDuration, truncate } from '../../utils/format.js';
import type { Command } from '../../types/command.js';

const PAGE_SIZE = 10;

const command: Command = {
  category: 'music',
  data: new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Show the upcoming tracks.')
    .addIntegerOption((option) =>
      option.setName('page').setDescription('Page number').setMinValue(1).setRequired(false),
    ),

  async execute(interaction, client) {
    const player = await existingPlayer(interaction, client, { requireSameVoice: false });
    if (!player) return;

    const tracks = player.queue.tracks;
    const maxPage = Math.max(1, Math.ceil(tracks.length / PAGE_SIZE));
    const requestedPage = interaction.options.getInteger('page') ?? 1;
    const page = Math.min(Math.max(1, requestedPage), maxPage);
    const offset = (page - 1) * PAGE_SIZE;

    const list = tracks
      .slice(offset, offset + PAGE_SIZE)
      .map(
        (track, index) =>
          `\`${offset + index + 1}.\` ${truncate(track.info.title, 60)} — ${formatDuration(
            track.info.duration ?? 0,
          )}`,
      )
      .join('\n');

    const current = player.queue.current;
    const totalDuration = tracks.reduce((sum, track) => sum + (track.info.duration ?? 0), 0);

    await interaction.reply({
      embeds: [
        createEmbed({
          title: `Queue for ${interaction.guild?.name ?? 'this server'}`,
          description: current
            ? `**Now playing:** ${truncate(current.info.title, 80)}\n\n${list || 'No upcoming tracks.'}`
            : list || 'The queue is empty.',
          fields: [
            { name: 'Tracks', value: String(tracks.length), inline: true },
            { name: 'Duration', value: formatDuration(totalDuration), inline: true },
            { name: 'Page', value: `${page}/${maxPage}`, inline: true },
          ],
          footer: `Repeat mode: ${player.repeatMode} • Volume: ${player.volume}%`,
        }),
      ],
    });
  },
};

export default command;
