import '../test/setup.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Database from 'better-sqlite3';
import type { PanClient } from '../core/client.js';
import { migrations } from '../database/migrations.js';
import { AutoroleRepository } from '../database/repositories/autoroleRepository.js';
import { assignJoinRoles, panelComponents, panelEmbed, validateAssignableRole } from './service.js';
import { pruneDeletedRoles } from './maintenance.js';

function database(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  for (const migration of migrations) db.exec(migration.sql);
  return db;
}

function fakeClient(db: Database.Database): PanClient {
  return { db: { sqlite: db } } as unknown as PanClient;
}

function fakeGuild(roleIds: string[], botPosition = 100) {
  const roles = new Map(
    roleIds.map((id, index) => [
      id,
      { id, name: `Rol ${id}`, managed: false, position: index + 1 },
    ]),
  );
  return {
    id: 'guild',
    roles: { cache: roles },
    members: {
      me: {
        permissions: { has: (permission: string) => permission === 'ManageRoles' },
        roles: { highest: { position: botPosition } },
      },
    },
  };
}

describe('automatic roles', () => {
  it('assigns every configured role to a new human member and skips bots by default', async () => {
    const db = database();
    try {
      const repo = new AutoroleRepository(db);
      repo.setSettings('guild', { enabled: true });
      repo.addRole('guild', '111111111111111111');
      repo.addRole('guild', '222222222222222222');
      const guild = fakeGuild(['111111111111111111', '222222222222222222']);
      const assigned: string[] = [];
      const member = {
        guild,
        user: { bot: false },
        roles: { cache: new Map(), add: async (id: string) => assigned.push(id) },
      } as never;

      assert.equal(await assignJoinRoles(fakeClient(db), member), 2);
      assert.deepEqual(assigned, ['111111111111111111', '222222222222222222']);

      const botMember = {
        ...member,
        user: { bot: true },
        roles: { cache: new Map(), add: async (id: string) => assigned.push(id) },
      } as never;
      assert.equal(await assignJoinRoles(fakeClient(db), botMember), 0);

      repo.setSettings('guild', { includeBots: true });
      assert.equal(await assignJoinRoles(fakeClient(db), botMember), 2);
    } finally {
      db.close();
    }
  });

  it('does nothing when the system is disabled', async () => {
    const db = database();
    try {
      const repo = new AutoroleRepository(db);
      repo.addRole('guild', '111111111111111111');
      const member = {
        guild: fakeGuild(['111111111111111111']),
        user: { bot: false },
        roles: { cache: new Map(), add: async () => undefined },
      } as never;
      assert.equal(await assignJoinRoles(fakeClient(db), member), 0);
    } finally {
      db.close();
    }
  });

  it('validates hierarchy, missing roles and managed roles', () => {
    const guild = fakeGuild(['111111111111111111', '222222222222222222'], 3);
    const bot = guild.members.me as unknown as Parameters<typeof validateAssignableRole>[1];
    assert.equal(
      validateAssignableRole(guild as never, bot, '333333333333333333'),
      'El rol ya no existe en este servidor.',
    );
    assert.equal(validateAssignableRole(guild as never, bot, '222222222222222222'), null);
    guild.roles.cache.get('111111111111111111')!.managed = true;
    assert.match(
      validateAssignableRole(guild as never, bot, '111111111111111111') ?? '',
      /gestionados/,
    );
  });

  it('builds persistent panel components and prunes deleted roles', () => {
    const db = database();
    try {
      const repo = new AutoroleRepository(db);
      const panel = repo.createPanel({
        guildId: 'guild',
        channelId: 'channel',
        title: 'Roles',
        description: 'Elige',
        maxSelections: 2,
        roles: [{ roleId: '111111111111111111', label: 'Uno', description: 'Desc', position: 0 }],
      });
      const roles = repo.getPanelRoles(panel.id);
      const components = panelComponents(panel, roles);
      assert.equal(components.length, 1);
      assert.match(panelEmbed(panel, roles).data.description ?? '', /Uno/);
      const dbGuild = { id: 'guild', roles: { cache: new Map() } } as never;
      assert.equal(pruneDeletedRoles(fakeClient(db), dbGuild), 1);
      assert.equal(repo.getPanelRoles(panel.id).length, 0);
    } finally {
      db.close();
    }
  });
});
