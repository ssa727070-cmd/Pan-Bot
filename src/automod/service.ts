import { PermissionFlagsBits, type GuildMember, type Message } from 'discord.js';
import type { PanClient } from '../core/client.js';
import { logger } from '../core/logger.js';
import {
  AutomodRepository,
  type AutomodExemption,
  type AutomodSettings,
} from '../database/repositories/automodRepository.js';
import { notifyLogEvent } from '../logging/logService.js';
import { timeoutDurationMs } from '../moderation/format.js';
import type { AutomodMatch, MessageSample } from './detection.js';

/** Native Discord rules already block these categories when enabled. */
export const NATIVE_COVERED_RULES: ReadonlySet<AutomodMatch['rule']> = new Set([
  'invites',
  'links',
  'words',
  'mentions',
  'frequency',
  'identical',
]);

export class AutomodTracker {
  private readonly history = new Map<string, MessageSample[]>();
  private readonly lastActionAt = new Map<string, number>();
  private readonly maxSamples = 50;

  private key(guildId: string, userId: string): string {
    return `${guildId}:${userId}`;
  }

  public record(guildId: string, userId: string, sample: MessageSample, windowMs: number): void {
    const key = this.key(guildId, userId);
    const current = (this.history.get(key) ?? []).filter(
      (entry) => sample.at - entry.at <= windowMs,
    );
    current.push(sample);
    this.history.set(key, current.slice(-this.maxSamples));
  }

  public recent(guildId: string, userId: string, windowMs: number, now: number): MessageSample[] {
    const key = this.key(guildId, userId);
    const current = this.history.get(key) ?? [];
    const fresh = current.filter((entry) => now - entry.at <= windowMs);
    this.history.set(key, fresh);
    return fresh;
  }

  /** Prevents repeated sanctions for the same burst. */
  public shouldThrottle(guildId: string, userId: string, now: number, cooldownMs = 5000): boolean {
    const key = this.key(guildId, userId);
    const last = this.lastActionAt.get(key) ?? 0;
    if (now - last < cooldownMs) return true;
    this.lastActionAt.set(key, now);
    return false;
  }

  public clear(guildId?: string, userId?: string): void {
    if (!guildId) {
      this.history.clear();
      return;
    }
    if (userId) this.history.delete(this.key(guildId, userId));
    const prefix = `${guildId}:`;
    for (const key of this.history.keys()) {
      if (key.startsWith(prefix)) this.history.delete(key);
    }
  }
}

/** Shared tracker instance; state is per guild + user and never persisted. */
export const automodTracker = new AutomodTracker();

export function isExempt(
  member: GuildMember,
  settings: AutomodSettings,
  exemptions: readonly AutomodExemption[],
  channelId: string | readonly string[],
  isWebhook = false,
): boolean {
  const channelIds = typeof channelId === 'string' ? [channelId] : channelId;
  if (isWebhook) return true;
  if (member.user.bot) return true;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (
    member.permissions.any([
      PermissionFlagsBits.ManageMessages,
      PermissionFlagsBits.BanMembers,
      PermissionFlagsBits.KickMembers,
      PermissionFlagsBits.ModerateMembers,
    ])
  ) {
    return true;
  }
  return exemptions.some(
    (entry) =>
      (entry.type === 'role' && member.roles.cache.has(entry.targetId)) ||
      (entry.type === 'user' && entry.targetId === member.id) ||
      (entry.type === 'channel' && channelIds.includes(entry.targetId)),
  );
}

/**
 * IDs an exemption can match for a message: the channel itself, its parent category, and
 * for threads the parent channel (and that channel's category).
 */
export function channelScopeIds(message: Message): string[] {
  const ids = new Set<string>([message.channelId]);
  const channel = message.channel;
  if ('parentId' in channel && channel.parentId) ids.add(channel.parentId);
  if (channel.isThread()) {
    const parent = channel.parent;
    if (parent?.parentId) ids.add(parent.parentId);
  }
  return [...ids];
}

function repo(client: PanClient): AutomodRepository {
  return new AutomodRepository(client.db.sqlite);
}

/** Applies only the explicitly configured actions, with native-rule duplication avoidance. */
export async function applyAutomodAction(
  client: PanClient,
  message: Message,
  match: AutomodMatch,
  settings: AutomodSettings,
): Promise<string[]> {
  const actions: string[] = [];
  const nativeHandles = settings.nativeRules && NATIVE_COVERED_RULES.has(match.rule);

  if (settings.deleteMessage && !nativeHandles) {
    try {
      await message.delete();
      actions.push('mensaje eliminado');
    } catch {
      // The message may already be gone or protected.
    }
  }

  if (settings.timeoutMinutes > 0 && !nativeHandles && message.member?.moderatable) {
    try {
      await message.member.timeout(
        timeoutDurationMs(settings.timeoutMinutes),
        `AutoMod: ${match.rule}`,
      );
      actions.push(`silenciado ${settings.timeoutMinutes}m`);
    } catch (error) {
      logger.warn({ error, guildId: message.guild?.id }, 'AutoMod timeout failed');
    }
  }

  if (settings.warnUser && !nativeHandles) {
    try {
      await message.author.send(
        `Has recibido una advertencia automática en **${message.guild?.name ?? 'un servidor'}**. Motivo: ${match.detail}.`,
      );
      actions.push('advertencia enviada');
    } catch {
      // DMs may be disabled; this is not a moderation failure.
    }
  }

  if (settings.logIncidents && message.guild) {
    repo(client).logIncident({
      guildId: message.guild.id,
      userId: message.author.id,
      channelId: message.channel.id,
      rule: match.rule,
      action: actions.join(', ') || 'registrado',
      detail: match.detail,
    });
    await notifyLogEvent(client, message.guild.id, 'moderation', 'AutoMod: incidencia', [
      { name: 'Regla', value: match.rule },
      { name: 'Miembro', value: `<@${message.author.id}>` },
      { name: 'Canal', value: `<#${message.channel.id}>` },
      { name: 'Detalle', value: match.detail.slice(0, 200) },
      { name: 'Acciones', value: actions.join(', ') || 'Solo registro' },
    ]);
    actions.push(...(await applyStrikes(client, message, settings)));
  }

  return actions;
}

/**
 * Escalates repeat offenders. It respects the role hierarchy: members the bot cannot
 * moderate or kick are left alone (and the situation is logged) instead of failing silently.
 */
export async function applyStrikes(
  client: PanClient,
  message: Message,
  settings: AutomodSettings,
): Promise<string[]> {
  if (settings.strikeThreshold <= 0 || !message.guild || !message.member) return [];
  const member = message.member;
  const count = repo(client).countRecentIncidents(
    message.guild.id,
    member.id,
    settings.strikeWindowMinutes,
  );
  if (count < settings.strikeThreshold) return [];
  // Only escalate exactly when the threshold is reached to avoid repeating the sanction.
  if (count > settings.strikeThreshold) return [];

  try {
    if (settings.strikeAction === 'kick') {
      if (!member.kickable) {
        logger.warn({ guildId: message.guild.id }, 'AutoMod strike: member is not kickable');
        return ['sin expulsar (jerarquía)'];
      }
      await member.kick(`AutoMod: ${count} incidencias en ${settings.strikeWindowMinutes} min`);
      return ['expulsado por reincidencia'];
    }
    if (!member.moderatable) {
      logger.warn({ guildId: message.guild.id }, 'AutoMod strike: member is not moderatable');
      return ['sin silenciar (jerarquía)'];
    }
    await member.timeout(
      timeoutDurationMs(settings.strikeTimeoutMinutes),
      `AutoMod: ${count} incidencias en ${settings.strikeWindowMinutes} min`,
    );
    return [`silenciado ${settings.strikeTimeoutMinutes}m por reincidencia`];
  } catch (error) {
    logger.warn({ error, guildId: message.guild.id }, 'AutoMod strike failed');
    return [];
  }
}
