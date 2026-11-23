import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Database from 'better-sqlite3';
import type { LogEvent } from '../../logging/events.js';
import { migrations } from '../migrations.js';
import { GuildSettingsRepository } from './guildSettings.js';
import { LogSettingsRepository } from './logSettingsRepository.js';
import { TicketRepository } from './ticketRepository.js';
import { WarningRepository } from './warningRepository.js';

function createDatabase(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE schema_migrations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  for (const migration of migrations) {
    db.exec(migration.sql);
    db.prepare('INSERT INTO schema_migrations (id, name) VALUES (?, ?)').run(
      migration.id,
      migration.name,
    );
  }
  return db;
}

describe('GuildSettingsRepository', () => {
  it('creates a row on first access and applies updates', () => {
    const db = createDatabase();
    try {
      const repo = new GuildSettingsRepository(db);
      const settings = repo.get('guild-1');
      assert.equal(settings.guildId, 'guild-1');

      repo.update('guild-1', {
        welcomeChannelId: 'channel-1',
        ticketSupportRoleId: 'role-1',
        modLogChannelId: 'log-1',
      });
      const updated = repo.get('guild-1');
      assert.equal(updated.welcomeChannelId, 'channel-1');
      assert.equal(updated.ticketSupportRoleId, 'role-1');
      assert.equal(updated.modLogChannelId, 'log-1');
    } finally {
      db.close();
    }
  });

  it('reserves sequential ticket numbers atomically', () => {
    const db = createDatabase();
    try {
      const repo = new GuildSettingsRepository(db);
      assert.equal(repo.nextTicketNumber('guild-1'), 1);
      assert.equal(repo.nextTicketNumber('guild-1'), 2);
      assert.equal(repo.nextTicketNumber('guild-2'), 1);
    } finally {
      db.close();
    }
  });
});

describe('WarningRepository', () => {
  it('adds, lists, counts and deactivates warnings', () => {
    const db = createDatabase();
    try {
      const repo = new WarningRepository(db);
      const warning = repo.add('guild-1', 'user-1', 'mod-1', 'Spam');
      assert.equal(warning.active, true);
      assert.equal(warning.reason, 'Spam');

      repo.add('guild-1', 'user-1', 'mod-1', 'Insultos');
      assert.equal(repo.countActive('guild-1', 'user-1'), 2);
      assert.equal(repo.list('guild-1', 'user-1').length, 2);

      assert.equal(repo.deactivate(warning.id), true);
      assert.equal(repo.deactivate(warning.id), false);
      assert.equal(repo.countActive('guild-1', 'user-1'), 1);
      assert.equal(repo.list('guild-1', 'user-1', false).length, 2);
    } finally {
      db.close();
    }
  });
});

describe('TicketRepository', () => {
  it('creates, claims, manages participants and closes tickets', () => {
    const db = createDatabase();
    try {
      const repo = new TicketRepository(db);
      const ticket = repo.create('guild-1', 'channel-1', 'creator-1', 'Necesito ayuda');
      assert.equal(ticket.status, 'open');
      assert.equal(repo.getByChannel('channel-1')?.topic, 'Necesito ayuda');

      repo.addParticipant(ticket.id, 'creator-1');
      repo.addParticipant(ticket.id, 'helper-1');
      assert.deepEqual(repo.participants(ticket.id).sort(), ['creator-1', 'helper-1']);
      assert.equal(repo.removeParticipant(ticket.id, 'helper-1'), true);
      assert.equal(repo.removeParticipant(ticket.id, 'helper-1'), false);

      assert.equal(repo.claim('channel-1', 'helper-1'), true);
      assert.equal(repo.claim('channel-1', 'other-1'), false);
      assert.equal(repo.getByChannel('channel-1')?.claimerId, 'helper-1');

      assert.equal(repo.close('channel-1', 'Transcripto de prueba'), true);
      const closed = repo.getByChannel('channel-1')!;
      assert.equal(closed.status, 'closed');
      assert.equal(closed.transcript, 'Transcripto de prueba');
      assert.ok(closed.closedAt);
      assert.equal(repo.openByCreator('guild-1', 'creator-1').length, 0);
    } finally {
      db.close();
    }
  });
});

describe('LogSettingsRepository', () => {
  it('enables, disables and lists event channels', () => {
    const db = createDatabase();
    try {
      const repo = new LogSettingsRepository(db);
      assert.equal(repo.get('guild-1', 'ban').enabled, false);

      repo.set('guild-1', 'ban', 'channel-1', true);
      assert.equal(repo.get('guild-1', 'ban').enabled, true);
      assert.equal(repo.get('guild-1', 'ban').channelId, 'channel-1');

      const events: LogEvent[] = ['ban', 'unban'];
      repo.setChannelForAll('guild-1', 'channel-2', events);
      assert.equal(repo.get('guild-1', 'ban').channelId, 'channel-2');
      assert.equal(repo.get('guild-1', 'unban').enabled, true);

      repo.set('guild-1', 'ban', null, false);
      assert.equal(repo.get('guild-1', 'ban').enabled, false);
      assert.equal(repo.list('guild-1').length, 2);
    } finally {
      db.close();
    }
  });
});
