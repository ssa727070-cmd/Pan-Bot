import '../test/setup.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Database from 'better-sqlite3';
import { migrations } from '../database/migrations.js';
import { MinecraftRepository } from '../database/repositories/minecraftRepository.js';
import { minecraftRateLimiter } from './rateLimiter.js';
import { pollMinecraftGuild, resetMinecraftMonitorState } from './monitor.js';

describe('minecraft monitor', () => {
  it('deduplicates repeated offline notifications by fingerprint', async () => {
    resetMinecraftMonitorState();
    minecraftRateLimiter.reset();
    const database = new Database(':memory:');
    for (const migration of migrations) database.exec(migration.sql);
    const repo = new MinecraftRepository(database);
    repo.updateSettings('g1', {
      enabled: true,
      notificationChannelId: 'c1',
      notifyOffline: true,
      notifyOnline: false,
      notifyIntervalSeconds: 30,
    });

    const sent: unknown[] = [];
    const client: any = {
      db: { sqlite: database },
      channels: {
        fetch: async () => ({ send: async (payload: unknown) => sent.push(payload) }),
      },
      guilds: { cache: new Map([['g1', { id: 'g1' }]]) },
    };

    const online = async () => ({
      host: 'h',
      port: 25565,
      version: '1.21',
      protocol: 1,
      software: 'paper' as const,
      motd: '',
      playersOnline: 0,
      playersMax: 20,
      playerNames: [],
      latencyMs: 10,
    });
    const offline = async () => null;
    await pollMinecraftGuild(client, 'g1', 100_000, online);
    await pollMinecraftGuild(client, 'g1', 131_000, offline);
    await pollMinecraftGuild(client, 'g1', 162_000, offline);
    assert.equal(sent.length, 1);
    database.close();
  });
});
