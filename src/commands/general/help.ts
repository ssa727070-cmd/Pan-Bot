import { SlashCommandBuilder, type APIEmbedField } from 'discord.js';
import type { Command, CommandCategory } from '../../types/command.js';
import { createEmbed } from '../../utils/embeds.js';

const categoryTitles: Record<CommandCategory, string> = {
  general: 'General',
  configuration: '⚙️ Configuración',
  moderation: '🛡️ Moderación',
  welcome: '👋 Bienvenidas',
  tickets: '🎫 Tickets',
  logging: '📝 Registros',
  autoroles: '🎭 Roles automáticos',
  statistics: '📊 Estadísticas',
  suggestions: '💡 Sugerencias',
  automod: '🛡️ AutoMod',
  minecraft: '⛏️ Minecraft',
};

const command: Command = {
  category: 'general',
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Muestra todos los comandos disponibles.')
    .addStringOption((option) =>
      option
        .setName('comando')
        .setDescription('Obtén detalles sobre un comando específico')
        .setRequired(false)
        .setAutocomplete(true),
    ),

  async autocomplete(interaction, client) {
    const query = interaction.options.getFocused().toLowerCase();
    const choices = [...client.commands.values()]
      .filter((cmd) => cmd.data.name.includes(query))
      .slice(0, 25)
      .map((cmd) => ({
        name: `/${cmd.data.name} — ${cmd.data.description}`,
        value: cmd.data.name,
      }));

    await interaction.respond(choices);
  },

  async execute(interaction, client) {
    const requested = interaction.options.getString('comando');

    if (requested) {
      const target = client.commands.get(requested);
      if (!target) {
        await interaction.reply({
          content: 'Ese comando no existe.',
          ephemeral: true,
        });
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
              { name: 'Categoría', value: categoryTitles[target.category], inline: true },
              {
                name: 'Tiempo de espera',
                value: target.cooldownSeconds ? `${target.cooldownSeconds}s` : 'Ninguno',
                inline: true,
              },
              ...(optionsText ? [{ name: 'Opciones', value: optionsText }] : []),
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
          title: 'PAN BOT — Lista de comandos',
          description: 'Usa `/help comando:<nombre>` para ver los detalles de un comando.',
          fields,
          footer: `${client.commands.size} comandos disponibles`,
        }),
      ],
      ephemeral: true,
    });
  },
};

export default command;
