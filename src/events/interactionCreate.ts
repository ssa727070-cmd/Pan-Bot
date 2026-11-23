import { Collection, Events, type Interaction } from 'discord.js';
import type { PanClient } from '../core/client.js';
import { logger } from '../core/logger.js';
import { claimTicket, closeTicket, createTopicModal, openTicket } from '../tickets/service.js';
import {
  TICKET_CLAIM,
  TICKET_CLOSE,
  TICKET_CREATE,
  TICKET_TOPIC_INPUT,
  TICKET_TOPIC_MODAL,
} from '../tickets/constants.js';
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
    logger.error({ error }, 'No se pudo enviar la respuesta de error');
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
        logger.error({ error, command: interaction.commandName }, 'Falló la autocompletación');
      }
      return;
    }

    if (interaction.isButton()) {
      if (!interaction.inGuild()) return;
      try {
        if (interaction.customId === TICKET_CREATE) {
          await interaction.showModal(createTopicModal());
          return;
        }
        if (interaction.customId === TICKET_CLAIM) {
          await claimTicket(client, interaction);
          return;
        }
        if (interaction.customId === TICKET_CLOSE) {
          await closeTicket(client, interaction);
          return;
        }
      } catch (error) {
        logger.error({ error, customId: interaction.customId }, 'Falló el botón de interacción');
        await fail(interaction, 'No se pudo completar la acción. Inténtalo de nuevo.');
      }
      return;
    }

    if (interaction.isModalSubmit()) {
      if (!interaction.inGuild()) return;
      try {
        if (interaction.customId === TICKET_TOPIC_MODAL) {
          const topic = interaction.fields.getTextInputValue(TICKET_TOPIC_INPUT);
          await openTicket(client, interaction, topic);
        }
      } catch (error) {
        logger.error({ error, customId: interaction.customId }, 'Falló el formulario');
        await fail(interaction, 'No se pudo completar la acción. Inténtalo de nuevo.');
      }
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) {
      await fail(interaction, 'Este comando no está registrado.');
      return;
    }

    if (!interaction.inGuild()) {
      await fail(interaction, 'Este comando solo se puede usar en un servidor.');
      return;
    }

    if (command.cooldownSeconds) {
      const perUser = client.cooldowns.get(command.data.name) ?? new Collection<string, number>();
      const expiresAt = perUser.get(interaction.user.id) ?? 0;

      if (expiresAt > Date.now()) {
        const seconds = ((expiresAt - Date.now()) / 1000).toFixed(1);
        await fail(
          interaction,
          `Espera ${seconds}s antes de usar \`/${command.data.name}\` de nuevo.`,
        );
        return;
      }

      perUser.set(interaction.user.id, Date.now() + command.cooldownSeconds * 1000);
      client.cooldowns.set(command.data.name, perUser);
    }

    try {
      await command.execute(interaction, client);
    } catch (error) {
      logger.error({ error, command: command.data.name }, 'Falló la ejecución del comando');
      await fail(interaction, 'Algo salió mal al ejecutar el comando. Inténtalo de nuevo.');
    }
  },
};

export default event;
