import assert from 'node:assert/strict';
import { after, beforeEach, describe, it } from 'node:test';
import {
  mockButton,
  mockChatInput,
  mockGuild,
  mockMember,
  payloadCustomIds,
  payloadText,
} from '../test/discordMocks.js';
import { startFakeRcon, startTcpSink, type FakeRconServer } from '../test/fakeMinecraft.js';

const PASSWORD = 'H3lper-RCON-pass';
const GUILD = '111111111111111111';
const OTHER_GUILD = '222222222222222222';
const BOT_OWNER = '300000000000000009';
const CHANNEL = '600000000000000001';

let plugins = 'Server Plugins (2): LuckPerms, Vault';
let lpReply = 'Success! TestPlayer now inherits permissions from helper.';
const rcon: FakeRconServer = await startFakeRcon({
  password: PASSWORD,
  respond: (command) => {
    if (command === 'plugins') return plugins;
    if (command.startsWith('lp ')) return lpReply;
    return `ok: ${command}`;
  },
});
const sink = await startTcpSink();

process.env.DISCORD_TOKEN = 'test-token';
process.env.DISCORD_CLIENT_ID = '123456789012345678';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'fatal';
process.env.MINECRAFT_HOST = '127.0.0.1';
process.env.MINECRAFT_PORT = String(sink.port);
process.env.MINECRAFT_RCON_PORT = String(rcon.port);
process.env.MINECRAFT_RCON_PASSWORD = PASSWORD;
process.env.MINECRAFT_RCON_TIMEOUT_MS = '1000';
process.env.MINECRAFT_RCON_RETRIES = '0';
process.env.MINECRAFT_STATUS_TIMEOUT_MS = '500';
process.env.MINECRAFT_GUILD_IDS = `${GUILD},${OTHER_GUILD}`;
process.env.BOT_OWNER_IDS = BOT_OWNER;

const { default: Database } = await import('better-sqlite3');
const { migrations } = await import('../database/migrations.js');
const { MinecraftRepository } = await import('../database/repositories/minecraftRepository.js');
const { TicketRepository } = await import('../database/repositories/ticketRepository.js');
const { HelperRepository } = await import('../database/repositories/helperRepository.js');
const { default: helperCommand } = await import('../commands/helper/helper.js');
const { handleMinecraftButton } = await import('../minecraft/service.js');
const { clearConfirmations } = await import('../minecraft/confirmation.js');
const { classifyLuckPermsOutput, isValidGroupName, isValidSkriptTemplate } =
  await import('./grant.js');

const guild = mockGuild({ id: GUILD, ownerId: '300000000000000001' });
const otherGuild = mockGuild({ id: OTHER_GUILD, ownerId: '300000000000000001' });

after(async () => {
  await Promise.all([rcon.close(), sink.close()]);
});

function setup() {
  const db = new Database(':memory:');
  for (const migration of migrations) db.exec(migration.sql);
  const sent: any[] = [];
  const client: any = {
    db: { sqlite: db },
    channels: {
      fetch: async () => ({ isTextBased: () => true, send: async (p: any) => sent.push(p) }),
    },
  };
  const mc = new MinecraftRepository(db);
  const tickets = new TicketRepository(db);
  const helper = new HelperRepository(db);
  mc.updateSettings(GUILD, { enabled: true });
  mc.addRole(GUILD, 'admin', 'r-admin');
  tickets.addRole(GUILD, 'support', 'r-support');
  helper.updateSettings(GUILD, { enabled: true });
  tickets.create(GUILD, CHANNEL, 'applicant', 'Quiero ser helper');
  const staff = mockMember({ id: 'staff1', guild, roles: ['r-admin', 'r-support'] });
  return { db, client, mc, tickets, helper, sent, staff };
}

async function accept(client: any, member: any, user: string, player: string, channelId = CHANNEL) {
  const interaction = mockChatInput({
    member,
    subcommand: 'aceptar',
    options: { usuario_discord: user, jugador_minecraft: player },
    channelId,
  });
  await helperCommand.execute(interaction, client);
  return interaction;
}

function text(interaction: any): string {
  return interaction.recorder.events.map((e: any) => payloadText(e.payload)).join('\n');
}

function confirmId(interaction: any): string | undefined {
  const events = interaction.recorder.events.filter((e: any) => e.type === 'editReply');
  return payloadCustomIds(events.at(-1)?.payload).find((id: string) =>
    id.startsWith('mc:confirm:'),
  );
}

async function confirm(client: any, member: any, id: string) {
  const button = mockButton({ member, customId: id });
  await handleMinecraftButton(client, button);
  return button;
}

describe('helper validators', () => {
  it('validates group names and Skript templates', () => {
    assert.ok(isValidGroupName('helper'));
    assert.ok(!isValidGroupName('Helper; op x'));
    assert.ok(isValidSkriptTemplate('helperaccept {player}'));
    assert.ok(!isValidSkriptTemplate('helperaccept {player}; stop'));
    assert.ok(!isValidSkriptTemplate('op {player}\nstop'));
  });

  it('classifies LuckPerms output without trusting unknown text', () => {
    assert.equal(
      classifyLuckPermsOutput('Success! X now inherits permissions from helper.').result,
      'success',
    );
    assert.equal(classifyLuckPermsOutput('A user for X could not be found.').result, 'failure');
    assert.equal(classifyLuckPermsOutput('').result, 'failure');
    assert.equal(classifyLuckPermsOutput('algo raro').result, 'failure');
  });
});

describe('/helper aceptar', () => {
  beforeEach(() => {
    clearConfirmations();
    plugins = 'Server Plugins (2): LuckPerms, Vault';
    lpReply = 'Success! TestPlayer now inherits permissions from helper.';
  });

  it('grants the LuckPerms group after confirmation and records everything', async () => {
    const { client, helper, mc, sent, staff } = setup();
    const before = rcon.commands.length;
    const asked = await accept(client, staff, 'applicant', 'TestPlayer');
    const id = confirmId(asked);
    assert.ok(id, 'must ask for confirmation');
    assert.equal(rcon.commands.length, before, 'nothing runs before confirming');
    await confirm(client, staff, id!);
    assert.equal(rcon.commands.at(-1), 'lp user TestPlayer parent add helper');
    const grant = helper.listGrants(GUILD)[0];
    assert.equal(grant?.result, 'success');
    assert.equal(grant?.approvedBy, 'staff1');
    assert.equal(grant?.player, 'TestPlayer');
    assert.equal(mc.listAudit(GUILD, 1)[0]?.action, 'helper-grant');
    assert.ok(sent.length >= 1, 'reports inside the ticket');
  });

  it('refuses outside a ticket and for a user not in the ticket', async () => {
    const { client, staff } = setup();
    assert.match(
      text(await accept(client, staff, 'applicant', 'TestPlayer', '999')),
      /dentro de un ticket/,
    );
    assert.match(text(await accept(client, staff, 'stranger', 'TestPlayer')), /no forma parte/);
  });

  it('refuses members who are not ticket staff, even with the Minecraft admin role', async () => {
    const { client } = setup();
    const notStaff = mockMember({ id: 'x', guild, roles: ['r-admin'] });
    assert.match(
      text(await accept(client, notStaff, 'applicant', 'TestPlayer')),
      /equipo de soporte/,
    );
  });

  it('rejects invalid player names and injection attempts', async () => {
    const { client, staff } = setup();
    for (const bad of ['a b', 'x;op', 'Name\nstop', 'waytoolongplayername1']) {
      const interaction = await accept(client, staff, 'applicant', bad);
      assert.equal(confirmId(interaction), undefined, bad);
    }
  });

  it('rejects a mismatch with an existing link', async () => {
    const { client, helper, staff } = setup();
    helper.link(GUILD, 'applicant', 'RealOwner', 'staff1');
    assert.match(text(await accept(client, staff, 'applicant', 'Other')), /vinculado/);
    helper.link(GUILD, 'someoneelse', 'Taken', 'staff1');
    assert.match(text(await accept(client, staff, 'applicant', 'Taken')), /vinculado/);
  });

  it('requires a link when configured', async () => {
    const { client, helper, staff } = setup();
    helper.updateSettings(GUILD, { requireLink: true });
    assert.match(text(await accept(client, staff, 'applicant', 'TestPlayer')), /vincular/);
  });

  it('is disabled by default', async () => {
    const { client, helper, staff } = setup();
    helper.updateSettings(GUILD, { enabled: false });
    assert.match(text(await accept(client, staff, 'applicant', 'TestPlayer')), /desactivada/);
  });

  it('reports failure when LuckPerms is not installed and does not run lp', async () => {
    plugins = 'Server Plugins (1): Vault';
    const { client, helper, staff } = setup();
    const id = confirmId(await accept(client, staff, 'applicant', 'TestPlayer'))!;
    const before = rcon.commands.length;
    await confirm(client, staff, id);
    assert.ok(!rcon.commands.slice(before).some((c) => c.startsWith('lp ')));
    assert.equal(helper.listGrants(GUILD)[0]?.result, 'failure');
  });

  it('does not report success when LuckPerms answers with an error', async () => {
    lpReply = 'A user for TestPlayer could not be found.';
    const { client, helper, staff } = setup();
    const id = confirmId(await accept(client, staff, 'applicant', 'TestPlayer'))!;
    await confirm(client, staff, id);
    assert.equal(helper.listGrants(GUILD)[0]?.result, 'failure');
  });

  it('a confirmation cannot be used by someone else', async () => {
    const { client, helper, staff } = setup();
    const id = confirmId(await accept(client, staff, 'applicant', 'TestPlayer'))!;
    const intruder = mockMember({ id: 'intruder', guild, roles: ['r-admin', 'r-support'] });
    await confirm(client, intruder, id);
    assert.equal(helper.listGrants(GUILD).length, 0);
  });

  it('runs a Skript command only if it is in the console allowlist', async () => {
    plugins = 'Server Plugins (1): Skript';
    const { client, helper, mc, staff } = setup();
    helper.updateSettings(GUILD, { method: 'skript', skriptCommand: 'helperaccept {player}' });
    assert.match(text(await accept(client, staff, 'applicant', 'TestPlayer')), /no está permitido/);
    mc.addAllowedCommand(GUILD, 'helperaccept', '\\w{1,16}', 'staff1');
    const id = confirmId(await accept(client, staff, 'applicant', 'TestPlayer'));
    assert.ok(id);
    await confirm(client, staff, id!);
    assert.equal(rcon.commands.at(-1), 'helperaccept TestPlayer');
    assert.equal(helper.listGrants(GUILD)[0]?.method, 'skript');
  });

  it('keeps helper data and links isolated per guild', () => {
    const { helper } = setup();
    helper.updateSettings(OTHER_GUILD, { enabled: false, groupName: 'ayudante' });
    assert.equal(helper.getSettings(GUILD).groupName, 'helper');
    assert.equal(helper.getSettings(GUILD).enabled, true);
    helper.link(GUILD, 'u1', 'Steve', 'a');
    assert.equal(helper.getLinkByDiscord(OTHER_GUILD, 'u1'), null);
    assert.ok(
      helper.link(OTHER_GUILD, 'u2', 'Steve', 'a'),
      'same player may link in another guild',
    );
    void otherGuild;
  });
});
