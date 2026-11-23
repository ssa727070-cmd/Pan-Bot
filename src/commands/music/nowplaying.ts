import { SlashCommandBuilder } from 'discord.js';
import { existingPlayer } from '../../music/player.js';
import { createEmbed, errorEmbed } from '../../utils/embeds.js';
import { formatDuration } from '../../utils/format.js';
import type { Command } from '../../types/command.js';

function progressBar(position: number, duration: number, size = 18): string {
  if (duration <= 0) return '─'.repeat(size);
  const filled = Math.min(size, Math.max(0, Math.round((position / duration) * size)));
  return '█'.repeat(filled) + '─'.repeat(size - filled);
}

const command: Command = {
  category: 'music',
  data: new SlashCommandBuilder()
    .setName('nowplaying')
    .setDescription('Show the track currently playing.'),

  async execute(interaction, client) {
    const player = await existingPlayer(interaction, client, { requireSameVoice: false });
    if (!player) return;

    const track = player.queue.current;
    if (!track) {
      await interaction.reply({
        embeds: [errorEmbed('Nothing is playing right now.')],
        ephemeral: true,
      });
      return;
    }

    const duration = track.info.duration ?? 0;
    const position = Math.min(player.position, duration);

    await interaction.reply({
      embeds: [
        createEmbed({
          title: 'Now playing',
          description: `**[${track.info.title}](${track.info.uri})**\nBy ${track.info.author}`,
          fields: [
            {
              name: 'Progress',
              value: `${formatDuration(position)} ${progressBar(position, duration)} ${formatDuration(duration)}`,
            },
            { name: 'Source', value: track.info.sourceName, inline: true },
            { name: 'Volume', value: `${player.volume}%`, inline: true },
            {
              name: 'Requested by',
              value: `<@${(track.requester as { id?: string } | undefined)?.id ?? interaction.user.id}>`,
              inline: true,
            },
          ],
          thumbnail: track.info.artworkUrl ?? undefined,
          footer: `Repeat: ${player.repeatMode}`,
        }),
      ],
    });
  },
};

export default command;
