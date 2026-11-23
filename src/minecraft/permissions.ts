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
  'maintenance-enable': 'admin',
  'maintenance-disable': 'admin',
};

export function actionLevel(action: MinecraftAction): MinecraftLevel {
  return ACTION_LEVEL[action];
}

function hasDiscordFallback(member: GuildMember, level: MinecraftLevel): boolean {
  if (member.guild.ownerId === member.id) return true;
  if (member.permissions.has('Administrator'))
    return level !== 'owner' || member.guild.ownerId === member.id;
  if (level === 'moderator')
    return member.permissions.has('ManageGuild') || member.permissions.has('ModerateMembers');
  if (level === 'readonly') {
    return (
      member.permissions.has('ManageGuild') ||
      member.permissions.has('ModerateMembers') ||
      member.permissions.has('ViewAuditLog')
    );
  }
  return false;
}

/** Explicit configured roles take precedence; fall back to Discord permissions if none are configured. */
export function resolveMinecraftLevel(
  client: PanClient,
  member: GuildMember,
): MinecraftLevel | null {
  const repository = new MinecraftRepository(client.db.sqlite);
  const configured = repository.listRoles(member.guild.id);
  if (configured.length > 0) {
    let level: MinecraftLevel | null = null;
    for (const role of configured) {
      if (!member.roles.cache.has(role.roleId)) continue;
      if (!level || MINECRAFT_LEVEL_RANK[role.level] > MINECRAFT_LEVEL_RANK[level]) {
        level = role.level;
      }
    }
    return level;
  }

  if (member.guild.ownerId === member.id) return 'owner';
  if (member.permissions.has('Administrator')) return 'admin';
  if (member.permissions.has('ManageGuild') || member.permissions.has('ModerateMembers')) {
    return 'moderator';
  }
  return null;
}

export function canManageMinecraft(
  client: PanClient,
  member: GuildMember,
  action: MinecraftAction,
): boolean {
  const required = actionLevel(action);
  const current = resolveMinecraftLevel(client, member);
  if (!current) return hasDiscordFallback(member, required);
  return MINECRAFT_LEVEL_RANK[current] >= MINECRAFT_LEVEL_RANK[required];
}

export function isApplicationOwner(member: GuildMember): boolean {
  // Discord server owner is the authoritative owner inside the guild; this also
  // gates unrestricted console mode without storing a separate bot-owner ID.
  return member.guild.ownerId === member.id || member.user.id === env.DISCORD_CLIENT_ID;
}
