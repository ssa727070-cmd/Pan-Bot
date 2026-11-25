import type { Message } from 'discord.js';
import type { PanClient } from '../core/client.js';
import { AutomodRepository } from '../database/repositories/automodRepository.js';
import { analyzeMessage } from './detection.js';
import { applyAutomodAction, automodTracker, channelScopeIds, isExempt } from './service.js';

/** Messages edited later than this after creation are not re-scanned. */
const EDIT_SCAN_WINDOW_MS = 10 * 60 * 1000;

/**
 * Runs the AutoMod rules for one message. Used for new messages and for edits (so a
 * filter cannot be bypassed by posting something harmless and editing it afterwards).
 * Limits: Discord only delivers message content to the bot when the Message Content
 * intent is enabled, and private threads the bot has not joined send no events at all.
 */
export async function runAutomod(
  client: PanClient,
  message: Message,
  options: { edited?: boolean } = {},
): Promise<boolean> {
  if (!message.guild || message.author.bot || message.system || message.webhookId) return false;
  if (options.edited && Date.now() - message.createdTimestamp > EDIT_SCAN_WINDOW_MS) return false;

  const guildId = message.guild.id;
  const automod = new AutomodRepository(client.db.sqlite);
  const settings = automod.getSettings(guildId);
  if (!settings.enabled) return false;

  const member =
    message.member ?? (await message.guild.members.fetch(message.author.id).catch(() => null));
  if (!member) return false;

  if (isExempt(member, settings, automod.listExemptions(guildId), channelScopeIds(message))) {
    return false;
  }

  const now = Date.now();
  const windowMs = settings.spamWindowSeconds * 1000;
  const history = automodTracker.recent(guildId, message.author.id, windowMs, now);
  const match = analyzeMessage({
    content: message.content,
    mentionCount: message.mentions.users.size,
    broadMentions:
      message.mentions.roles.size + (/@(?:everyone|here)\b/.test(message.content) ? 5 : 0),
    now,
    // An edit is not a new message: scan it against history but do not add to the burst.
    history,
    settings,
    words: automod.listWords(guildId),
    lists: automod.getLists(guildId),
  });
  if (!options.edited) {
    automodTracker.record(
      guildId,
      message.author.id,
      { content: message.content, at: now },
      windowMs,
    );
  }

  if (!match || automodTracker.shouldThrottle(guildId, message.author.id, now)) return false;
  await applyAutomodAction(client, message, match, settings);
  return true;
}
