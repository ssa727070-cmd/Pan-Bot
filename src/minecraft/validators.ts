import { z } from 'zod';

/** Bounded, injection-resistant validation for every value interpolated into an RCON command. */

export const minecraftUsername = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_]{1,16}$/, 'Nombre de jugador inválido (1–16 letras, números o _)');

export const minecraftTarget = z
  .string()
  .trim()
  .regex(
    /^(?:[A-Za-z0-9_]{1,16}|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/,
    'Objetivo inválido: usa un nombre de jugador o UUID',
  );

export const minecraftReason = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[\p{L}\p{N} .,_:@!?¡¿()'/-]+$/u, 'La razón contiene caracteres no permitidos');

export const minecraftMessage = z
  .string()
  .trim()
  .min(1)
  .max(300)
  .regex(
    /^[\p{L}\p{N} .,:;!?¡¿()[\]{}#@$%&*+=/'"_-]+$/u,
    'El mensaje contiene caracteres no permitidos',
  );

export const minecraftGamerule = z
  .string()
  .trim()
  .regex(/^[A-Za-z][A-Za-z0-9]*$/, 'Nombre de gamerule inválido')
  .max(50);

export const minecraftGameruleValue = z
  .string()
  .trim()
  .regex(/^(?:true|false|\d{1,6})$/, 'Valor inválido (true, false o 0–999999)');

export const minecraftCoordinates = z
  .string()
  .trim()
  .regex(
    /^-?\d{1,6}(?:\.\d{1,3})? -?\d{1,6}(?:\.\d{1,3})? -?\d{1,6}(?:\.\d{1,3})?$/,
    'Coordenadas inválidas',
  );

export const minecraftDuration = z
  .string()
  .trim()
  .regex(/^\d{1,4}[smhdw]$/, 'Duración inválida (ej. 30m, 1h, 7d)');

export const minecraftXpAmount = z.number().int().min(1).max(2_147_483_647);

export const minecraftCommandName = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9:._-]{0,63}$/, 'Nombre de comando inválido');

const MAX_PATTERN_QUANTIFIERS = 2;

/**
 * Argument patterns for custom console allowlist entries: a small, safe regex
 * subset (classes, groups, alternation, quantifiers, \d \w \s). Quantified
 * groups such as `(a+)+` are rejected to avoid catastrophic backtracking, and
 * backreferences or other escapes are not accepted.
 */
export const minecraftArgPattern = z
  .string()
  .trim()
  .max(80)
  .regex(/^[A-Za-z0-9 _.,:@#+\-|()[\]?*{}\\]*$/, 'Patrón de argumentos no seguro')
  .refine((value) => !/\\(?![dws])/.test(value), 'Patrón de argumentos no seguro')
  .refine((value) => !/\)[*+?{]/.test(value), 'Patrón de argumentos no seguro')
  // Adjacent quantifiers (`.*.*.*x`, `a?a?a?aaa`) backtrack polynomially or
  // exponentially. Two quantifiers bound the worst case to O(n²) on ≤500 chars.
  .refine(
    (value) => (value.match(/[*+?{]/g) ?? []).length <= MAX_PATTERN_QUANTIFIERS,
    'Patrón de argumentos no seguro (máximo 2 cuantificadores)',
  )
  .refine((value) => {
    try {
      new RegExp(`^(?:${value})$`);
      return true;
    } catch {
      return false;
    }
  }, 'Patrón de argumentos no seguro');

/** RCON command payloads are line based: control characters are never accepted. */
export function isSafeRconText(value: string): boolean {
  // eslint-disable-next-line no-control-regex -- intentional control-char rejection for RCON safety.
  return value.length > 0 && value.length <= 500 && !/[\r\n\u0000-\u001F\u007F]/.test(value);
}

export function requireValid<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new Error(label);
  return parsed.data;
}

/** Quote only when needed; validated values can never contain a newline or NUL. */
export function quoteRconArgument(value: string): string {
  if (/^[A-Za-z0-9_./:+@-]+$/.test(value)) return value;
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
