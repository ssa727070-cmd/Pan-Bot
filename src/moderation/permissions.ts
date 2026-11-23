import type { Guild, GuildBasedChannel, GuildMember, PermissionResolvable } from 'discord.js';

export interface ModerationCheckOptions {
  guild: Guild;
  moderator: GuildMember;
  bot: GuildMember | null;
  target?: GuildMember | null;
  permission: PermissionResolvable;
  permissionName: string;
}

/** Returns a Spanish error message when the moderation action is not allowed, or null when it is. */
export function validateModerationAction(options: ModerationCheckOptions): string | null {
  const { guild, moderator, bot, target, permission, permissionName } = options;

  if (!moderator.permissions.has(permission)) {
    return `No tienes el permiso **${permissionName}** necesario para realizar esta acción.`;
  }

  if (!bot) {
    return 'No pude verificar mis permisos en este servidor. Inténtalo de nuevo.';
  }

  if (!bot.permissions.has(permission)) {
    return `No tengo el permiso **${permissionName}** necesario para realizar esta acción.`;
  }

  if (!target) return null;

  if (target.id === guild.ownerId) {
    return 'No puedes moderar al dueño del servidor.';
  }

  if (target.id === moderator.id) {
    return 'No puedes moderarte a ti mismo.';
  }

  if (target.id === bot.id) {
    return 'No puedo moderarme a mí mismo.';
  }

  const moderatorIsOwner = moderator.id === guild.ownerId;
  if (!moderatorIsOwner && moderator.roles.highest.position <= target.roles.highest.position) {
    return 'No puedes moderar a un miembro con un rol igual o superior al tuyo.';
  }

  if (bot.roles.highest.position <= target.roles.highest.position) {
    return 'No puedo moderar a un miembro con un rol igual o superior al mío.';
  }

  return null;
}

/** Channel-scoped permission validation (used by /clear, /slowmode, /lock and /unlock). */
export function validateChannelPermission(
  member: GuildMember,
  channel: GuildBasedChannel,
  permission: PermissionResolvable,
  permissionName: string,
): string | null {
  const permissions = channel.permissionsFor(member);
  if (!permissions?.has(permission)) {
    return `Necesitas el permiso **${permissionName}** en ${channel} para realizar esta acción.`;
  }
  return null;
}
