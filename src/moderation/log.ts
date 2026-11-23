import type { APIEmbedField } from 'discord.js';
import { logEmbed } from '../logging/logService.js';
import type { EmbedBuilder } from 'discord.js';

export function moderationLogEmbed(
  action: string,
  moderatorId: string,
  targetId: string,
  reason: string,
  extra: APIEmbedField[] = [],
): EmbedBuilder {
  return logEmbed(`Moderación: ${action}`, [
    { name: 'Acción', value: action, inline: true },
    { name: 'Moderador', value: `<@${moderatorId}>`, inline: true },
    { name: 'Miembro', value: `<@${targetId}> (\`${targetId}\`)`, inline: false },
    { name: 'Razón', value: reason, inline: false },
    ...extra,
  ]);
}
