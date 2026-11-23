import '../../test/setup.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Database from 'better-sqlite3';
import { migrations } from '../migrations.js';
import { AutomodRepository } from './automodRepository.js';
import { AutoroleRepository } from './autoroleRepository.js';
import { StatisticsRepository, dayKey, weekKey } from './statisticsRepository.js';
import { SuggestionRepository } from './suggestionRepository.js';
import { parsePanelCustomId } from '../../autoroles/constants.js';
import { parseVoteCustomId } from '../../suggestions/constants.js';

function createDatabase(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  for (const migration of migrations) db.exec(migration.sql);
  return db;
}

function withDatabase(test: (db: Database.Database) => void): void {
  const db = createDatabase();
  try {
    test(db);
  } finally {
    db.close();
  }
}

const GUILD = '123456789012345678';

describe('v1.1.0 migrations', () => {
  it('adds all feature tables without removing existing ones', () => {
    withDatabase((db) => {
      const tables = (
        db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{
          name: string;
        }>
      ).map((row) => row.name);
      for (const table of [
        'guild_settings',
        'warnings',
        'tickets',
        'autorole_settings',
        'autorole_roles',
        'role_panels',
        'role_panel_roles',
        'guild_statistics',
        'stats_daily',
        'stat_channels',
        'suggestion_settings',
        'suggestion_statuses',
        'suggestions',
        'suggestion_votes',
        'automod_settings',
        'automod_words',
        'automod_exemptions',
        'automod_incidents',
      ]) {
        assert.ok(tables.includes(table), `missing table ${table}`);
      }
      assert.equal(migrations.length, 4);
      assert.equal(migrations[2]?.id, '003_autoroles_statistics_suggestions_automod');
      assert.equal(migrations[3]?.id, '004_minecraft_administration');
    });
  });
});

describe('AutoroleRepository', () => {
  it('stores guild-specific settings and multiple join roles', () => {
    withDatabase((db) => {
      const repo = new AutoroleRepository(db);
      assert.equal(repo.getSettings(GUILD).enabled, false);
      repo.setSettings(GUILD, { enabled: true, includeBots: true });
      assert.deepEqual(
        { enabled: repo.getSettings(GUILD).enabled, bots: repo.getSettings(GUILD).includeBots },
        { enabled: true, bots: true },
      );
      assert.equal(repo.addRole(GUILD, '111111111111111111'), true);
      assert.equal(repo.addRole(GUILD, '111111111111111111'), false);
      repo.addRole(GUILD, '222222222222222222');
      assert.equal(repo.listRoles(GUILD).length, 2);
      assert.equal(repo.removeRole(GUILD, '111111111111111111'), true);
      assert.equal(repo.listRoles(GUILD).length, 1);
    });
  });

  it('creates panels with roles atomically and prunes deleted roles', () => {
    withDatabase((db) => {
      const repo = new AutoroleRepository(db);
      repo.addRole(GUILD, '111111111111111111');
      const panel = repo.createPanel({
        guildId: GUILD,
        channelId: '333333333333333333',
        title: 'Roles',
        description: 'Elige',
        maxSelections: 2,
        roles: [
          { roleId: '111111111111111111', label: 'Uno', description: '', position: 0 },
          { roleId: '222222222222222222', label: 'Dos', description: '', position: 1 },
        ],
      });
      assert.equal(repo.getPanelRoles(panel.id).length, 2);
      repo.replacePanelRoles(panel.id, [
        { roleId: '111111111111111111', label: 'Uno', description: '', position: 0 },
      ]);
      assert.equal(repo.getPanelRoles(panel.id).length, 1);
      assert.equal(repo.pruneDeletedRoles(GUILD, new Set(['999999999999999999'])), 2);
      assert.deepEqual(repo.listRoles(GUILD), []);
      assert.deepEqual(repo.getPanelRoles(panel.id), []);
      assert.equal(
        parsePanelCustomId(`autorole_panel:${panel.id}:111111111111111111`)?.panelId,
        panel.id,
      );
      assert.equal(parsePanelCustomId('autorole_panel:bad:id'), null);
    });
  });
});

describe('StatisticsRepository', () => {
  it('records live snapshots, historical counters and daily activity', () => {
    withDatabase((db) => {
      const repo = new StatisticsRepository(db);
      const at = new Date('2026-11-23T12:00:00.000Z');
      repo.setLiveMembers(GUILD, { total: 10, humans: 8, bots: 2 });
      repo.recordJoin(GUILD, at);
      repo.recordLeave(GUILD, at);
      repo.recordMessage(GUILD, at);
      repo.recordMessage(GUILD, at);

      const stats = repo.get(GUILD);
      assert.equal(stats.totalMembers, 10);
      assert.equal(stats.botMembers, 2);
      assert.equal(stats.joinsTotal, 1);
      assert.equal(stats.leavesTotal, 1);
      assert.equal(stats.messagesTotal, 2);
      assert.equal(stats.messagesDay, 2);
      assert.equal(stats.messagesWeek, 2);
      assert.equal(stats.dayKey, dayKey(at));
      assert.equal(stats.weekKey, weekKey(at));

      repo.recordMessage(GUILD, new Date('2026-11-24T12:00:00.000Z'));
      assert.equal(repo.get(GUILD).messagesDay, 1);
      assert.equal(repo.get(GUILD).messagesTotal, 3);
      assert.equal(repo.getDaily(GUILD).length, 2);
    });
  });

  it('stores and removes counter channels per guild', () => {
    withDatabase((db) => {
      const repo = new StatisticsRepository(db);
      repo.setChannel(GUILD, 'channel1', 'members');
      repo.setChannel(GUILD, 'channel2', 'bots');
      assert.equal(repo.listChannels(GUILD).length, 2);
      repo.touchChannel(repo.listChannels(GUILD)[0]!, 'Miembros: 10', 1000);
      assert.equal(repo.listChannels(GUILD)[0]?.lastName, 'Miembros: 10');
      assert.equal(repo.removeChannel(GUILD, 'channel1'), true);
      assert.equal(repo.clearChannels(GUILD), 1);
    });
  });
});

describe('SuggestionRepository', () => {
  it('creates suggestions with unique ids and persistent votes', () => {
    withDatabase((db) => {
      const repo = new SuggestionRepository(db);
      repo.setSettings(GUILD, { channelId: 'channel', enabled: true });
      const first = repo.create({
        guildId: GUILD,
        authorId: 'user1',
        channelId: 'channel',
        content: 'Idea uno',
      });
      const second = repo.create({
        guildId: GUILD,
        authorId: 'user2',
        channelId: 'channel',
        content: 'Idea dos',
      });
      assert.notEqual(first.id, second.id);

      assert.deepEqual(repo.vote(GUILD, first.id, 'voter', 1), { up: 1, down: 0, score: 1 });
      assert.deepEqual(repo.vote(GUILD, first.id, 'voter', -1), { up: 0, down: 1, score: -1 });
      assert.deepEqual(repo.vote(GUILD, first.id, 'voter', null), { up: 0, down: 0, score: 0 });
      assert.equal(repo.getUserVote(first.id, 'voter'), null);
      assert.equal(repo.vote(GUILD, first.id, 'voter', 1)?.score, 1);
      assert.equal(parseVoteCustomId(`suggest_vote:${first.id}:up`)?.action, 'up');
      assert.equal(parseVoteCustomId('suggest_vote:x:up'), null);
    });
  });

  it('stores staff status labels and responses', () => {
    withDatabase((db) => {
      const repo = new SuggestionRepository(db);
      const suggestion = repo.create({
        guildId: GUILD,
        authorId: 'user',
        channelId: null,
        content: 'Idea de prueba',
      });
      repo.setStatusLabel(GUILD, 'approved', 'Aceptada');
      assert.equal(repo.getStatusLabels(GUILD).approved, 'Aceptada');
      assert.equal(repo.setStatus(GUILD, suggestion.id, 'implemented'), true);
      assert.equal(repo.setResponse(GUILD, suggestion.id, 'Gracias'), true);
      assert.equal(repo.get(GUILD, suggestion.id)?.status, 'implemented');
      assert.equal(repo.get(GUILD, suggestion.id)?.staffResponse, 'Gracias');
    });
  });
});

describe('AutomodRepository', () => {
  it('stores words, exemptions and incidents with safe defaults', () => {
    withDatabase((db) => {
      const repo = new AutomodRepository(db);
      const defaults = repo.getSettings(GUILD);
      assert.equal(defaults.enabled, false);
      assert.equal(defaults.timeoutMinutes, 0);
      repo.setSettings(GUILD, { enabled: true, timeoutMinutes: 5, spamEnabled: true });
      const updated = repo.getSettings(GUILD);
      assert.equal(updated.enabled, true);
      assert.equal(updated.timeoutMinutes, 5);
      assert.equal(updated.spamEnabled, true);
      assert.equal(updated.linksEnabled, false);

      assert.equal(repo.addWord(GUILD, 'Spam'), true);
      assert.equal(repo.addWord(GUILD, 'spam'), false);
      assert.deepEqual(repo.listWords(GUILD), ['spam']);
      repo.addExemption(GUILD, 'role', 'role1');
      assert.equal(repo.listExemptions(GUILD).length, 1);
      repo.logIncident({
        guildId: GUILD,
        userId: 'user',
        channelId: 'channel',
        rule: 'spam',
        action: 'delete',
      });
      assert.equal(repo.listIncidents(GUILD)[0]?.rule, 'spam');
    });
  });
});
