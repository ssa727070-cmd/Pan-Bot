import '../test/setup.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Database from 'better-sqlite3';
import { migrations } from '../database/migrations.js';
import { MinecraftRepository } from '../database/repositories/minecraftRepository.js';
import { canManageMinecraft, resolveMinecraftLevel } from './permissions.js';

function createClient(): any {
  const database = new Database(':memory:');
  for (const migration of migrations) database.exec(migration.sql);
  return { db: { sqlite: database } };
}

function member(input: { id: string; ownerId: string; roles: string[]; perms?: string[] }): any {
  const perms = new Set(input.perms ?? []);
  return {
    id: input.id,
    guild: { id: 'g1', ownerId: input.ownerId },
    user: { id: input.id },
    roles: { cache: { has: (id: string) => input.roles.includes(id) } },
    permissions: { has: (perm: string) => perms.has(perm) },
  };
}

describe('minecraft permissions', () => {
  it('uses configured role levels and enforces hierarchy', () => {
    const client = createClient();
    const repo = new MinecraftRepository(client.db.sqlite);
    repo.addRole('g1', 'moderator', 'r-mod');
    repo.addRole('g1', 'admin', 'r-admin');

    const mod = member({ id: 'u1', ownerId: 'owner', roles: ['r-mod'] });
    const admin = member({ id: 'u2', ownerId: 'owner', roles: ['r-admin'] });
    assert.equal(resolveMinecraftLevel(client, mod), 'moderator');
    assert.equal(canManageMinecraft(client, mod, 'kick'), true);
    assert.equal(canManageMinecraft(client, mod, 'ban'), false);
    assert.equal(canManageMinecraft(client, admin, 'ban'), true);
  });

  it('falls back to Discord permissions when no roles configured', () => {
    const client = createClient();
    const mod = member({ id: 'u1', ownerId: 'owner', roles: [], perms: ['ManageGuild'] });
    assert.equal(resolveMinecraftLevel(client, mod), 'moderator');
    assert.equal(canManageMinecraft(client, mod, 'status'), true);
  });
});
