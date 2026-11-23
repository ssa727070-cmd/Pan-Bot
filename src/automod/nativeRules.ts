import {
  AutoModerationActionType,
  AutoModerationRuleEventType,
  AutoModerationRuleTriggerType,
  PermissionFlagsBits,
  type Guild,
} from 'discord.js';
import type { PanClient } from '../core/client.js';
import { logger } from '../core/logger.js';
import {
  AutomodRepository,
  type AutomodSettings,
} from '../database/repositories/automodRepository.js';
import { GuildSettingsRepository } from '../database/repositories/guildSettings.js';

const RULE_PREFIX = 'PAN BOT · ';

interface NativeRuleDefinition {
  name: string;
  triggerType: (typeof AutoModerationRuleTriggerType)[keyof typeof AutoModerationRuleTriggerType];
  metadata?: { keywordFilter?: string[]; mentionTotalLimit?: number };
}

function definitions(settings: AutomodSettings, words: string[]): NativeRuleDefinition[] {
  const rules: NativeRuleDefinition[] = [];
  if (settings.spamEnabled) {
    rules.push({ name: `${RULE_PREFIX}Spam`, triggerType: AutoModerationRuleTriggerType.Spam });
  }
  if (settings.mentionsEnabled || settings.spamMentions) {
    rules.push({
      name: `${RULE_PREFIX}Menciones`,
      triggerType: AutoModerationRuleTriggerType.MentionSpam,
      metadata: { mentionTotalLimit: Math.max(2, settings.spamMaxMentions) },
    });
  }
  if (settings.invitesEnabled) {
    rules.push({
      name: `${RULE_PREFIX}Invitaciones`,
      triggerType: AutoModerationRuleTriggerType.Keyword,
      metadata: { keywordFilter: ['discord.gg/', 'discord.com/invite/', 'discordapp.com/invite/'] },
    });
  }
  if (settings.wordsEnabled && words.length > 0) {
    rules.push({
      name: `${RULE_PREFIX}Palabras bloqueadas`,
      triggerType: AutoModerationRuleTriggerType.Keyword,
      metadata: { keywordFilter: words.slice(0, 20) },
    });
  }
  return rules;
}

/**
 * Creates/removes Discord-native AutoMod rules. Native rules complement custom filtering:
 * when nativeRules is enabled, custom actions skip categories Discord already blocks.
 */
export async function syncNativeRules(
  client: PanClient,
  guild: Guild,
  settings: AutomodSettings,
): Promise<void> {
  if (!guild.members.me?.permissions.has(PermissionFlagsBits.ManageGuild)) {
    logger.warn({ guildId: guild.id }, 'Missing ManageGuild for native AutoMod rules');
    return;
  }

  let managed: Array<{ id: string; name: string }>;
  try {
    const fetched = await guild.autoModerationRules.fetch();
    managed = [...fetched.values()]
      .filter((rule) => rule.name.startsWith(RULE_PREFIX))
      .map((rule) => ({ id: rule.id, name: rule.name }));
  } catch (error) {
    logger.warn({ error, guildId: guild.id }, 'Could not fetch native AutoMod rules');
    return;
  }

  if (!settings.nativeRules) {
    for (const rule of managed) {
      try {
        await guild.autoModerationRules.delete(rule.id, 'PAN BOT AutoMod desactivado');
      } catch (error) {
        logger.warn({ error, guildId: guild.id }, 'Could not delete native AutoMod rule');
      }
    }
    return;
  }

  const existingNames = new Set(managed.map((rule) => rule.name));
  const words = new AutomodRepository(client.db.sqlite).listWords(guild.id);
  const logChannelId = new GuildSettingsRepository(client.db.sqlite).get(guild.id).logChannelId;

  for (const definition of definitions(settings, words)) {
    if (existingNames.has(definition.name)) continue;

    const actions = [
      { type: AutoModerationActionType.BlockMessage },
      ...(logChannelId
        ? [{ type: AutoModerationActionType.SendAlertMessage, metadata: { channel: logChannelId } }]
        : []),
    ];

    try {
      await guild.autoModerationRules.create({
        name: definition.name,
        eventType: AutoModerationRuleEventType.MessageSend,
        triggerType: definition.triggerType,
        triggerMetadata: definition.metadata,
        actions,
        enabled: true,
        reason: 'PAN BOT AutoMod',
      });
    } catch (error) {
      logger.warn(
        { error, guildId: guild.id, rule: definition.name },
        'Could not create native AutoMod rule',
      );
    }
  }
}
