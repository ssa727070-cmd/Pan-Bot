import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { GuildSettingsRepository } from '../../database/repositories/guildSettings.js';
import { greetingEmbed } from '../../features/welcome.js';
import { parseEmbedColor } from '../../features/messages.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import type { Command } from '../../types/command.js';

const command: Command = {
  category: 'welcome',
  data: new SlashCommandBuilder()
    .setName('welcome')
    .setDescription('Configura los mensajes de bienvenida.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName('setup')
        .setDescription('Define el canal de bienvenidas y, opcionalmente, el mensaje.')
        .addChannelOption((option) =>
          option
            .setName('canal')
            .setDescription('Canal donde se enviarán las bienvenidas')
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
        .setDescription('Cambia el mensaje de bienvenida.')
        .addStringOption((option) =>
          option
            .setName('mensaje')
            .setDescription('Usa {user}, {username}, {server}, {memberCount}')
            .setRequired(true)
            .setMaxLength(1000),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('color')
        .setDescription('Cambia el color de los embeds de bienvenida y despedida.')
        .addStringOption((option) =>
          option
            .setName('color')
            .setDescription('Color hexadecimal de 6 dígitos, sin #')
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) => sub.setName('test').setDescription('Envía una vista previa del embed.'))
    .addSubcommand((sub) => sub.setName('disable').setDescription('Desactiva las bienvenidas.')),

  async execute(interaction, client) {
    if (!interaction.guild) return;
    const repository = new GuildSettingsRepository(client.db.sqlite);
    const settings = repository.get(interaction.guild.id);
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'setup') {
      const channel = interaction.options.getChannel('canal', true);
      const message = interaction.options.getString('mensaje') ?? undefined;
      repository.update(interaction.guild.id, {
        welcomeChannelId: channel.id,
        ...(message ? { welcomeMessage: message } : {}),
      });
      await interaction.reply({
        embeds: [
          successEmbed(
            'Bienvenidas configuradas',
            `Se enviarán en <#${channel.id}>${message ? ' con tu mensaje personalizado.' : '.'}`,
          ),
        ],
      });
      return;
    }

    if (subcommand === 'mensaje') {
      const message = interaction.options.getString('mensaje', true);
      repository.update(interaction.guild.id, { welcomeMessage: message });
      await interaction.reply({
        embeds: [successEmbed('Mensaje actualizado', 'El mensaje de bienvenida se ha guardado.')],
      });
      return;
    }

    if (subcommand === 'color') {
      const value = interaction.options.getString('color', true);
      const color = parseEmbedColor(value);
      if (color === null) {
        await interaction.reply({
          embeds: [
            errorEmbed('Introduce un color hexadecimal válido de 6 dígitos (por ejemplo, 5865F2).'),
          ],
          ephemeral: true,
        });
        return;
      }
      repository.update(interaction.guild.id, { embedColor: value });
      await interaction.reply({
        embeds: [successEmbed('Color actualizado', `Nuevo color: \`#${value}\`.`)],
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
            true,
          ),
        ],
        ephemeral: true,
      });
      return;
    }

    repository.update(interaction.guild.id, { welcomeChannelId: null });
    await interaction.reply({
      embeds: [
        successEmbed('Bienvenidas desactivadas', 'Ya no se enviarán mensajes de bienvenida.'),
      ],
    });
  },
};

export default command;
