import '../test/setup.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Database from 'better-sqlite3';
import { migrations } from '../database/migrations.js';
import { AutomodRepository } from '../database/repositories/automodRepository.js';
import { normalizeListValue } from '../commands/automod/automod.js';
import { analyzeMessage, type AnalyzeInput } from './detection.js';
import { isExempt } from './service.js';
import {
  capsRatio,
  collapseRepeats,
  diceSimilarity,
  evasionVariants,
  extractHosts,
  extractInviteCodes,
  hostMatches,
} from './text.js';

const now = 1_700_000_000_000;
const G1 = '100000000000000001';
const G2 = '100000000000000002';

function repo(): AutomodRepository {
  const db = new Database(':memory:');
  for (const migration of migrations) db.exec(migration.sql);
  return new AutomodRepository(db);
}

function run(
  content: string,
  settings: Partial<AnalyzeInput['settings']>,
  extra: Partial<AnalyzeInput> = {},
) {
  return analyzeMessage({
    content,
    mentionCount: 0,
    now,
    history: [],
    settings: { ...repo().getSettings(G1), enabled: true, ...settings },
    words: [],
    ...extra,
  });
}

describe('AutoMod text helpers', () => {
  it('folds leetspeak, homoglyphs, separators and repeats', () => {
    assert.equal(evasionVariants('p.u.t.a').joined, 'puta');
    assert.equal(evasionVariants('pu7@').joined, 'puta');
    assert.equal(evasionVariants('pооp').joined, 'poop'); // Cyrillic о
    assert.equal(collapseRepeats('holaaaaaa', 2), 'holaa');
  });

  it('measures similarity, caps, hosts and invites', () => {
    assert.ok(diceSimilarity('compra seguidores baratos', 'compra seguidores baratos!') > 0.9);
    assert.ok(diceSimilarity('hola que tal', 'adios mundo cruel') < 0.4);
    assert.equal(capsRatio('HOLA A TODOS').ratio, 1);
    assert.deepEqual(extractHosts('mira www.Ejemplo.com/x y https://sub.malo.net:8080/a'), [
      'ejemplo.com',
      'sub.malo.net',
    ]);
    assert.equal(hostMatches('sub.malo.net', 'malo.net'), true);
    assert.equal(hostMatches('notmalo.net', 'malo.net'), false);
    assert.deepEqual(extractInviteCodes('discord.gg/Abc123 y discord.com/invite/xyz'), [
      'abc123',
      'xyz',
    ]);
  });
});

describe('AutoMod advanced detection', () => {
  it('detects word evasion only when enabled and respects the word allow list', () => {
    const words = ['puta'];
    const base = { wordsEnabled: true };
    assert.equal(run('p.u.t.a', base, { words }), null);
    assert.equal(run('p.u.t.a', { ...base, evasionEnabled: true }, { words })?.rule, 'words');
    assert.equal(run('pu7@', { ...base, evasionEnabled: true }, { words })?.rule, 'words');
    const lists = { wordAllow: ['computadora'], domainAllow: [], domainBlock: [], inviteAllow: [] };
    assert.equal(
      run('mi computadora', { ...base, evasionEnabled: true }, { words: ['puta'], lists }),
      null,
    );
    assert.equal(run('esputa', { ...base, evasionEnabled: true }, { words: ['x'] }), null);
  });

  it('applies domain allow/block lists and invite allow list', () => {
    const lists = {
      wordAllow: [],
      domainAllow: ['youtube.com'],
      domainBlock: ['malo.net'],
      inviteAllow: ['miserver'],
    };
    assert.equal(run('https://youtube.com/x', { linksEnabled: true }, { lists }), null);
    assert.equal(run('https://otro.org', { linksEnabled: true }, { lists })?.rule, 'links');
    // blacklist works even when the general link filter is off
    assert.equal(run('ve a sub.malo.net', { linksEnabled: false }, { lists })?.rule, 'links');
    assert.equal(run('discord.gg/miserver', { invitesEnabled: true }, { lists }), null);
    assert.equal(run('discord.gg/otro', { invitesEnabled: true }, { lists })?.rule, 'invites');
  });

  it('flags flood, caps, similar messages and zalgo; sensitivity scales thresholds', () => {
    assert.equal(run('a\n'.repeat(20), { floodEnabled: true })?.rule, 'flood');
    assert.equal(run('ESTO ES UN MENSAJE GRITADO', { capsEnabled: true })?.rule, 'caps');
    assert.equal(run('Hola', { capsEnabled: true }), null);
    const history = [1, 2, 3].map((n) => ({
      content: 'compra seguidores baratos ya',
      at: now - n * 1000,
    }));
    assert.equal(
      run(
        'compra seguidores baratos ya!',
        { similarEnabled: true, spamWindowSeconds: 30, sensitivity: 2 },
        { history },
      )?.rule,
      'similar',
    );
    assert.equal(
      run(
        'compra seguidores baratos ya!',
        { similarEnabled: true, spamWindowSeconds: 30, sensitivity: 1 },
        { history },
      ),
      null,
    );
    assert.equal(run('aaaaaaaa', { repeatedCharsEnabled: true, sensitivity: 2 })?.rule, 'repeated');
    assert.equal(run('aaaaaaaa', { repeatedCharsEnabled: true, sensitivity: 1 }), null);
    assert.equal(run('h̶̵̴̷̸́̂ola', { repeatedCharsEnabled: true })?.rule, 'repeated');
  });

  it('counts role/everyone pings towards mass-mention limit', () => {
    const s = { mentionsEnabled: true, spamMaxMentions: 5 };
    assert.equal(run('hola', s, { mentionCount: 2, broadMentions: 5 })?.rule, 'mentions');
    assert.equal(run('hola', s, { mentionCount: 2 }), null);
  });
});

describe('AutoMod per-guild data and exemptions', () => {
  it('keeps settings, lists and incidents isolated per guild', () => {
    const r = repo();
    r.setSettings(G1, { sensitivity: 3, strikeThreshold: 2 });
    r.addListEntry(G1, 'domain_block', 'malo.net');
    assert.equal(r.getSettings(G2).sensitivity, 2);
    assert.deepEqual(r.getLists(G2).domainBlock, []);
    r.logIncident({
      guildId: G1,
      userId: 'u',
      channelId: 'c',
      rule: 'x',
      action: 'a',
      detail: 'd',
    });
    assert.equal(r.countRecentIncidents(G1, 'u', 60), 1);
    assert.equal(r.countRecentIncidents(G2, 'u', 60), 0);
  });

  it('exempts by channel scope (thread parent / category) and role', () => {
    const member: any = {
      id: 'u',
      user: { bot: false },
      permissions: { has: () => false, any: () => false },
      roles: { cache: { has: (id: string) => id === 'vip' } },
    };
    const exemptions = [
      { guildId: G1, type: 'channel' as const, targetId: 'category-1' },
      { guildId: G1, type: 'role' as const, targetId: 'vip' },
    ];
    const settings = repo().getSettings(G1);
    assert.equal(
      isExempt(member, settings, [exemptions[0]!], ['thread', 'parent', 'category-1']),
      true,
    );
    assert.equal(isExempt(member, settings, [exemptions[0]!], ['thread', 'parent']), false);
    assert.equal(isExempt(member, settings, [exemptions[1]!], 'x'), true);
  });

  it('validates list values', () => {
    assert.equal(normalizeListValue('domain_block', 'www.Malo.net'), 'malo.net');
    assert.equal(normalizeListValue('domain_block', 'https://malo.net'), null);
    assert.equal(normalizeListValue('invite_allow', 'abc-123'), 'abc-123');
    assert.equal(normalizeListValue('invite_allow', 'a/b'), null);
  });
});
