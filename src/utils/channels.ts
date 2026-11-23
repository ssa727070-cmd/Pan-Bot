import type { TextBasedChannel } from 'discord.js';

/** A text channel that can actually send messages (excludes partial group DMs). */
export type SendableChannel = TextBasedChannel & {
  send: (...args: any[]) => Promise<any>;
};

/** A guild text channel that supports bulk deletion. */
export type BulkDeletableChannel = TextBasedChannel & {
  bulkDelete: (...args: any[]) => Promise<any>;
};

export function isSendable(channel: unknown): channel is SendableChannel {
  return (
    typeof channel === 'object' &&
    channel !== null &&
    'send' in channel &&
    typeof (channel as { send?: unknown }).send === 'function'
  );
}

export function isBulkDeletable(channel: unknown): channel is BulkDeletableChannel {
  return (
    typeof channel === 'object' &&
    channel !== null &&
    'bulkDelete' in channel &&
    typeof (channel as { bulkDelete?: unknown }).bulkDelete === 'function'
  );
}
