import { readdir } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { logger } from '../core/logger.js';
import type { PanClient } from '../core/client.js';
import type { Command } from '../types/command.js';

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

export async function loadCommands(client: PanClient): Promise<void> {
  const commandsDirectory = join(dirname(fileURLToPath(import.meta.url)), '..', 'commands');
  const files = await collectFiles(commandsDirectory);

  for (const file of files) {
    if (!['.ts', '.js'].includes(extname(file)) || file.endsWith('.d.ts')) continue;

    const module = (await import(pathToFileURL(file).href)) as { default?: Command };
    const command = module.default;

    if (!command?.data?.name || typeof command.execute !== 'function') {
      logger.warn({ file }, 'Skipped file without a valid command export');
      continue;
    }

    client.commands.set(command.data.name, command);
    logger.debug({ command: command.data.name }, 'Registered slash command');
  }

  logger.info({ count: client.commands.size }, 'Slash commands loaded');
}
