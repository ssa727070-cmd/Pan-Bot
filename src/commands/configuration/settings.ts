import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../types/command.js';
import { GuildSettingsRepository } from '../../database/repositories/guildSettings.js';
import { AutomodRepository } from '../../database/repositories/automodRepository.js';
import { AutoroleRepository } from '../../database/repositories/autoroleRepository.js';
import { HelperRepository } from '../../database/repositories/helperRepository.js';
import { MinecraftRepository } from '../../database/repositories/minecraftRepository.js';
import { SuggestionRepository } from '../../database/repositories/suggestionRepository.js';
import { TicketRepository } from '../../database/repositories/ticketRepository.js';
import { createEmbed, errorEmbed, successEmbed } from '../../utils/embeds.js';

const onOff = (value: boolean): string => (value ? '✅ activado' : '⚪ desactivado');

/** One line per optional module; a failing module never hides the others. */
export function moduleStatusLines(
  db: import('better-sqlite3').Database,
  guildId: string,
): string[] {
  const probes: Array<[string, () => string]> = [
    [
      'Tickets',
      () => {
        const t = new TicketRepository(db).getSettings(guildId);
        const configured = t.panelChannelId && t.categoryId ? '' : ' · ⚠️ falta panel o categoría';
        return `${onOff(t.enabled)}${t.enabled ? configured : ''}`;
      },
    ],
    ['AutoMod', () => onOff(new AutomodRepository(db).getSettings(guildId).enabled)],
    ['Minecraft', () => onOff(new MinecraftRepository(db).getSettings(guildId).enabled)],
    ['Helpers', () => onOff(new HelperRepository(db).getSettings(guildId).enabled)],
    ['Sugerencias', () => onOff(new SuggestionRepository(db).getSettings(guildId).enabled)],
    ['Autoroles', () => onOff(new AutoroleRepository(db).getSettings(guildId).enabled)],
  ];
  return probes.map(([name, probe]) => {
    try {
      return `**${name}:** ${probe()}`;
    } catch {
      return `**${name}:** ⚠️ error al leer la configuración`;
    }
  });
}

const command: Command = {
  category: 'configuration',
  data: new SlashCommandBuilder()
    .setName('settings')
    .setDescription('Configura PAN BOT en este servidor.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) => sub.setName('view').setDescription('Muestra la configuración actual.'))
    .addSubcommand((sub) =>
      sub
        .setName('modlog')
        .setDescription('Establece el canal de registro de moderación.')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Canal de logs de moderación')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false),
        ),
    ),

  async execute(interaction, client) {
    const repository = new GuildSettingsRepository(client.db.sqlite);
    const guildId = interaction.guildId!;
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'view') {
      const settings = repository.get(guildId);
      await interaction.reply({
        embeds: [
          createEmbed({
            title: 'Configuración del servidor',
            fields: [
              {
                name: 'Logs de moderación',
                value: settings.modLogChannelId
                  ? `<#${settings.modLogChannelId}>`
                  : 'Sin configurar',
                inline: true,
              },
              {
                name: 'Bienvenidas',
                value: settings.welcomeChannelId
                  ? `<#${settings.welcomeChannelId}>`
                  : 'Desactivadas',
                inline: true,
              },
              {
                name: 'Despedidas',
                value: settings.goodbyeChannelId
                  ? `<#${settings.goodbyeChannelId}>`
                  : 'Desactivadas',
                inline: true,
              },
              {
                name: 'Módulos',
                value: moduleStatusLines(client.db.sqlite, guildId).join('\n'),
              },
            ],
            footer: 'PAN BOT',
          }),
        ],
        ephemeral: true,
      });
      return;
    }

    if (subcommand === 'modlog') {
      const channel = interaction.options.getChannel('channel');
      repository.update(guildId, { modLogChannelId: channel?.id ?? null });
      await interaction.reply({
        embeds: [
          successEmbed(
            'Canal de moderación actualizado',
            channel
              ? `Las acciones de moderación se registrarán en <#${channel.id}>.`
              : 'Los registros de moderación se han desactivado.',
          ),
        ],
        ephemeral: true,
      });
      return;
    }

    await interaction.reply({
      embeds: [errorEmbed('Configuración desconocida.')],
      ephemeral: true,
    });
  },
};

export default command;
