import '../test/setup.js';
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import Database from 'better-sqlite3';
import { migrations } from '../database/migrations.js';
import { MinecraftRepository } from '../database/repositories/minecraftRepository.js';
import { pollMinecraftGuild, resetMinecraftMonitorState } from './monitor.js';
import type { PlayerSnapshot } from './players.js';
import type { MinecraftStatus } from './types.js';

const STEP = 31_000;

function status(names: string[], online = names.length): MinecraftStatus {
  return {
    host: 'h',
    port: 25565,
    version: '1.21',
    protocol: 767,
    software: 'paper',
    motd: '',
    playersOnline: online,
    playersMax: 50,
    playerNames: names,
    latencyMs: 10,
  };
}

function setup(database = new Database(':memory:'), migrate = true) {
  if (migrate) for (const migration of migrations) database.exec(migration.sql);
  const repo = new MinecraftRepository(database);
  repo.updateSettings('g1', {
    enabled: true,
    notificationChannelId: 'c1',
    notifyJoin: true,
    notifyLeave: true,
    notifyOnline: true,
    notifyOffline: true,
    notifyIntervalSeconds: 30,
  });
  const sent: string[] = [];
  const client: any = {
    db: { sqlite: database },
    channels: {
      fetch: async () => ({
        send: async (payload: {
          embeds: Array<{ data: { title?: string; description?: string } }>;
        }) => {
          for (const embed of payload.embeds) {
            sent.push(`${embed.data.title ?? ''}\n${embed.data.description ?? ''}`);
          }
        },
      }),
    },
  };
  let now = 100_000;
  const poll = async (
    result: MinecraftStatus | null,
    listPlayers: () => Promise<PlayerSnapshot | null> = async () => null,
  ) => {
    now += STEP;
    await pollMinecraftGuild(client, 'g1', now, {
      query: async () => result,
      listPlayers,
      offlineThreshold: 3,
    });
  };
  return { database, repo, sent, poll };
}

const joins = (sent: string[]) => sent.filter((text) => text.includes('Jugadores conectados'));
const leaves = (sent: string[]) => sent.filter((text) => text.includes('Jugadores desconectados'));

describe('minecraft monitor notifications', () => {
  beforeEach(() => resetMinecraftMonitorState());

  it('announces every player when several join or leave in the same poll', async () => {
    const { sent, poll } = setup();
    await poll(status([]));
    await poll(status(['Alex', 'Steve', 'Notch']));
    assert.equal(joins(sent).length, 1);
    for (const name of ['Alex', 'Steve', 'Notch']) assert.match(joins(sent)[0]!, new RegExp(name));

    await poll(status([]));
    assert.equal(leaves(sent).length, 1);
    for (const name of ['Alex', 'Steve', 'Notch']) assert.match(leaves(sent)[0]!, new RegExp(name));
  });

  it('announces reconnects within the same hour as new sessions', async () => {
    const { sent, poll } = setup();
    await poll(status([]));
    await poll(status(['Alex']));
    await poll(status([]));
    await poll(status(['Alex']));
    await poll(status([]));
    assert.equal(joins(sent).length, 2);
    assert.equal(leaves(sent).length, 2);
  });

  it('does not report offline until several consecutive polls fail', async () => {
    const { sent, poll } = setup();
    const offline = () => sent.filter((text) => text.includes('Servidor offline'));
    await poll(status([]));
    await poll(null);
    await poll(null);
    await poll(status([]));
    assert.equal(offline().length, 0, 'two lost pings are not an outage');

    await poll(null);
    await poll(null);
    await poll(null);
    await poll(null);
    assert.equal(offline().length, 1, 'reported exactly once per outage');
    await poll(status([]));
    assert.equal(sent.filter((text) => text.includes('Servidor online')).length, 1);
  });

  it('reports every outage, not only the first one', async () => {
    const { sent, poll } = setup();
    await poll(status([]));
    for (let round = 0; round < 2; round += 1) {
      await poll(null);
      await poll(null);
      await poll(null);
      await poll(status([]));
    }
    assert.equal(sent.filter((text) => text.includes('Servidor offline')).length, 2);
    assert.equal(sent.filter((text) => text.includes('Servidor online')).length, 2);
  });

  it('does not invent leaves from a partial ping sample', async () => {
    const { sent, poll } = setup();
    const first = Array.from({ length: 12 }, (_, index) => `First${index}`);
    await poll(status([]));
    await poll(status(first));
    assert.equal(joins(sent).length, 1);
    // 30 players online but the ping only shows a different subset of 12.
    await poll(
      status(
        Array.from({ length: 12 }, (_, index) => `Other${index}`),
        30,
      ),
    );
    assert.equal(leaves(sent).length, 0);
    assert.equal(joins(sent).length, 1);
  });

  it('prefers the complete RCON player list over the ping sample', async () => {
    const { sent, poll } = setup();
    const everyone = Array.from({ length: 30 }, (_, index) => `Player${index}`);
    await poll(status([]), async () => ({ complete: true, players: [] }));
    await poll(status(everyone.slice(0, 12), 30), async () => ({
      complete: true,
      players: everyone,
    }));
    assert.equal(joins(sent).length, 1);
    assert.match(joins(sent)[0]!, /Player29/);
  });

  it('does not re-announce players that were online before a restart', async () => {
    const database = new Database(':memory:');
    const first = setup(database);
    await first.poll(status([]));
    await first.poll(status(['Alex']));
    assert.equal(joins(first.sent).length, 1);

    resetMinecraftMonitorState(); // simulate a bot restart with the same database
    const second = setup(database, false);
    await second.poll(status(['Alex']));
    assert.equal(joins(second.sent).length, 0);
    await second.poll(status([]));
    assert.equal(leaves(second.sent).length, 1);
  });
});
