import '../test/setup.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Database from 'better-sqlite3';
import { migrations } from './migrations.js';
import { AutomodRepository } from './repositories/automodRepository.js';
import { HelperRepository } from './repositories/helperRepository.js';
import { TicketRepository } from './repositories/ticketRepository.js';
import { moduleStatusLines } from '../commands/configuration/settings.js';

const A = '111111111111111111';
const B = '222222222222222222';

describe('migration 005 on an existing v1.1.6 database', () => {
  it('upgrades in place, keeps old data and backfills ticket settings', () => {
    const db = new Database(':memory:');
    const index = migrations.findIndex((m) => m.id === '005_v120_tickets_automod_helper');
    assert.ok(index >= 4);
    for (const migration of migrations.slice(0, index)) db.exec(migration.sql);

    db.prepare(
      `INSERT INTO guild_settings (guild_id, ticket_panel_channel_id, ticket_category_id, ticket_support_role_id)
       VALUES (?, 'panel', 'cat', 'role')`,
    ).run(A);
    db.prepare(
      `INSERT INTO tickets (guild_id, channel_id, creator_id, topic) VALUES (?, 'c1', 'u1', 'viejo')`,
    ).run(A);

    db.exec(migrations[index]!.sql);

    const repo = new TicketRepository(db);
    const settings = repo.getSettings(A);
    assert.equal(settings.panelChannelId, 'panel');
    assert.equal(settings.categoryId, 'cat');
    assert.deepEqual(repo.listRoles(A, 'support'), ['role']);
    assert.equal(repo.getByChannel('c1')?.topic, 'viejo');
    assert.equal(
      (db.prepare('SELECT ticket_panel_channel_id AS v FROM guild_settings').get() as { v: string })
        .v,
      'panel',
      'old columns are preserved',
    );
    assert.equal(repo.getSettings(B).panelChannelId, null);
    db.close();
  });
});

describe('multi-guild isolation', () => {
  it('keeps tickets, AutoMod and helper config independent per guild', () => {
    const db = new Database(':memory:');
    for (const migration of migrations) db.exec(migration.sql);
    const tickets = new TicketRepository(db);
    const automod = new AutomodRepository(db);
    const helper = new HelperRepository(db);

    tickets.updateSettings(A, { enabled: true, categoryId: 'catA' });
    tickets.addRole(A, 'support', 'rA');
    automod.setSettings(A, { enabled: true, sensitivity: 3 });
    helper.updateSettings(A, { enabled: true });
    tickets.create(A, 'chA', 'user', 'tema');

    assert.equal(tickets.getSettings(B).categoryId, null);
    assert.deepEqual(tickets.listRoles(B, 'support'), []);
    assert.equal(automod.getSettings(B).enabled, false);
    assert.equal(automod.getSettings(B).sensitivity, 2);
    assert.equal(helper.getSettings(B).enabled, false);
    assert.equal(tickets.countOpenByCreator(B, 'user'), 0);
    assert.equal(tickets.countOpenByCreator(A, 'user'), 1);

    const lines = moduleStatusLines(db, A).join('\n');
    assert.match(lines, /Tickets:\*\* ✅/);
    assert.match(moduleStatusLines(db, B).join('\n'), /AutoMod:\*\* ⚪/);
    db.close();
  });

  it('isolates a failing module from the rest of the status view', () => {
    const db = new Database(':memory:');
    for (const migration of migrations) db.exec(migration.sql);
    db.exec('DROP TABLE helper_settings');
    const lines = moduleStatusLines(db, A);
    assert.ok(lines.some((l) => l.includes('Helpers') && l.includes('error')));
    assert.ok(lines.some((l) => l.includes('Tickets') && !l.includes('error')));
    db.close();
  });
});
