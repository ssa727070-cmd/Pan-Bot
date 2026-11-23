import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
} from 'discord.js';
import type { PanClient } from '../core/client.js';

export type CommandCategory =
  'general' | 'configuration' | 'moderation' | 'welcome' | 'tickets' | 'logging';

/** Contract shared by every slash command in src/commands. */
export interface Command {
  data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder;
  category: CommandCategory;
  cooldownSeconds?: number;
  ownerOnly?: boolean;
  execute(interaction: ChatInputCommandInteraction, client: PanClient): Promise<void>;
  autocomplete?(interaction: AutocompleteInteraction, client: PanClient): Promise<void>;
}
