import '../test/setup.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Database from 'better-sqlite3';
import { env } from '../config/env.js';
import { migrations } from '../database/migrations.js';
import { MinecraftRepository } from '../database/repositories/minecraftRepository.js';
import { mockGuild, mockMember } from '../test/discordMocks.js';
import {
  canManageMinecraft,
  isMinecraftLevel,
  isMinecraftOwner,
  resolveMinecraftLevel,
} from './permissions.js';

function createClient(): any {
  const database = new Database(':memory:');
  for (const migration of migrations) database.exec(migration.sql);
  return { db: { sqlite: database } };
}

const guild = mockGuild({ id: 'g1', ownerId: 'owner' });

describe('minecraft permissions', () => {
  it('uses configured role levels and enforces hierarchy', () => {
    const client = createClient();
    const repo = new MinecraftRepository(client.db.sqlite);
    repo.addRole('g1', 'moderator', 'r-mod');
    repo.addRole('g1', 'admin', 'r-admin');

    const mod = mockMember({ id: 'u1', guild, roles: ['r-mod'] });
    const admin = mockMember({ id: 'u2', guild, roles: ['r-admin'] });
    assert.equal(resolveMinecraftLevel(client, mod), 'moderator');
    assert.equal(canManageMinecraft(client, mod, 'kick'), true);
    assert.equal(canManageMinecraft(client, mod, 'ban'), false);
    assert.equal(canManageMinecraft(client, admin, 'ban'), true);
  });

  it('falls back to Discord permissions only when no roles are configured', () => {
    const client = createClient();
    const mod = mockMember({ id: 'u1', guild, perms: ['ManageGuild'] });
    const admin = mockMember({ id: 'u2', guild, perms: ['Administrator'] });
    const auditor = mockMember({ id: 'u3', guild, perms: ['ViewAuditLog'] });
    assert.equal(resolveMinecraftLevel(client, mod), 'moderator');
    assert.equal(resolveMinecraftLevel(client, admin), 'admin');
    assert.equal(canManageMinecraft(client, auditor, 'status'), true);
    assert.equal(canManageMinecraft(client, auditor, 'kick'), false);
  });

  it('configured roles are restrictive: Discord permissions grant no alternative access', () => {
    const client = createClient();
    new MinecraftRepository(client.db.sqlite).addRole('g1', 'moderator', 'r-mod');

    const discordAdmin = mockMember({
      id: 'u1',
      guild,
      perms: ['Administrator', 'ManageGuild', 'ModerateMembers', 'ViewAuditLog'],
    });
    assert.equal(resolveMinecraftLevel(client, discordAdmin), null);
    for (const action of ['status', 'kick', 'ban', 'setup', 'roles', 'console'] as const) {
      assert.equal(canManageMinecraft(client, discordAdmin, action), false, action);
    }
  });

  it('always keeps the Discord server owner as owner so the guild cannot lock itself out', () => {
    const client = createClient();
    new MinecraftRepository(client.db.sqlite).addRole('g1', 'moderator', 'r-mod');
    const guildOwner = mockMember({ id: 'owner', guild });
    assert.equal(resolveMinecraftLevel(client, guildOwner), 'owner');
    assert.equal(canManageMinecraft(client, guildOwner, 'setup'), true);
  });

  it('validates level names', () => {
    assert.equal(isMinecraftLevel('admin'), true);
    assert.equal(isMinecraftLevel('superuser'), false);
    assert.equal(isMinecraftLevel(undefined), false);
  });
});

describe('minecraft owner check', () => {
  it('never treats the Discord application/bot ID as an owner', () => {
    const impostor = mockMember({ id: env.DISCORD_CLIENT_ID, guild });
    assert.equal(isMinecraftOwner(impostor, []), false);
  });

  it('accepts the guild owner and configured bot owners only', () => {
    assert.equal(isMinecraftOwner(mockMember({ id: 'owner', guild }), []), true);
    assert.equal(isMinecraftOwner(mockMember({ id: '42', guild }), ['42']), true);
    assert.equal(isMinecraftOwner(mockMember({ id: '43', guild }), ['42']), false);
  });
});
