import { Client, Collection, GatewayIntentBits, Partials } from 'discord.js';
import type { PanDatabase } from '../database/client.js';
import type { Command } from '../types/command.js';

/** The extended Discord client with PAN BOT's shared services attached. */
export class PanClient extends Client {
  public readonly commands = new Collection<string, Command>();
  public readonly cooldowns = new Collection<string, Collection<string, number>>();
  public db!: PanDatabase;
  public startedAt = new Date();

  public constructor() {
    super({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
      partials: [Partials.Message, Partials.Channel],
    });
  }
}
