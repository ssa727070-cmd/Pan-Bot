import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { GuildSettingsRepository } from '../../database/repositories/guildSettings.js';
import { greetingEmbed } from '../../features/welcome.js';
import { successEmbed } from '../../utils/embeds.js';
import type { Command } from '../../types/command.js';

const command: Command = {
  category: 'welcome',
  data: new SlashCommandBuilder()
    .setName('goodbye')
    .setDescription('Configura los mensajes de despedida.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName('setup')
        .setDescription('Define el canal de despedidas y, opcionalmente, el mensaje.')
        .addChannelOption((option) =>
          option
            .setName('canal')
            .setDescription('Canal donde se enviarán las despedidas')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        )
        .addStringOption((option) =>
          option.setName('mensaje').setDescription('Mensaje personalizado').setMaxLength(1000),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('mensaje')
        .setDescription('Cambia el mensaje de despedida.')
        .addStringOption((option) =>
          option
            .setName('mensaje')
            .setDescription('Usa {username}, {server}, {memberCount}')
            .setRequired(true)
            .setMaxLength(1000),
        ),
    )
    .addSubcommand((sub) => sub.setName('test').setDescription('Envía una vista previa del embed.'))
    .addSubcommand((sub) => sub.setName('disable').setDescription('Desactiva las despedidas.')),

  async execute(interaction, client) {
    if (!interaction.guild) return;
    const repository = new GuildSettingsRepository(client.db.sqlite);
    const settings = repository.get(interaction.guild.id);
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'setup') {
      const channel = interaction.options.getChannel('canal', true);
      const message = interaction.options.getString('mensaje') ?? undefined;
      repository.update(interaction.guild.id, {
        goodbyeChannelId: channel.id,
        ...(message ? { goodbyeMessage: message } : {}),
      });
      await interaction.reply({
        embeds: [successEmbed('Despedidas configuradas', `Se enviarán en <#${channel.id}>.`)],
      });
      return;
    }

    if (subcommand === 'mensaje') {
      const message = interaction.options.getString('mensaje', true);
      repository.update(interaction.guild.id, { goodbyeMessage: message });
      await interaction.reply({
        embeds: [successEmbed('Mensaje actualizado', 'El mensaje de despedida se ha guardado.')],
      });
      return;
    }

    if (subcommand === 'test') {
      await interaction.reply({
        embeds: [
          greetingEmbed(
            interaction.user,
            interaction.guild,
            interaction.guild.memberCount,
            settings,
            false,
          ),
        ],
        ephemeral: true,
      });
      return;
    }

    repository.update(interaction.guild.id, { goodbyeChannelId: null });
    await interaction.reply({
      embeds: [successEmbed('Despedidas desactivadas', 'Ya no se enviarán mensajes de despedida.')],
    });
  },
};

export default command;
