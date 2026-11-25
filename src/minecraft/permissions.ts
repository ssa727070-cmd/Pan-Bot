import type { GuildMember } from 'discord.js';
import { env } from '../config/env.js';
import type { PanClient } from '../core/client.js';
import { MinecraftRepository } from '../database/repositories/minecraftRepository.js';
import { MINECRAFT_LEVEL_RANK, type MinecraftAction, type MinecraftLevel } from './types.js';

const ACTION_LEVEL: Record<MinecraftAction, MinecraftLevel> = {
  status: 'readonly',
  players: 'readonly',
  info: 'readonly',
  version: 'readonly',
  'maintenance-status': 'readonly',
  integrations: 'admin',
  audit: 'admin',
  notifications: 'admin',
  roles: 'admin',
  allowlist: 'admin',
  setup: 'admin',
  'panel-send': 'admin',
  kick: 'moderator',
  mute: 'moderator',
  unmute: 'moderator',
  'whitelist-add': 'moderator',
  'whitelist-remove': 'moderator',
  'whitelist-list': 'moderator',
  pardon: 'moderator',
  time: 'moderator',
  weather: 'moderator',
  difficulty: 'moderator',
  gamemode: 'moderator',
  teleport: 'moderator',
  heal: 'moderator',
  feed: 'moderator',
  xp: 'moderator',
  save: 'moderator',
  gamerules: 'moderator',
  say: 'moderator',
  broadcast: 'moderator',
  announce: 'moderator',
  ban: 'admin',
  op: 'admin',
  deop: 'admin',
  console: 'admin',
  'helper-grant': 'admin',
  'maintenance-enable': 'admin',
  'maintenance-disable': 'admin',
};

export function actionLevel(action: MinecraftAction): MinecraftLevel {
  return ACTION_LEVEL[action];
}

export function isMinecraftLevel(value: unknown): value is MinecraftLevel {
  return typeof value === 'string' && value in MINECRAFT_LEVEL_RANK;
}

/** Discord permission mapping, used only while the guild has no Minecraft roles configured. */
function discordPermissionLevel(member: GuildMember): MinecraftLevel | null {
  if (member.permissions.has('Administrator')) return 'admin';
  if (member.permissions.has('ManageGuild') || member.permissions.has('ModerateMembers')) {
    return 'moderator';
  }
  if (member.permissions.has('ViewAuditLog')) return 'readonly';
  return null;
}

/**
 * Resolves the member's Minecraft level.
 *
 * - The Discord server owner is always `owner`, so the guild can never lock itself out.
 * - Once any Minecraft role is configured the configuration is authoritative: only
 *   those roles grant access and Discord permissions grant nothing.
 * - With no roles configured, Discord permissions are mapped to levels.
 */
export function resolveMinecraftLevel(
  client: PanClient,
  member: GuildMember,
): MinecraftLevel | null {
  if (member.guild.ownerId === member.id) return 'owner';

  const configured = new MinecraftRepository(client.db.sqlite).listRoles(member.guild.id);
  if (configured.length === 0) return discordPermissionLevel(member);

  let level: MinecraftLevel | null = null;
  for (const role of configured) {
    if (!member.roles.cache.has(role.roleId)) continue;
    if (!level || MINECRAFT_LEVEL_RANK[role.level] > MINECRAFT_LEVEL_RANK[level]) {
      level = role.level;
    }
  }
  return level;
}

export function hasMinecraftLevel(
  client: PanClient,
  member: GuildMember,
  required: MinecraftLevel,
): boolean {
  const current = resolveMinecraftLevel(client, member);
  return current !== null && MINECRAFT_LEVEL_RANK[current] >= MINECRAFT_LEVEL_RANK[required];
}

export function canManageMinecraft(
  client: PanClient,
  member: GuildMember,
  action: MinecraftAction,
): boolean {
  return hasMinecraftLevel(client, member, actionLevel(action));
}

/**
 * Owner-only features (unrestricted console): the Discord server owner, or a bot
 * operator listed in BOT_OWNER_IDS. The application/bot ID is never an owner.
 */
export function isMinecraftOwner(
  member: GuildMember,
  botOwnerIds: readonly string[] = env.BOT_OWNER_IDS,
): boolean {
  return member.guild.ownerId === member.id || botOwnerIds.includes(member.id);
}
