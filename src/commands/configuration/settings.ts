import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../types/command.js';
import { GuildSettingsRepository } from '../../database/repositories/guildSettings.js';
import { env } from '../../config/env.js';
import { createEmbed, errorEmbed, successEmbed } from '../../utils/embeds.js';

const command: Command = {
  category: 'configuration',
  data: new SlashCommandBuilder()
    .setName('settings')
    .setDescription('Configure PAN BOT for this server.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) => sub.setName('view').setDescription('Show the current settings.'))
    .addSubcommand((sub) =>
      sub
        .setName('djrole')
        .setDescription('Set the role allowed to manage music (leave empty to clear).')
        .addRoleOption((option) =>
          option.setName('role').setDescription('The DJ role').setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('musicchannel')
        .setDescription('Restrict music commands to one text channel.')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('The music command channel')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('volume')
        .setDescription('Set the default playback volume for this server.')
        .addIntegerOption((option) =>
          option
            .setName('value')
            .setDescription('Volume between 0 and 100')
            .setMinValue(0)
            .setMaxValue(100)
            .setRequired(true),
        ),
    ),

  async execute(interaction, client) {
    const repository = new GuildSettingsRepository(client.db.sqlite, env.DEFAULT_VOLUME);
    const guildId = interaction.guildId!;
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'view') {
      const settings = repository.get(guildId);
      await interaction.reply({
        embeds: [
          createEmbed({
            title: 'Server settings',
            fields: [
              {
                name: 'DJ role',
                value: settings.djRoleId ? `<@&${settings.djRoleId}>` : 'Not set',
                inline: true,
              },
              {
                name: 'Music channel',
                value: settings.musicChannelId ? `<#${settings.musicChannelId}>` : 'Any channel',
                inline: true,
              },
              { name: 'Default volume', value: `${settings.defaultVolume}%`, inline: true },
            ],
            footer: 'PAN BOT',
          }),
        ],
        ephemeral: true,
      });
      return;
    }

    if (subcommand === 'djrole') {
      const role = interaction.options.getRole('role');
      repository.update(guildId, { djRoleId: role?.id ?? null });
      await interaction.reply({
        embeds: [
          successEmbed(
            'DJ role updated',
            role ? `New DJ role: <@&${role.id}>` : 'DJ role cleared.',
          ),
        ],
        ephemeral: true,
      });
      return;
    }

    if (subcommand === 'musicchannel') {
      const channel = interaction.options.getChannel('channel');
      repository.update(guildId, { musicChannelId: channel?.id ?? null });
      await interaction.reply({
        embeds: [
          successEmbed(
            'Music channel updated',
            channel
              ? `Music commands are now limited to <#${channel.id}>.`
              : 'Music commands are allowed anywhere.',
          ),
        ],
        ephemeral: true,
      });
      return;
    }

    if (subcommand === 'volume') {
      const value = interaction.options.getInteger('value', true);
      repository.update(guildId, { defaultVolume: value });
      await interaction.reply({
        embeds: [successEmbed('Default volume updated', `New default volume: **${value}%**`)],
        ephemeral: true,
      });
      return;
    }

    await interaction.reply({ embeds: [errorEmbed('Unknown setting.')], ephemeral: true });
  },
};

export default command;
