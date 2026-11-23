import { truncate } from '../utils/format.js';

const MAX_REASON_LENGTH = 400;
const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;

/** Normalises an audit-log/embed reason, never returning an empty value. */
export function sanitizeReason(reason: string | null | undefined): string {
  const value = reason?.trim();
  return value ? truncate(value, MAX_REASON_LENGTH) : 'Sin razón especificada';
}

/** Converts minutes into a valid Discord timeout duration. */
export function timeoutDurationMs(minutes: number): number {
  if (!Number.isFinite(minutes) || minutes < 1) return 60_000;
  return Math.min(Math.floor(minutes) * 60_000, MAX_TIMEOUT_MS);
}

/** Human-readable Spanish duration. */
export function formatDurationSpanish(milliseconds: number): string {
  const minutes = Math.floor(milliseconds / 60_000);
  if (minutes < 60) return `${minutes} minuto${minutes === 1 ? '' : 's'}`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours} hora${hours === 1 ? '' : 's'}${
    remainingMinutes ? ` y ${remainingMinutes} minuto${remainingMinutes === 1 ? '' : 's'}` : ''
  }`;
}

/** Validates the amount of messages for /clear (Discord bulk delete accepts 2-100). */
export function validateClearAmount(amount: number): string | null {
  if (!Number.isInteger(amount) || amount < 1 || amount > 100) {
    return 'La cantidad debe estar entre 1 y 100 mensajes.';
  }
  return null;
}
