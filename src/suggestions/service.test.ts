import '../test/setup.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Database from 'better-sqlite3';
import { migrations } from '../database/migrations.js';
import { SuggestionRepository } from '../database/repositories/suggestionRepository.js';
import { isStaff, suggestionComponents, suggestionEmbed, suggestionModal } from './service.js';
import { SUGGEST_MODAL, SUGGEST_TEXT_INPUT } from './constants.js';
import { suggestionText } from '../validation/config.js';

function database(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  for (const migration of migrations) db.exec(migration.sql);
  return db;
}

function fakeMember(options: { moderator?: boolean; role?: string; id?: string }) {
  return {
    id: options.id ?? 'user',
    roles: { cache: new Map(options.role ? [[options.role, options.role]] : []) },
    permissions: { has: () => options.moderator === true },
  } as never;
}

describe('suggestions system', () => {
  it('builds a persistent modal and vote components', () => {
    const modal = suggestionModal().toJSON();
    assert.equal(modal.custom_id, SUGGEST_MODAL);
    const input = modal.components[0]?.components[0];
    assert.equal(input?.custom_id, SUGGEST_TEXT_INPUT);
    const components = suggestionComponents(42);
    assert.equal(components.components.length, 3);
    assert.match(String(components.components[0]?.data.custom_id), /suggest_vote:42:up/);
  });

  it('validates suggestion text and renders statuses and vote counts', () => {
    assert.equal(suggestionText.safeParse(' corto ').success, false);
    assert.equal(suggestionText.safeParse('Una sugerencia válida').success, true);
    const db = database();
    try {
      const repo = new SuggestionRepository(db);
      const suggestion = repo.create({
        guildId: 'guild',
        authorId: 'user',
        channelId: 'channel',
        content: 'Añade más canales',
      });
      repo.vote('guild', suggestion.id, 'voter1', 1);
      repo.vote('guild', suggestion.id, 'voter2', -1);
      const embed = suggestionEmbed(repo.get('guild', suggestion.id)!, repo.counts(suggestion.id));
      assert.match(JSON.stringify(embed.data), /Sugerencia #/);
      assert.match(JSON.stringify(embed.data), /👍 1/);
      assert.match(JSON.stringify(embed.data), /👎 1/);
      assert.match(JSON.stringify(embed.data), /Pendiente/);
    } finally {
      db.close();
    }
  });

  it('restricts staff actions to configured roles and moderator permissions', () => {
    const settings = {
      guildId: 'guild',
      channelId: 'channel',
      staffRoleId: 'staff-role',
      enabled: true,
    };
    assert.equal(isStaff(fakeMember({ role: 'staff-role' }), settings), true);
    assert.equal(isStaff(fakeMember({ moderator: true }), settings), true);
    assert.equal(isStaff(fakeMember({ id: 'someone' }), settings), false);
  });
});
