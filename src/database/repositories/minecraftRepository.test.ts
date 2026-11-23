import '../../test/setup.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Database from 'better-sqlite3';
import { migrations } from '../migrations.js';
import { MinecraftRepository } from './minecraftRepository.js';

function db(): Database.Database {
  const database = new Database(':memory:');
  database.pragma('foreign_keys = ON');
  for (const migration of migrations) database.exec(migration.sql);
  return database;
}

describe('minecraft repository', () => {
  it('stores settings, roles, allowlist, panels and audit', () => {
    const database = db();
    const repo = new MinecraftRepository(database);
    const settings = repo.updateSettings('g1', {
      enabled: true,
      notificationChannelId: 'c1',
      notifyIntervalSeconds: 120,
    });
    assert.equal(settings.enabled, true);
    assert.equal(settings.notifyIntervalSeconds, 120);

    assert.equal(repo.addRole('g1', 'admin', 'r1'), true);
    assert.equal(repo.addRole('g1', 'admin', 'r1'), false);
    assert.equal(repo.listRoles('g1', 'admin').length, 1);

    repo.addAllowedCommand('g1', 'say', '[A-Za-z ]+', 'u1');
    assert.equal(repo.listAllowedCommands('g1')[0]?.command, 'say');

    const panel = repo.createPanel({ guildId: 'g1', channelId: 'c1', kind: 'status', title: 'MC' });
    repo.setPanelMessage('g1', panel.id, 'm1');
    assert.equal(repo.getPanelByMessage('m1')?.id, panel.id);

    repo.recordAudit({
      guildId: 'g1',
      adminId: 'u1',
      action: 'kick',
      targetPlayer: 'Steve',
      command: 'kick Steve',
      result: 'success',
    });
    assert.equal(repo.listAudit('g1')[0]?.action, 'kick');
    database.close();
  });

  it('deduplicates notification fingerprints', () => {
    const database = db();
    const repo = new MinecraftRepository(database);
    repo.markNotification('g1', 'server-offline', 'server', 'fp1');
    assert.equal(repo.getNotificationFingerprint('g1', 'server-offline', 'server'), 'fp1');
    database.close();
  });
});
