import type { Guild } from 'discord.js';
import type { PanClient } from '../core/client.js';
import { AutoroleRepository } from '../database/repositories/autoroleRepository.js';

/** Removes references to roles deleted in Discord, without touching unrelated data. */
export function pruneDeletedRoles(client: PanClient, guild: Guild): number {
  return new AutoroleRepository(client.db.sqlite).pruneDeletedRoles(
    guild.id,
    new Set(guild.roles.cache.keys()),
  );
}
