import { SlashCommandBuilder, type APIEmbedField } from 'discord.js';
import type { Command, CommandCategory } from '../../types/command.js';
import { createEmbed } from '../../utils/embeds.js';

const categoryTitles: Record<CommandCategory, string> = {
  general: 'General',
  music: 'Music',
  configuration: 'Configuration',
};

const command: Command = {
  category: 'general',
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('List all available commands.')
    .addStringOption((option) =>
      option
        .setName('command')
        .setDescription('Get details about a specific command')
        .setRequired(false)
        .setAutocomplete(true),
    ),

  async autocomplete(interaction, client) {
    const query = interaction.options.getFocused().toLowerCase();
    const choices = [...client.commands.values()]
      .filter((command) => command.data.name.includes(query))
      .slice(0, 25)
      .map((command) => ({
        name: `/${command.data.name} — ${command.data.description}`,
        value: command.data.name,
      }));

    await interaction.respond(choices);
  },

  async execute(interaction, client) {
    const requested = interaction.options.getString('command');

    if (requested) {
      const target = client.commands.get(requested);
      if (!target) {
        await interaction.reply({ content: 'That command does not exist.', ephemeral: true });
        return;
      }

      const options = target.data.toJSON().options ?? [];
      const optionsText = options
        .map((option) => `\`${option.name}\` — ${option.description}`)
        .join('\n');

      await interaction.reply({
        embeds: [
          createEmbed({
            title: `/${target.data.name}`,
            description: target.data.description,
            fields: [
              { name: 'Category', value: categoryTitles[target.category], inline: true },
              {
                name: 'Cooldown',
                value: target.cooldownSeconds ? `${target.cooldownSeconds}s` : 'None',
                inline: true,
              },
              ...(optionsText ? [{ name: 'Options', value: optionsText }] : []),
            ],
            footer: 'PAN BOT',
          }),
        ],
        ephemeral: true,
      });
      return;
    }

    const grouped = new Map<CommandCategory, Command[]>();
    for (const cmd of client.commands.values()) {
      const list = grouped.get(cmd.category) ?? [];
      list.push(cmd);
      grouped.set(cmd.category, list);
    }

    const fields: APIEmbedField[] = [...grouped.entries()].map(([category, commands]) => ({
      name: categoryTitles[category],
      value: commands.map((cmd) => `\`/${cmd.data.name}\` — ${cmd.data.description}`).join('\n'),
    }));

    await interaction.reply({
      embeds: [
        createEmbed({
          title: 'PAN BOT — Command list',
          description: `Use \`/help command:<name>\` for details about a command.`,
          fields,
          footer: `${client.commands.size} commands available`,
        }),
      ],
      ephemeral: true,
    });
  },
};

export default command;
