import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { logger } from '../../core/logger.js';
import {
  StatisticsRepository,
  type StatMetric,
} from '../../database/repositories/statisticsRepository.js';
import {
  snapshotMembers,
  statisticsEmbed,
  refreshStatsChannels,
} from '../../statistics/service.js';
import type { Command } from '../../types/command.js';
import { createEmbed, errorEmbed, successEmbed } from '../../utils/embeds.js';

const METRICS = [
  { name: 'Miembros totales', value: 'members' },
  { name: 'Humanos', value: 'humans' },
  { name: 'Bots', value: 'bots' },
  { name: 'Usuarios (alias de miembros)', value: 'total' },
  { name: 'Mensajes', value: 'messages' },
] as const;

function isMetric(value: string): value is StatMetric {
  return METRICS.some((metric) => metric.value === value);
}

const command: Command = {
  category: 'statistics',
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Consulta y configura las estadísticas del servidor.')
    .addSubcommand((sub) =>
      sub.setName('members').setDescription('Muestra miembros, humanos y bots en vivo.'),
    )
    .addSubcommand((sub) =>
      sub.setName('activity').setDescription('Muestra entradas, salidas y mensajes históricos.'),
    )
    .addSubcommand((sub) =>
      sub.setName('channels').setDescription('Gestiona los canales contador de estadísticas.'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('setup')
        .setDescription('Configura un canal contador (requiere Gestionar servidor).')
        .addChannelOption((option) =>
          option
            .setName('canal')
            .setDescription('Canal de voz o texto cuyo nombre se actualizará')
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName('metrica')
            .setDescription('Métrica a mostrar')
            .setRequired(true)
            .addChoices(...METRICS),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('disable')
        .setDescription('Elimina todos los canales contador (requiere Gestionar servidor).'),
    ),

  async execute(interaction, client) {
    if (!interaction.guild) return;
    const guild = interaction.guild;
    const repo = new StatisticsRepository(client.db.sqlite);
    const subcommand = interaction.options.getSubcommand(false) ?? 'members';
    const admin = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false;

    if (subcommand === 'setup' || subcommand === 'disable') {
      if (!admin) {
        await interaction.reply({
          embeds: [
            errorEmbed('Necesitas el permiso **Gestionar servidor** para configurar estadísticas.'),
          ],
          ephemeral: true,
        });
        return;
      }

      if (subcommand === 'disable') {
        const removed = repo.clearChannels(guild.id);
        await interaction.reply({
          embeds: [
            successEmbed(
              'Contadores desactivados',
              `Se eliminaron ${removed} canal(es) contador de la configuración.`,
            ),
          ],
          ephemeral: true,
        });
        return;
      }

      const channel = interaction.options.getChannel('canal', true);
      const metric = interaction.options.getString('metrica', true);
      if (!isMetric(metric)) {
        await interaction.reply({
          embeds: [errorEmbed('Métrica no válida.')],
          ephemeral: true,
        });
        return;
      }
      if (
        ![ChannelType.GuildText, ChannelType.GuildVoice, ChannelType.GuildAnnouncement].includes(
          channel.type,
        )
      ) {
        await interaction.reply({
          embeds: [errorEmbed('Elige un canal de texto, anuncio o voz.')],
          ephemeral: true,
        });
        return;
      }
      if (!guild.members.me?.permissions.has(PermissionFlagsBits.ManageChannels)) {
        await interaction.reply({
          embeds: [
            errorEmbed('Me falta el permiso **Gestionar canales** para renombrar contadores.'),
          ],
          ephemeral: true,
        });
        return;
      }

      repo.setChannel(guild.id, channel.id, metric);
      await refreshStatsChannels(client, guild.id, { guild, force: true });
      await interaction.reply({
        embeds: [
          successEmbed(
            'Contador configurado',
            `<#${channel.id}> mostrará la métrica **${METRICS.find((item) => item.value === metric)?.name}**.`,
          ),
        ],
        ephemeral: true,
      });
      return;
    }

    if (subcommand === 'channels') {
      const channels = repo.listChannels(guild.id);
      await interaction.reply({
        embeds: [
          createEmbed({
            title: '📈 Canales contador',
            description: channels.length
              ? channels
                  .map(
                    (channel) =>
                      `<#${channel.channelId}> — ${METRICS.find((m) => m.value === channel.metric)?.name ?? channel.metric}`,
                  )
                  .join('\n')
              : 'No hay canales contador configurados. Usa `/stats setup`.',
            footer: `PAN BOT · ${channels.length} contador(es)`,
          }),
        ],
        ephemeral: true,
      });
      return;
    }

    const members = await snapshotMembers(guild);
    repo.setLiveMembers(guild.id, members);
    const stats = repo.get(guild.id);
    const daily = repo.getDaily(guild.id, 7);

    await interaction.reply({
      embeds: [statisticsEmbed(stats, daily)],
    });

    logger.debug({ guildId: guild.id, subcommand }, 'Statistics requested');
  },
};

export default command;
