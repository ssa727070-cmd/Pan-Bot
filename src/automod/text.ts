/**
 * Pure text helpers for AutoMod. Nothing here compiles user input into a regular
 * expression and every loop is bounded by the (already length-limited) message size.
 */

const LEET: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '8': 'b',
  '@': 'a',
  $: 's',
  '!': 'i',
  '|': 'i',
  '€': 'e',
  '£': 'l',
};

/** Common look-alike letters (Cyrillic/Greek/full-width) mapped to Latin. */
const HOMOGLYPHS: Record<string, string> = {
  а: 'a',
  е: 'e',
  о: 'o',
  р: 'p',
  с: 'c',
  у: 'y',
  х: 'x',
  і: 'i',
  ј: 'j',
  ѕ: 's',
  ο: 'o',
  α: 'a',
  ε: 'e',
  ι: 'i',
  κ: 'k',
  ν: 'v',
  ρ: 'p',
  τ: 't',
  υ: 'u',
};

/* eslint-disable no-misleading-character-class -- these zero-width/combining code points are exactly what we strip. */
const INVISIBLE =
  /[\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180E\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g;
/* eslint-enable no-misleading-character-class */
const COMBINING = /\p{M}/gu;

/** Lowercases, strips invisible characters and diacritics, and maps fullwidth forms to ASCII. */
export function basicFold(content: string): string {
  return content
    .normalize('NFKD')
    .replace(INVISIBLE, '')
    .replace(COMBINING, '')
    .toLowerCase()
    .trim();
}

/** Collapses runs of the same character to at most `max` (default 2). */
export function collapseRepeats(text: string, max = 2): string {
  let out = '';
  let last = '';
  let run = 0;
  for (const char of text) {
    if (char === last) {
      run += 1;
      if (run > max) continue;
    } else {
      last = char;
      run = 1;
    }
    out += char;
  }
  return out;
}

/**
 * Aggressive normalisation used only when the "evasion" option is on. Returns variants
 * that are each compared against the blocked-word list:
 *  - `spaced`: leetspeak/homoglyphs folded, punctuation turned into spaces
 *  - `joined`: the same with every separator removed (catches "p u t a" and "p.u.t.a")
 */
export function evasionVariants(content: string): { spaced: string; joined: string } {
  let mapped = '';
  for (const char of basicFold(content)) {
    mapped += HOMOGLYPHS[char] ?? LEET[char] ?? char;
  }
  const collapsed = collapseRepeats(mapped, 2);
  const spaced = collapsed.replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const joined = spaced.replace(/\s+/g, '');
  return { spaced, joined };
}

/** Sørensen–Dice coefficient over character bigrams, in [0, 1]. */
export function diceSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const grams = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i += 1) {
    const gram = a.slice(i, i + 2);
    grams.set(gram, (grams.get(gram) ?? 0) + 1);
  }
  let overlap = 0;
  for (let i = 0; i < b.length - 1; i += 1) {
    const gram = b.slice(i, i + 2);
    const count = grams.get(gram) ?? 0;
    if (count > 0) {
      grams.set(gram, count - 1);
      overlap += 1;
    }
  }
  return (2 * overlap) / (a.length - 1 + (b.length - 1));
}

const URL_PATTERN = /(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,24}(?::\d{1,5})?(?:\/[^\s<>]*)?/gi;

/** Extracts lowercase hostnames from text (with or without scheme). Bounded to 20 results. */
export function extractHosts(content: string): string[] {
  const hosts: string[] = [];
  for (const match of content.matchAll(URL_PATTERN)) {
    const raw = match[0].replace(/^https?:\/\//i, '');
    const host = raw
      .split(/[/:]/, 1)[0]
      ?.toLowerCase()
      .replace(/^www\./, '');
    if (host && !hosts.includes(host)) hosts.push(host);
    if (hosts.length >= 20) break;
  }
  return hosts;
}

/** True when `host` is the domain or a subdomain of it. */
export function hostMatches(host: string, domain: string): boolean {
  const clean = domain.toLowerCase().replace(/^www\./, '');
  return host === clean || host.endsWith(`.${clean}`);
}

const INVITE_CODE = /(?:discord\.(?:gg|io|me|li)|discord(?:app)?\.com\/invite)\/([\w-]{2,32})/gi;

/** Invite codes (lowercase) found in the text. */
export function extractInviteCodes(content: string): string[] {
  const codes: string[] = [];
  for (const match of content.matchAll(INVITE_CODE)) {
    const code = match[1]?.toLowerCase();
    if (code && !codes.includes(code)) codes.push(code);
    if (codes.length >= 10) break;
  }
  return codes;
}

/** Ratio of uppercase letters among letters, and the letter count. */
export function capsRatio(content: string): { ratio: number; letters: number } {
  let letters = 0;
  let upper = 0;
  for (const char of content) {
    if (char.toLowerCase() !== char.toUpperCase()) {
      letters += 1;
      if (char === char.toUpperCase()) upper += 1;
    }
  }
  return { ratio: letters === 0 ? 0 : upper / letters, letters };
}

/** Longest run of consecutive combining marks (zalgo text). */
export function longestCombiningRun(content: string): number {
  let best = 0;
  let run = 0;
  for (const char of content.normalize('NFD')) {
    if (/\p{M}/u.test(char)) {
      run += 1;
      best = Math.max(best, run);
    } else {
      run = 0;
    }
  }
  return best;
}
