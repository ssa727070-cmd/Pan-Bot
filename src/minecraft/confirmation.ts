import { randomUUID } from 'node:crypto';

export type MinecraftConfirmationAction =
  | { kind: 'maintenance'; enabled: boolean; whitelist: boolean; message: string }
  | { kind: 'console'; command: string }
  | { kind: 'ban'; player: string; reason: string };

interface PendingConfirmation {
  guildId: string;
  userId: string;
  action: MinecraftConfirmationAction;
  expiresAt: number;
}

const pending = new Map<string, PendingConfirmation>();
const DEFAULT_TTL_MS = 5 * 60 * 1000;

/** Stores a dangerous action until the same moderator confirms it with a button. */
export function createConfirmation(input: {
  guildId: string;
  userId: string;
  action: MinecraftConfirmationAction;
  ttlMs?: number;
  now?: number;
}): string {
  const token = randomUUID();
  pending.set(token, {
    guildId: input.guildId,
    userId: input.userId,
    action: input.action,
    expiresAt: (input.now ?? Date.now()) + (input.ttlMs ?? DEFAULT_TTL_MS),
  });
  pruneConfirmations(input.now);
  return token;
}

export function consumeConfirmation(
  token: string,
  guildId: string,
  userId: string,
  now = Date.now(),
): MinecraftConfirmationAction | null {
  const entry = pending.get(token);
  if (!entry) return null;
  pending.delete(token);
  if (entry.expiresAt < now || entry.guildId !== guildId || entry.userId !== userId) return null;
  return entry.action;
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
