import type { AutomodLists, AutomodSettings } from '../database/repositories/automodRepository.js';
import {
  basicFold,
  capsRatio,
  diceSimilarity,
  evasionVariants,
  extractHosts,
  extractInviteCodes,
  hostMatches,
  longestCombiningRun,
} from './text.js';

export interface MessageSample {
  content: string;
  at: number;
}

export interface AutomodMatch {
  rule:
    | 'frequency'
    | 'identical'
    | 'mentions'
    | 'invites'
    | 'links'
    | 'words'
    | 'repeated'
    | 'flood'
    | 'similar'
    | 'caps';
  detail: string;
}

export interface AnalyzeInput {
  content: string;
  mentionCount: number;
  now: number;
  history: readonly MessageSample[];
  settings: AutomodSettings;
  words: readonly string[];
  /** Per-guild allow/deny lists. Optional so v1.1 callers keep working. */
  lists?: AutomodLists;
  /** Pings that reach more than one person without being user mentions (roles, @everyone). */
  broadMentions?: number;
}

const EMPTY_LISTS: AutomodLists = {
  wordAllow: [],
  domainAllow: [],
  domainBlock: [],
  inviteAllow: [],
};

/** Threshold multipliers by sensitivity; level 2 keeps the exact v1.1 behaviour. */
const IDENTICAL_BY_LEVEL: Record<number, number> = { 1: 4, 2: 3, 3: 2 };
const REPEAT_BY_LEVEL: Record<number, number> = { 1: 9, 2: 5, 3: 4 };
const SIMILAR_BY_LEVEL: Record<number, { ratio: number; count: number }> = {
  1: { ratio: 0.92, count: 5 },
  2: { ratio: 0.85, count: 4 },
  3: { ratio: 0.75, count: 3 },
};
const CAPS_BY_LEVEL: Record<number, { ratio: number; letters: number }> = {
  1: { ratio: 0.9, letters: 20 },
  2: { ratio: 0.75, letters: 12 },
  3: { ratio: 0.6, letters: 8 },
};
const FLOOD_BY_LEVEL: Record<number, { lines: number; chars: number }> = {
  1: { lines: 25, chars: 1800 },
  2: { lines: 15, chars: 1200 },
  3: { lines: 8, chars: 700 },
};

function level(settings: AutomodSettings): number {
  return Math.min(3, Math.max(1, settings.sensitivity ?? 2));
}

/** Bounded, literal-safe patterns. No user input is ever compiled into a regular expression. */
const INVITE_PATTERN =
  /(?:https?:\/\/)?(?:www\.)?(?:discord\.(?:gg|io|me|li)|discord(?:app)?\.com\/invite)\/[\w-]{2,}/i;
const LINK_PATTERN = /https?:\/\/[^\s<]+/i;

export function normalizeContent(content: string): string {
  return content
    .toLowerCase()
    .replace(/[\u200b-\u200f\u2060\ufeff]/g, '')
    .trim();
}

/** Removes allow-listed words so "class" does not trip a rule for "ass". */
function stripAllowed(text: string, allowed: readonly string[]): string {
  let result = text;
  for (const word of allowed) {
    const folded = basicFold(word);
    if (folded) result = result.split(folded).join(' ');
  }
  return result;
}

function blockedWordMatch(
  content: string,
  words: readonly string[],
  lists: AutomodLists,
  evasion: boolean,
): AutomodMatch | null {
  const plain = stripAllowed(normalizeContent(content), lists.wordAllow);
  const folded = words.map((word) => normalizeContent(word)).filter((word) => word.length > 0);

  if (folded.some((word) => plain.includes(word))) {
    return { rule: 'words', detail: 'Palabra bloqueada detectada' };
  }
  if (!evasion) return null;

  const variants = evasionVariants(content);
  const spaced = stripAllowed(variants.spaced, lists.wordAllow);
  const joined = stripAllowed(
    variants.joined,
    lists.wordAllow.map((word) => word.replace(/\s+/g, '')),
  );
  for (const word of folded) {
    const target = evasionVariants(word).joined;
    if (target.length < 3) continue; // very short words would match inside normal text
    if (spaced.includes(target) || joined.includes(target)) {
      return { rule: 'words', detail: 'Palabra bloqueada detectada (evasión de filtro)' };
    }
  }
  return null;
}

/** Pure rule evaluation. Only the first matching rule is returned to avoid duplicate actions. */
export function analyzeMessage(input: AnalyzeInput): AutomodMatch | null {
  const { content, mentionCount, now, history, settings, words } = input;
  const lists = input.lists ?? EMPTY_LISTS;
  const lvl = level(settings);
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
    const needed = IDENTICAL_BY_LEVEL[lvl] ?? 3;
    if (identical.length >= needed) {
      return { rule: 'identical', detail: `${identical.length} mensajes idénticos` };
    }
  }

  if (settings.similarEnabled && normalized.length >= 8) {
    const { ratio, count } = SIMILAR_BY_LEVEL[lvl] ?? { ratio: 0.85, count: 4 };
    const folded = basicFold(content);
    const similar = recent.filter(
      (sample) => diceSimilarity(basicFold(sample.content), folded) >= ratio,
    );
    if (similar.length >= count) {
      return { rule: 'similar', detail: `${similar.length} mensajes muy parecidos` };
    }
  }

  const broad = input.broadMentions ?? 0;
  if (
    (settings.mentionsEnabled || settings.spamMentions) &&
    mentionCount + broad >= settings.spamMaxMentions &&
    settings.spamMaxMentions > 0
  ) {
    return { rule: 'mentions', detail: `${mentionCount + broad} menciones` };
  }

  if (settings.invitesEnabled) {
    const codes = extractInviteCodes(content);
    const blocked = codes.filter((code) => !lists.inviteAllow.includes(code));
    if (blocked.length > 0 || (codes.length === 0 && INVITE_PATTERN.test(content))) {
      return { rule: 'invites', detail: 'Invitación de Discord detectada' };
    }
  }

  const hosts = extractHosts(content);
  const denied = hosts.find((host) =>
    lists.domainBlock.some((domain) => hostMatches(host, domain)),
  );
  if (denied) {
    return { rule: 'links', detail: `Dominio bloqueado: ${denied}` };
  }
  if (settings.linksEnabled && LINK_PATTERN.test(content)) {
    const allHostsAllowed =
      hosts.length > 0 &&
      hosts.every((host) => lists.domainAllow.some((domain) => hostMatches(host, domain)));
    if (!allHostsAllowed) return { rule: 'links', detail: 'Enlace externo detectado' };
  }

  if (settings.wordsEnabled && words.length > 0) {
    const found = blockedWordMatch(content, words, lists, settings.evasionEnabled);
    if (found) return found;
  }

  if (settings.floodEnabled) {
    const limits = FLOOD_BY_LEVEL[lvl] ?? { lines: 15, chars: 1200 };
    const lines = content.split('\n').length;
    if (lines >= limits.lines || content.length >= limits.chars) {
      return {
        rule: 'flood',
        detail: `Mensaje demasiado largo (${lines} líneas, ${content.length} caracteres)`,
      };
    }
  }

  if (settings.capsEnabled) {
    const limits = CAPS_BY_LEVEL[lvl] ?? { ratio: 0.75, letters: 12 };
    const caps = capsRatio(content);
    if (caps.letters >= limits.letters && caps.ratio >= limits.ratio) {
      return { rule: 'caps', detail: 'Exceso de mayúsculas' };
    }
  }

  if (settings.repeatedCharsEnabled) {
    const run = REPEAT_BY_LEVEL[lvl] ?? 5;
    // `run` is a number from a fixed table, never user input.
    if (new RegExp(`(.)\\1{${run},}`, 'u').test(content)) {
      return { rule: 'repeated', detail: 'Caracteres repetidos en exceso' };
    }
    if (longestCombiningRun(content) >= 6) {
      return { rule: 'repeated', detail: 'Texto con símbolos combinados en exceso' };
    }
  }

  return null;
}
