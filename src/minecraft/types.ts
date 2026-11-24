import type {
  ButtonInteraction,
  ChatInputCommandInteraction,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
} from 'discord.js';

/** Permission tiers used by every Minecraft Discord command and panel interaction. */
export type MinecraftLevel = 'readonly' | 'moderator' | 'admin' | 'owner';

export const MINECRAFT_LEVEL_RANK: Record<MinecraftLevel, number> = {
  readonly: 1,
  moderator: 2,
  admin: 3,
  owner: 4,
};

export type MinecraftPanelKind =
  'overview' | 'status' | 'players' | 'players-admin' | 'server-admin' | 'maintenance';

export type MinecraftInteraction =
  | ChatInputCommandInteraction
  | ButtonInteraction
  | StringSelectMenuInteraction
  | ModalSubmitInteraction;

/** Every action exposed by /mc and /mcadmin. */
export type MinecraftAction =
  | 'status'
  | 'players'
  | 'info'
  | 'version'
  | 'kick'
  | 'ban'
  | 'pardon'
  | 'whitelist-add'
  | 'whitelist-remove'
  | 'whitelist-list'
  | 'op'
  | 'deop'
  | 'mute'
  | 'unmute'
  | 'time'
  | 'weather'
  | 'difficulty'
  | 'gamemode'
  | 'teleport'
  | 'heal'
  | 'feed'
  | 'xp'
  | 'save'
  | 'gamerules'
  | 'say'
  | 'broadcast'
  | 'announce'
  | 'console'
  | 'panel-send'
  | 'maintenance-enable'
  | 'maintenance-disable'
  | 'maintenance-status'
  | 'notifications'
  | 'roles'
  | 'allowlist'
  | 'audit'
  | 'integrations'
  | 'setup';

export interface MinecraftStatus {
  host: string;
  port: number;
  version: string;
  protocol: number | null;
  software: string;
  motd: string;
  playersOnline: number;
  playersMax: number;
  playerNames: string[];
  latencyMs: number | null;
}

export interface MinecraftActionOptions {
  player?: string;
  reason?: string;
  message?: string;
  value?: string;
  /** Gamerule name for `gamerules`. */
  gamerule?: string;
  /** Optional new gamerule value; omitted means "query". */
  gameruleValue?: string;
  action?: string;
  detail?: string;
  amount?: number;
  mode?: string;
  target?: string;
  destination?: string;
  enabled?: boolean;
  whitelist?: boolean;
  channelId?: string | null;
  interval?: number;
  command?: string;
  confirmToken?: string;
  ephemeral?: boolean;
}

export interface MinecraftActionResult {
  embeds: import('discord.js').EmbedBuilder[];
  components?: import('discord.js').ActionRowBuilder<
    import('discord.js').ButtonBuilder | import('discord.js').StringSelectMenuBuilder
  >[];
  ephemeral?: boolean;
}
