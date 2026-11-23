import { Collection, Events, type Interaction } from 'discord.js';
import { env } from '../config/env.js';
import type { PanClient } from '../core/client.js';
import { logger } from '../core/logger.js';
import { GuildSettingsRepository } from '../database/repositories/guildSettings.js';
import type { BotEvent } from '../types/event.js';
import { errorEmbed } from '../utils/embeds.js';

async function fail(interaction: Interaction, description: string): Promise<void> {
  const embed = errorEmbed(description);
  try {
    if (interaction.isRepliable()) {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ embeds: [embed] });
      } else {
        await interaction.reply({ embeds: [embed], ephemeral: true });
      }
    }
  } catch (error) {
    logger.error({ error }, 'Could not send interaction error response');
  }
}

const event: BotEvent = {
  name: Events.InteractionCreate,

  async execute(interaction: Interaction) {
    const client = interaction.client as PanClient;

    if (interaction.isAutocomplete()) {
      const command = client.commands.get(interaction.commandName);
      if (!command?.autocomplete) return;

      try {
        await command.autocomplete(interaction, client);
      } catch (error) {
        logger.error({ error, command: interaction.commandName }, 'Autocomplete failed');
      }
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) {
      await fail(interaction, 'This command is not registered.');
      return;
    }

    if (!interaction.inGuild()) {
      await fail(interaction, 'This command can only be used in a server.');
      return;
    }

    if (command.category === 'music') {
      const settings = new GuildSettingsRepository(client.db.sqlite, env.DEFAULT_VOLUME).get(
        interaction.guildId,
      );
      if (settings.musicChannelId && settings.musicChannelId !== interaction.channelId) {
        await fail(interaction, `Music commands are limited to <#${settings.musicChannelId}>.`);
        return;
      }
    }

    if (command.cooldownSeconds) {
      const perUser = client.cooldowns.get(command.data.name) ?? new Collection<string, number>();
      const expiresAt = perUser.get(interaction.user.id) ?? 0;

      if (expiresAt > Date.now()) {
        const seconds = ((expiresAt - Date.now()) / 1000).toFixed(1);
        await fail(
          interaction,
          `Please wait ${seconds}s before using \`/${command.data.name}\` again.`,
        );
        return;
      }

      perUser.set(interaction.user.id, Date.now() + command.cooldownSeconds * 1000);
      client.cooldowns.set(command.data.name, perUser);
    }

    try {
      await command.execute(interaction, client);
    } catch (error) {
      logger.error({ error, command: command.data.name }, 'Command execution failed');
      await fail(interaction, 'Something went wrong while running this command. Please try again.');
    }
  },
};

export default event;
