import '../test/setup.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Database from 'better-sqlite3';
import { migrations } from '../database/migrations.js';
import { AutomodRepository } from '../database/repositories/automodRepository.js';
import { blockedWord } from '../validation/config.js';
import { analyzeMessage, normalizeContent, type MessageSample } from './detection.js';
import { automodTracker, isExempt, NATIVE_COVERED_RULES } from './service.js';

function createDatabase(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  for (const migration of migrations) db.exec(migration.sql);
  return db;
}

const now = 1_700_000_000_000;

function analyze(content: string, overrides: Partial<Parameters<typeof analyzeMessage>[0]> = {}) {
  return analyzeMessage({
    content,
    mentionCount: 0,
    now,
    history: [],
    settings: {
      ...new AutomodRepository(createDatabase()).getSettings('123456789012345678'),
      enabled: true,
      spamEnabled: true,
      spamWindowSeconds: 10,
      spamMaxMessages: 3,
      spamMaxMentions: 5,
    },
    words: [],
    ...overrides,
  });
}

describe('AutoMod detection', () => {
  it('keeps every filter disabled by default (safe defaults)', () => {
    const defaults = new AutomodRepository(createDatabase()).getSettings('guild');
    assert.equal(defaults.enabled, false);
    assert.equal(defaults.spamEnabled, false);
    assert.equal(defaults.linksEnabled, false);
    assert.equal(defaults.wordsEnabled, false);
    assert.equal(defaults.timeoutMinutes, 0);
    assert.equal(
      analyzeMessage({
        content: 'discord.gg/abc',
        mentionCount: 9,
        now,
        history: [],
        settings: defaults,
        words: [],
      }),
      null,
    );
  });

  it('detects excessive message frequency inside the configured window', () => {
    const history: MessageSample[] = [
      { content: 'a', at: now - 1000 },
      { content: 'b', at: now - 2000 },
    ];
    assert.equal(analyze('c', { history })?.rule, 'frequency');
    const old = [{ content: 'a', at: now - 60_000 }];
    assert.equal(analyze('c', { history: old })?.rule, undefined);
  });

  it('detects identical repeated content', () => {
    const history: MessageSample[] = [
      { content: 'hola', at: now - 1000 },
      { content: 'hola', at: now - 2000 },
    ];
    assert.equal(
      analyze('hola', {
        history,
        settings: {
          ...new AutomodRepository(createDatabase()).getSettings('guild'),
          spamIdentical: true,
        },
      })?.rule,
      'identical',
    );
  });

  it('detects mention spam, invites, links, words and repeated characters', () => {
    const base = new AutomodRepository(createDatabase()).getSettings('guild');
    assert.equal(
      analyze('<@1><@2><@3>', { mentionCount: 6, settings: { ...base, spamMentions: true } })?.rule,
      'mentions',
    );
    assert.equal(
      analyze('entra en discord.gg/abc', { settings: { ...base, invitesEnabled: true } })?.rule,
      'invites',
    );
    assert.equal(
      analyze('mira https://example.com', { settings: { ...base, linksEnabled: true } })?.rule,
      'links',
    );
    assert.equal(
      analyze('palabra prohibida', {
        settings: { ...base, wordsEnabled: true },
        words: ['prohibida'],
      })?.rule,
      'words',
    );
    assert.equal(
      analyze('aaaaaaaaaa', { settings: { ...base, repeatedCharsEnabled: true } })?.rule,
      'repeated',
    );
  });

  it('normalizes zero-width characters and rejects unsafe regex-like words', () => {
    assert.equal(normalizeContent('H\u200bo\u2060LA'), 'hola');
    assert.equal(blockedWord.safeParse('[a-z]+').success, false);
    assert.equal(blockedWord.safeParse('palabra').success, true);
  });

  it('exempts administrators, moderators, bots, webhooks and trusted roles/channels', () => {
    const db = createDatabase();
    const repo = new AutomodRepository(db);
    const base = repo.getSettings('guild');
    const exemptions = [
      { guildId: 'guild', type: 'role' as const, targetId: 'role1' },
      { guildId: 'guild', type: 'channel' as const, targetId: 'channel1' },
    ];
    const member = (options: {
      admin?: boolean;
      moderator?: boolean;
      bot?: boolean;
      roles?: string[];
    }) =>
      ({
        user: { bot: options.bot ?? false },
        permissions: {
          has: (permission: bigint) =>
            options.admin === true || (options.moderator === true && permission === 1n),
          any: () => options.admin === true || options.moderator === true,
        },
        roles: { cache: new Map((options.roles ?? []).map((id) => [id, id])) },
      }) as never;

    assert.equal(isExempt(member({ bot: true }), base, [], 'channel2'), true);
    assert.equal(isExempt(member({ admin: true }), base, [], 'channel2'), true);
    assert.equal(isExempt(member({ moderator: true }), base, [], 'channel2'), true);
    assert.equal(isExempt(member({ roles: ['role1'] }), base, exemptions, 'channel2'), true);
    assert.equal(isExempt(member({}), base, exemptions, 'channel1'), true);
    assert.equal(isExempt(member({}), base, [], 'channel2'), false);
  });

  it('tracks per-user history and throttles repeated actions', () => {
    automodTracker.clear('guild', 'user');
    automodTracker.record('guild', 'user', { content: 'a', at: now }, 10_000);
    assert.equal(automodTracker.recent('guild', 'user', 10_000, now).length, 1);
    assert.equal(automodTracker.shouldThrottle('guild', 'user', now), false);
    assert.equal(automodTracker.shouldThrottle('guild', 'user', now + 1000), true);
    assert.equal(automodTracker.shouldThrottle('guild', 'user', now + 6000), false);
    assert.equal(NATIVE_COVERED_RULES.has('invites'), true);
  });
});
