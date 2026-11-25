import '../test/setup.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Database from 'better-sqlite3';
import { TicketRepository } from '../database/repositories/ticketRepository.js';
import { migrations } from '../database/migrations.js';
import { neutralizeMentions } from './format.js';
import {
  canCloseTicket,
  canManageParticipants,
  canOpenTicket,
  isTicketStaff,
  type TicketActor,
  type TicketPolicy,
} from './permissions.js';

const G1 = '100000000000000001';
const G2 = '100000000000000002';

function db(): Database.Database {
  const database = new Database(':memory:');
  database.pragma('foreign_keys = ON');
  for (const migration of migrations) database.exec(migration.sql);
  return database;
}

const policy: TicketPolicy = {
  supportRoleIds: ['sup'],
  excludedRoleIds: ['bad'],
  closerRoleIds: [],
  creatorCanClose: true,
};
const actor = (id: string, roles: string[] = [], isAdministrator = false): TicketActor => ({
  id,
  roleIds: new Set(roles),
  isAdministrator,
});

describe('ticket permissions', () => {
  it('limits staff to support roles and blocks excluded roles', () => {
    assert.equal(isTicketStaff(actor('a', ['sup']), policy), true);
    assert.equal(isTicketStaff(actor('a', ['sup', 'bad']), policy), false);
    assert.equal(isTicketStaff(actor('a', ['other']), policy), false);
    assert.equal(isTicketStaff(actor('a', ['bad'], true), policy), true);
    assert.equal(canOpenTicket(actor('a', ['bad']), policy), false);
    assert.equal(canOpenTicket(actor('a'), policy), true);
  });

  it('decides who can close and manage participants', () => {
    const ticket = { creatorId: 'creator', claimerId: null } as never;
    assert.equal(canCloseTicket(actor('creator'), policy, ticket), true);
    assert.equal(
      canCloseTicket(actor('creator'), { ...policy, creatorCanClose: false }, ticket),
      false,
    );
    assert.equal(canCloseTicket(actor('x'), policy, ticket), false);
    assert.equal(canCloseTicket(actor('x', ['sup']), policy, ticket), true);
    assert.equal(canCloseTicket(actor('x', [], true), policy, ticket), true);
    assert.equal(canManageParticipants(actor('x'), policy, ticket), false);
  });

  it('neutralizes mass mentions', () => {
    assert.ok(!neutralizeMentions('@everyone @here <@123>').includes('@everyone'));
  });
});

describe('TicketRepository v1.2.0', () => {
  it('keeps settings and roles independent per guild', () => {
    const d = db();
    const repo = new TicketRepository(d);
    repo.updateSettings(G1, { categoryId: 'cat1', allowMultiple: true, maxOpenPerUser: 3 });
    repo.addRole(G1, 'support', 'r1');
    repo.addRole(G2, 'support', 'r2');
    assert.equal(repo.getSettings(G1).categoryId, 'cat1');
    assert.equal(repo.getSettings(G2).categoryId, null);
    assert.deepEqual(repo.listRoles(G1, 'support'), ['r1']);
    assert.deepEqual(repo.listRoles(G2, 'support'), ['r2']);
    assert.equal(repo.removeRole(G1, 'support', 'r2'), false);
    d.close();
  });

  it('runs the accept → claim → close lifecycle atomically', () => {
    const d = db();
    const repo = new TicketRepository(d);
    const ticket = repo.create(G1, 'ch1', 'u1', 'help', 1);
    assert.equal(repo.accept('ch1', 's1'), true);
    assert.equal(repo.accept('ch1', 's2'), false);
    assert.equal(repo.claim('ch1', 's1'), true);
    assert.equal(repo.claim('ch1', 's2'), false);
    assert.equal(repo.beginClose('ch1', 's1'), true);
    assert.equal(repo.beginClose('ch1', 's1'), false);
    assert.equal(repo.listUnfinished().length, 1);
    assert.equal(repo.finishClose('ch1', 'text'), true);
    assert.equal(repo.listUnfinished().length, 0);
    assert.equal(repo.getById(ticket.id)?.status, 'closed');
    d.close();
  });

  it('counts open tickets per creator per guild and records events', () => {
    const d = db();
    const repo = new TicketRepository(d);
    const t = repo.create(G1, 'c1', 'u1', 'a', 1);
    repo.create(G2, 'c2', 'u1', 'b', 1);
    assert.equal(repo.countOpenByCreator(G1, 'u1'), 1);
    repo.recordEvent({ guildId: G1, ticketId: t.id, type: 'opened', actorId: 'u1' });
    assert.equal(repo.listEvents(t.id).length, 1);
    assert.equal(repo.forceClose('c1', 'gone'), true);
    assert.equal(repo.countOpenByCreator(G1, 'u1'), 0);
    d.close();
  });
});
