import '../test/setup.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Database from 'better-sqlite3';
import type { PanClient } from '../core/client.js';
import { migrations } from '../database/migrations.js';
import { StatisticsRepository } from '../database/repositories/statisticsRepository.js';
import {
  metricName,
  recordJoin,
  recordMessage,
  refreshStatsChannels,
  shouldAttemptRefresh,
  shouldUpdateChannel,
  STATS_UPDATE_INTERVAL_MS,
} from './service.js';

function database(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  for (const migration of migrations) db.exec(migration.sql);
  return db;
}

interface FakeCounter {
  name: string;
  setName: (name: string) => Promise<void>;
}

function fakeClient(db: Database.Database, channels: Map<string, FakeCounter>): PanClient {
  return {
    db: { sqlite: db },
    guilds: { cache: new Map() },
    channels: { fetch: async (id: string) => channels.get(id) ?? null },
  } as unknown as PanClient;
}

function fakeGuild(): {
  id: string;
  memberCount: number;
  members: {
    cache: Map<string, { user: { bot: boolean } }>;
    fetch: () => Promise<Map<string, never>>;
    me: { permissions: { has: () => boolean } };
  };
} {
  return {
    id: 'guild',
    memberCount: 2,
    members: {
      cache: new Map([
        ['1', { user: { bot: false } }],
        ['2', { user: { bot: true } }],
      ]),
      fetch: async () => new Map(),
      me: { permissions: { has: () => true } },
    },
  };
}

describe('server statistics', () => {
  it('renders live and historical metrics separately', () => {
    const db = database();
    try {
      const repo = new StatisticsRepository(db);
      repo.setLiveMembers('guild', { total: 12, humans: 9, bots: 3 });
      repo.recordMessage('guild', new Date('2026-11-23T10:00:00Z'));
      const stats = repo.get('guild');
      assert.equal(metricName('members', stats), 'Miembros: 12');
      assert.equal(metricName('humans', stats), 'Humanos: 9');
      assert.equal(metricName('bots', stats), 'Bots: 3');
      assert.equal(metricName('messages', stats), 'Mensajes: 1');
    } finally {
      db.close();
    }
  });

  it('throttles channel updates but always applies name changes', () => {
    const channel = {
      guildId: 'guild',
      channelId: 'c',
      metric: 'members' as const,
      lastName: 'Miembros: 10',
      lastUpdatedAt: 1000,
    };
    assert.equal(
      shouldUpdateChannel(channel, 'Miembros: 10', 1000 + STATS_UPDATE_INTERVAL_MS - 1),
      false,
    );
    assert.equal(
      shouldUpdateChannel(channel, 'Miembros: 10', 1000 + STATS_UPDATE_INTERVAL_MS),
      true,
    );
    assert.equal(shouldUpdateChannel(channel, 'Miembros: 11', 1000), true);
  });

  it('records activity and refreshes only configured channels', async () => {
    const db = database();
    try {
      const repo = new StatisticsRepository(db);
      repo.setChannel('guild', 'counter', 'bots');
      const names: string[] = [];
      const counter: FakeCounter = {
        name: 'Bots: 0',
        setName: async (name: string) => {
          names.push(name);
        },
      };
      const client = fakeClient(db, new Map([['counter', counter]]));
      const guild = fakeGuild();

      recordMessage(client, 'guild');
      recordJoin(client, 'guild');
      assert.equal(repo.get('guild').messagesTotal, 1);
      assert.equal(repo.get('guild').joinsTotal, 1);
      assert.equal(
        await refreshStatsChannels(client, 'guild', { guild: guild as never, force: true }),
        1,
      );
      assert.deepEqual(names, ['Bots: 1']);
    } finally {
      db.close();
    }
  });

  it('uses a coarse attempt throttle for high-volume guilds', () => {
    const now = 500_000;
    assert.equal(shouldAttemptRefresh('throttle-guild', now), true);
    assert.equal(shouldAttemptRefresh('throttle-guild', now + 1000), false);
    assert.equal(shouldAttemptRefresh('throttle-guild', now + 31_000), true);
  });
});
