import { readdir } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { ClientEvents } from 'discord.js';
import type { PanClient } from '../core/client.js';
import { logger } from '../core/logger.js';
import type { BotEvent } from '../types/event.js';

async function collectFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(path)));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }

  return files;
}

export async function loadEvents(client: PanClient): Promise<void> {
  const eventsDirectory = join(dirname(fileURLToPath(import.meta.url)), '..', 'events');
  const files = await collectFiles(eventsDirectory);
  let count = 0;

  for (const file of files) {
    if (!['.ts', '.js'].includes(extname(file)) || file.endsWith('.d.ts')) continue;

    const module = (await import(pathToFileURL(file).href)) as { default?: BotEvent };
    const event = module.default;
    if (!event) continue;

    if (!event.name || typeof event.execute !== 'function') {
      logger.warn({ file }, 'Skipped file without a valid event export');
      continue;
    }

    const name = event.name as keyof ClientEvents;
    const listener = event.execute as (...args: any[]) => void;

    if (event.once) {
      client.once(name, listener);
    } else {
      client.on(name, listener);
    }
    count += 1;
    logger.debug({ event: event.name }, 'Registered Discord event');
  }

  logger.info({ count }, 'Discord events loaded');
}
