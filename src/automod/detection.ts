import type { AutomodSettings } from '../database/repositories/automodRepository.js';

export interface MessageSample {
  content: string;
  at: number;
}

export interface AutomodMatch {
  rule: 'frequency' | 'identical' | 'mentions' | 'invites' | 'links' | 'words' | 'repeated';
  detail: string;
}

export interface AnalyzeInput {
  content: string;
  mentionCount: number;
  now: number;
  history: readonly MessageSample[];
  settings: AutomodSettings;
  words: readonly string[];
}

/** Bounded, literal-safe patterns. No user input is ever compiled into a regular expression. */
const INVITE_PATTERN =
  /(?:https?:\/\/)?(?:www\.)?(?:discord\.(?:gg|io|me|li)|discord(?:app)?\.com\/invite)\/[\w-]{2,}/i;
const LINK_PATTERN = /https?:\/\/[^\s<]+/i;
const REPEATED_CHAR_PATTERN = /(.)\1{5,}/u;

export function normalizeContent(content: string): string {
  return content
    .toLowerCase()
    .replace(/[\u200b-\u200f\u2060\ufeff]/g, '')
    .trim();
}

/** Pure rule evaluation. Only the first matching rule is returned to avoid duplicate actions. */
export function analyzeMessage(input: AnalyzeInput): AutomodMatch | null {
  const { content, mentionCount, now, history, settings, words } = input;
  const normalized = normalizeContent(content);
  if (!normalized) return null;

  const windowMs = settings.spamWindowSeconds * 1000;
  const recent = [...history, { content, at: now }].filter((sample) => now - sample.at <= windowMs);

  if (
    settings.spamEnabled &&
    recent.length >= settings.spamMaxMessages &&
    settings.spamMaxMessages > 0
  ) {
    return {
      rule: 'frequency',
      detail: `${recent.length} mensajes en ${settings.spamWindowSeconds}s`,
    };
  }

  if (settings.spamIdentical) {
    const identical = recent.filter((sample) => normalizeContent(sample.content) === normalized);
    if (identical.length >= 3) {
      return { rule: 'identical', detail: `${identical.length} mensajes idénticos` };
    }
  }

  if (
    (settings.mentionsEnabled || settings.spamMentions) &&
    mentionCount >= settings.spamMaxMentions &&
    settings.spamMaxMentions > 0
  ) {
    return { rule: 'mentions', detail: `${mentionCount} menciones` };
  }

  if (settings.invitesEnabled && INVITE_PATTERN.test(content)) {
    return { rule: 'invites', detail: 'Invitación de Discord detectada' };
  }

  if (settings.linksEnabled && LINK_PATTERN.test(content)) {
    return { rule: 'links', detail: 'Enlace externo detectado' };
  }

  if (settings.wordsEnabled && words.length > 0) {
    const found = words.find((word) => normalized.includes(normalizeContent(word)));
    if (found) return { rule: 'words', detail: 'Palabra bloqueada detectada' };
  }

  if (settings.repeatedCharsEnabled && REPEATED_CHAR_PATTERN.test(content)) {
    return { rule: 'repeated', detail: 'Caracteres repetidos en exceso' };
  }

  return null;
}
