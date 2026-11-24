import { randomUUID } from 'node:crypto';

export type MinecraftConfirmationAction =
  | { kind: 'maintenance'; enabled: boolean; whitelist: boolean; message: string }
  | { kind: 'console'; command: string }
  | { kind: 'ban'; player: string; reason: string | null };

interface PendingConfirmation {
  guildId: string;
  userId: string;
  action: MinecraftConfirmationAction;
  expiresAt: number;
}

export type ConfirmationOutcome =
  | { status: 'ok'; action: MinecraftConfirmationAction }
  | { status: 'missing' }
  | { status: 'expired' }
  | { status: 'forbidden' };

const pending = new Map<string, PendingConfirmation>();
const DEFAULT_TTL_MS = 5 * 60 * 1000;
const MAX_PENDING = 1000;

/** Stores a dangerous action until the same moderator confirms it with a button. */
export function createConfirmation(input: {
  guildId: string;
  userId: string;
  action: MinecraftConfirmationAction;
  ttlMs?: number;
  now?: number;
}): string {
  const now = input.now ?? Date.now();
  pruneConfirmations(now);
  // Bound memory: drop the oldest entries if somebody spams confirmations.
  while (pending.size >= MAX_PENDING) {
    const oldest = pending.keys().next().value;
    if (oldest === undefined) break;
    pending.delete(oldest);
  }
  const token = randomUUID();
  pending.set(token, {
    guildId: input.guildId,
    userId: input.userId,
    action: input.action,
    expiresAt: now + (input.ttlMs ?? DEFAULT_TTL_MS),
  });
  return token;
}

/**
 * Consumes a confirmation only for its owner. Somebody else pressing the button
 * gets `forbidden` and the token stays valid for the moderator who created it.
 */
export function consumeConfirmation(
  token: string,
  guildId: string,
  userId: string,
  now = Date.now(),
): ConfirmationOutcome {
  const entry = pending.get(token);
  if (!entry) return { status: 'missing' };
  if (entry.expiresAt < now) {
    pending.delete(token);
    return { status: 'expired' };
  }
  if (entry.guildId !== guildId || entry.userId !== userId) return { status: 'forbidden' };
  pending.delete(token);
  return { status: 'ok', action: entry.action };
}

/** Cancels a confirmation. Only its owner can cancel it. */
export function cancelConfirmation(
  token: string,
  guildId: string,
  userId: string,
  now = Date.now(),
): ConfirmationOutcome['status'] {
  const outcome = consumeConfirmation(token, guildId, userId, now);
  return outcome.status;
}

export function pruneConfirmations(now = Date.now()): number {
  let removed = 0;
  for (const [token, entry] of pending) {
    if (entry.expiresAt < now) {
      pending.delete(token);
      removed += 1;
    }
  }
  return removed;
}

export function pendingConfirmationCount(): number {
  return pending.size;
}

export function clearConfirmations(): void {
  pending.clear();
}
