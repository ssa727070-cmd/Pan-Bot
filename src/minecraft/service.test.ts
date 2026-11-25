/**
 * End-to-end tests of the Minecraft integration against fake TCP/RCON servers.
 *
 * node:test runs each test file in its own process, so the environment below is
 * set before any application module (and therefore env.ts) is loaded.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import {
  createRecorder,
  mockButton,
  mockChatInput,
  mockGuild,
  mockMember,
  payloadCustomIds,
  payloadText,
} from '../test/discordMocks.js';
import {
  startFakeRcon,
  startTcpSink,
  type FakeRconServer,
  type TcpSink,
} from '../test/fakeMinecraft.js';

const PASSWORD = 'S3cr3t-RCON-pass';
const GUILD = '111111111111111111';
const FOREIGN_GUILD = '222222222222222222';
const GUILD_OWNER = '300000000000000001';
const BOT_OWNER = '300000000000000009';

const legit: FakeRconServer = await startFakeRcon({
  password: PASSWORD,
  respond: (command) =>
    command === 'list'
      ? `There are 0 of a max of 20 players online: (debug password=${PASSWORD})`
      : `ok: ${command}`,
});
const attacker: FakeRconServer = await startFakeRcon({ password: '' });
const statusSink: TcpSink = await startTcpSink();
const attackerSink: TcpSink = await startTcpSink();

process.env.DISCORD_TOKEN = 'test-token';
process.env.DISCORD_CLIENT_ID = '123456789012345678';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'fatal';
process.env.MINECRAFT_HOST = '127.0.0.1';
process.env.MINECRAFT_PORT = String(statusSink.port);
process.env.MINECRAFT_RCON_PORT = String(legit.port);
process.env.MINECRAFT_RCON_PASSWORD = PASSWORD;
process.env.MINECRAFT_RCON_TIMEOUT_MS = '1000';
process.env.MINECRAFT_RCON_RETRIES = '0';
process.env.MINECRAFT_STATUS_TIMEOUT_MS = '500';
process.env.MINECRAFT_GUILD_IDS = GUILD;
process.env.BOT_OWNER_IDS = BOT_OWNER;

const { default: Database } = await import('better-sqlite3');
const { migrations } = await import('../database/migrations.js');
const { MinecraftRepository } = await import('../database/repositories/minecraftRepository.js');
const { default: mcCommand } = await import('../commands/minecraft/mc.js');
const { default: mcadminCommand } = await import('../commands/minecraft/mcadmin.js');
const { handleMinecraftButton } = await import('./service.js');
const { getMinecraftConnection, runRconCommand } = await import('./connection.js');
const { clearConfirmations } = await import('./confirmation.js');

function createClient() {
  const database = new Database(':memory:');
  for (const migration of migrations) database.exec(migration.sql);
  const auditChannel: unknown[] = [];
  const client: any = {
    db: { sqlite: database },
    channels: {
      fetch: async () => ({ send: async (payload: unknown) => auditChannel.push(payload) }),
    },
  };
  const repo = new MinecraftRepository(database);
  return { client, repo, auditChannel };
}

const guild = mockGuild({ id: GUILD, ownerId: GUILD_OWNER });
const foreignGuild = mockGuild({ id: FOREIGN_GUILD, ownerId: GUILD_OWNER });

function last(interaction: any, type?: string) {
  const events = interaction.recorder.events.filter((event: any) => !type || event.type === type);
  return events[events.length - 1];
}

function allText(interaction: any): string {
  return interaction.recorder.events.map((event: any) => payloadText(event.payload)).join('\n');
}

async function runMc(client: any, member: any, subcommand: string, options = {}) {
  const interaction = mockChatInput({ member, subcommand, options });
  await mcCommand.execute(interaction, client);
  return interaction;
}

async function runMcadmin(client: any, member: any, subcommand: string, options = {}) {
  const interaction = mockChatInput({ member, subcommand, options });
  await mcadminCommand.execute(interaction, client);
  return interaction;
}

async function press(client: any, member: any, customId: string) {
  const interaction = mockButton({ member, customId });
  await handleMinecraftButton(client, interaction);
  return interaction;
}

/** Sets up an enabled guild with explicit admin/moderator roles. */
function enabledGuild() {
  const context = createClient();
  context.repo.updateSettings(GUILD, { enabled: true, auditChannelId: '400000000000000001' });
  context.repo.addRole(GUILD, 'admin', 'r-admin');
  context.repo.addRole(GUILD, 'moderator', 'r-mod');
  return {
    ...context,
    admin: mockMember({ id: '500000000000000001', guild, roles: ['r-admin'] }),
    moderator: mockMember({ id: '500000000000000002', guild, roles: ['r-mod'] }),
  };
}

after(async () => {
  await Promise.all([legit.close(), attacker.close(), statusSink.close(), attackerSink.close()]);
});

describe('RCON credential theft and SSRF protection', () => {
  beforeEach(() => clearConfirmations());

  it('/mcadmin setup no longer accepts a host or ports', () => {
    const json = mcadminCommand.data.toJSON() as any;
    const setup = json.options.find((option: any) => option.name === 'setup');
    const names = setup.options.map((option: any) => option.name);
    for (const forbidden of ['host', 'query_port', 'rcon_port']) {
      assert.ok(!names.includes(forbidden), `${forbidden} must not be configurable from Discord`);
    }
  });

  it('ignores a host smuggled into /mcadmin setup', async () => {
    const { client, repo } = createClient();
    const owner = mockMember({ id: GUILD_OWNER, guild });
    await runMcadmin(client, owner, 'setup', {
      enabled: true,
      host: '127.0.0.1',
      rcon_port: attacker.port,
    });
    const settings = repo.getSettings(GUILD);
    assert.equal(settings.enabled, true);
    assert.equal(settings.host, null);
    assert.equal(settings.rconPort, null);
  });

  it('never sends the password to a host/port stored in the database', async () => {
    const { client, repo, moderator } = { ...enabledGuild() };
    // Simulates legacy v1.1.5 overrides or a tampered database row.
    repo.updateSettings(GUILD, {
      host: '127.0.0.1',
      rconPort: attacker.port,
      queryPort: attackerSink.port,
    });
    const connection = getMinecraftConnection(client, GUILD);
    assert.equal(connection.rconPort, legit.port);
    assert.equal(connection.queryPort, statusSink.port);
    assert.equal(connection.ignoredOverrides, true);

    const before = legit.passwords.length;
    await runMc(client, moderator, 'kick', { jugador: 'Steve' });
    await runMc(client, moderator, 'status');

    assert.equal(attacker.connections, 0, 'attacker RCON server must never be contacted');
    assert.equal(attacker.passwords.length, 0);
    assert.equal(attackerSink.connections.length, 0, 'status ping must not reach the stored host');
    assert.equal(legit.passwords.length, before + 1);
    assert.equal(legit.passwords.at(-1), PASSWORD);
    assert.equal(legit.commands.at(-1), 'kick Steve "Moderated by PanBot"');
  });

  it('denies RCON to Discord guilds not listed in MINECRAFT_GUILD_IDS', async () => {
    const { client, repo } = createClient();
    repo.updateSettings(FOREIGN_GUILD, { enabled: true });
    const foreignOwner = mockMember({ id: GUILD_OWNER, guild: foreignGuild });
    const before = legit.connections;

    const interaction = await runMc(client, foreignOwner, 'kick', { jugador: 'Steve' });
    assert.match(allText(interaction), /no está autorizado/);
    assert.equal(legit.connections, before);
    await assert.rejects(() => runRconCommand(client, FOREIGN_GUILD, 'list'), /no está autorizado/);
    assert.equal(legit.connections, before);
  });

  it('redacts the RCON password from command output, replies and audit', async () => {
    const { client, repo, admin } = enabledGuild();
    const interaction = await runMc(client, admin, 'command', { comando: 'list' });
    const text = allText(interaction);
    assert.ok(legit.commands.includes('list'));
    assert.ok(!text.includes(PASSWORD), 'password leaked to Discord');
    assert.match(text, /REDACTED/);
    const audit = JSON.stringify(repo.listAudit(GUILD, 50));
    assert.ok(!audit.includes(PASSWORD), 'password leaked to the audit log');
  });
});

describe('secrets in errors', () => {
  it('rejected RCON authentication never echoes the password', async () => {
    const { client } = createClient();
    const wrong = await startFakeRcon({ password: 'the-real-one' });
    try {
      await assert.rejects(
        () =>
          runRconCommand(client, GUILD, 'list', {
            host: '127.0.0.1',
            queryPort: 1,
            rconPort: wrong.port,
            password: PASSWORD,
            rconTimeoutMs: 1000,
            rconRetries: 0,
            statusTimeoutMs: 500,
            allowedGuildIds: [GUILD],
          }),
        (error: Error) => {
          assert.ok(!error.message.includes(PASSWORD));
          assert.ok(!String(error.stack).includes(PASSWORD));
          return /Autenticación RCON rechazada/.test(error.message);
        },
      );
    } finally {
      await wrong.close();
    }
  });
});

describe('blocked console commands through the full stack', () => {
  beforeEach(() => clearConfirmations());

  it('blocks namespaced and execute bypasses in unrestricted owner mode', async () => {
    const { client, repo } = enabledGuild();
    const owner = mockMember({ id: GUILD_OWNER, guild });
    await runMcadmin(client, owner, 'console-mode', { enabled: true });
    assert.equal(repo.getSettings(GUILD).unrestrictedConsole, true);

    for (const command of [
      'minecraft:stop',
      'execute run stop',
      'bukkit:reload',
      'sudo Admin stop',
    ]) {
      const interaction = await runMc(client, owner, 'command', { comando: command });
      assert.match(allText(interaction), /bloquead|no se permite/, command);
      assert.deepEqual(payloadCustomIds(last(interaction, 'editReply').payload), []);
    }
    assert.ok(!legit.commands.some((command) => /stop|reload/.test(command)));
  });

  it('rejects blocked commands when added to the allowlist', async () => {
    const { client, repo, admin } = enabledGuild();
    for (const name of ['minecraft:stop', 'execute', 'sudo']) {
      const interaction = await runMcadmin(client, admin, 'allowlist', {
        accion: 'add',
        comando: name,
      });
      assert.match(allText(interaction), /bloqueado|no seguro/, name);
    }
    assert.equal(repo.listAllowedCommands(GUILD).length, 0);
  });
});

describe('permissions', () => {
  beforeEach(() => clearConfirmations());

  it('/mcadmin requires the Minecraft admin level, not just Manage Guild', async () => {
    const { client, repo, moderator } = enabledGuild();
    const manager = mockMember({
      id: '600000000000000001',
      guild,
      perms: ['ManageGuild', 'Administrator'],
    });
    for (const member of [manager, moderator]) {
      const interaction = await runMcadmin(client, member, 'setup', { enabled: false });
      assert.match(allText(interaction), /No tienes permiso/);
      const allow = await runMcadmin(client, member, 'allowlist', {
        accion: 'add',
        comando: 'weather',
      });
      assert.match(allText(allow), /No tienes permiso/);
    }
    assert.equal(repo.getSettings(GUILD).enabled, true);
    assert.equal(repo.listAllowedCommands(GUILD).length, 0);
  });

  it('a Minecraft admin cannot grant the owner level', async () => {
    const { client, repo, admin } = enabledGuild();
    const interaction = await runMcadmin(client, admin, 'roles', {
      nivel: 'owner',
      accion: 'add',
      rol: 'r-admin',
    });
    assert.match(allText(interaction), /Solo el dueño/);
    assert.equal(repo.listRoles(GUILD, 'owner').length, 0);
  });

  it('the application ID is not an owner for console-mode', async () => {
    const { client, repo } = enabledGuild();
    const impostor = mockMember({ id: '123456789012345678', guild, roles: ['r-admin'] });
    await runMcadmin(client, impostor, 'console-mode', { enabled: true });
    assert.equal(repo.getSettings(GUILD).unrestrictedConsole, false);

    const botOwner = mockMember({ id: BOT_OWNER, guild });
    await runMcadmin(client, botOwner, 'console-mode', { enabled: true });
    assert.equal(repo.getSettings(GUILD).unrestrictedConsole, true);
  });
});

describe('MINECRAFT_GUILD_IDS on every route', () => {
  beforeEach(() => clearConfirmations());

  it('unauthorised guilds cannot configure or reach RCON through any route', async () => {
    const { client, repo } = createClient();
    repo.updateSettings(FOREIGN_GUILD, { enabled: true, notificationChannelId: 'c' });
    repo.addAllowedCommand(FOREIGN_GUILD, 'weather', 'clear|rain', GUILD_OWNER);
    const foreignOwner = mockMember({ id: GUILD_OWNER, guild: foreignGuild });
    const beforeConnections = legit.connections;

    for (const [subcommand, options] of [
      ['console-mode', { enabled: true }],
      ['setup', { enabled: true }],
      ['maintenance', { enabled: true, whitelist: true }],
      ['allowlist', { accion: 'add', comando: 'time' }],
    ] as const) {
      const interaction = await runMcadmin(client, foreignOwner, subcommand, options);
      assert.match(allText(interaction), /no está autorizado/, subcommand);
    }
    assert.equal(repo.getSettings(FOREIGN_GUILD).unrestrictedConsole, false);

    for (const [subcommand, options] of [
      ['kick', { jugador: 'Steve' }],
      ['ban', { jugador: 'Steve' }],
      ['command', { comando: 'list' }],
      ['command', { comando: 'weather rain' }],
      ['gamerules', { regla: 'keepInventory' }],
      ['status', {}],
    ] as const) {
      const interaction = await runMc(client, foreignOwner, subcommand, options);
      assert.match(allText(interaction), /no está autorizado/, subcommand);
      assert.deepEqual(payloadCustomIds(last(interaction, 'editReply').payload), []);
    }

    // The background monitor must not use RCON for unauthorised guilds either.
    const { pollMinecraftGuild } = await import('./monitor.js');
    await pollMinecraftGuild(client, FOREIGN_GUILD, Date.now());
    assert.equal(legit.connections, beforeConnections, 'no RCON connection for foreign guild');
  });

  it('the monitor uses RCON list only for authorised guilds', async () => {
    const { client, repo } = createClient();
    repo.updateSettings(GUILD, { enabled: true });
    const { pollMinecraftGuild, resetMinecraftMonitorState } = await import('./monitor.js');
    resetMinecraftMonitorState();
    const before = legit.commands.length;
    await pollMinecraftGuild(client, GUILD, Date.now(), { query: async () => null });
    // Status failed → no RCON needed; now succeed and expect the RCON list call.
    resetMinecraftMonitorState();
    await pollMinecraftGuild(client, GUILD, Date.now(), {
      query: async () => ({
        host: '127.0.0.1',
        port: 1,
        version: '1.21',
        protocol: 767,
        software: 'paper',
        motd: '',
        playersOnline: 0,
        playersMax: 20,
        playerNames: [],
        latencyMs: 1,
      }),
    });
    assert.ok(legit.commands.slice(before).some((command) => /^(minecraft:)?list$/.test(command)));
  });
});

describe('v1.2.0 command surface', () => {
  beforeEach(() => clearConfirmations());

  it('/mc op and /mc deop require confirmation before touching RCON', async () => {
    const { client, repo, admin } = enabledGuild();
    for (const [sub, expected] of [
      ['op', 'op Helper1'],
      ['deop', 'deop Helper1'],
    ] as const) {
      const before = legit.commands.length;
      const interaction = await runMc(client, admin, sub, { jugador: 'Helper1' });
      const confirm = payloadCustomIds(last(interaction, 'editReply').payload).find((id) =>
        id.startsWith('mc:confirm:'),
      );
      assert.ok(confirm, `${sub} must ask for confirmation`);
      assert.equal(legit.commands.length, before, `${sub} must not run before confirming`);
      await press(client, admin, confirm!);
      assert.equal(legit.commands.at(-1), expected);
      assert.equal(repo.listAudit(GUILD, 1)[0]?.action, sub);
    }
  });

  it('op confirmation cannot be used by another member or replayed', async () => {
    const { client, admin } = enabledGuild();
    const interaction = await runMc(client, admin, 'op', { jugador: 'Helper2' });
    const confirm = payloadCustomIds(last(interaction, 'editReply').payload).find((id) =>
      id.startsWith('mc:confirm:'),
    )!;
    const intruder = mockMember({ id: '700000000000000002', guild, roles: ['r-admin'] });
    assert.match(allText(await press(client, intruder, confirm)), /otro moderador/);
    assert.ok(!legit.commands.includes('op Helper2'));
  });

  it('/mc list, /mc say and /mc unban map to the existing actions', async () => {
    const { client, repo, admin } = enabledGuild();
    const commandsBefore = legit.commands.length;
    const listed = await runMc(client, admin, 'list', {});
    assert.equal(legit.commands.length, commandsBefore, 'list uses the status query, not RCON');
    assert.ok(allText(listed).length > 0);
    await runMc(client, admin, 'say', { mensaje: 'Hola a todos' });
    assert.equal(legit.commands.at(-1), 'say Hola a todos');
    await runMc(client, admin, 'unban', { jugador: 'Griefer' });
    assert.equal(legit.commands.at(-1), 'pardon Griefer');
    assert.equal(repo.listAudit(GUILD, 1)[0]?.action, 'pardon');
  });

  it('/mc say rejects newline and control-character injection', async () => {
    const { client, admin } = enabledGuild();
    const before = legit.commands.length;
    await runMc(client, admin, 'say', { mensaje: 'hola\nop Attacker' });
    await runMc(client, admin, 'say', { mensaje: 'hola\u0000op Attacker' });
    assert.equal(legit.commands.length, before);
    assert.ok(!legit.commands.some((command) => command.includes('Attacker')));
  });

  it('read-only members cannot say, op or unban', async () => {
    const { client, repo } = enabledGuild();
    repo.addRole(GUILD, 'readonly', 'r-read');
    const reader = mockMember({ id: '700000000000000003', guild, roles: ['r-read'] });
    const before = legit.commands.length;
    for (const [sub, opts] of [
      ['say', { mensaje: 'x' }],
      ['op', { jugador: 'Steve' }],
      ['unban', { jugador: 'Steve' }],
    ] as const) {
      await runMc(client, reader, sub, opts);
    }
    assert.equal(legit.commands.length, before);
  });
});

describe('confirmations', () => {
  beforeEach(() => clearConfirmations());

  it('/mc ban requires confirmation and only bans after Confirm', async () => {
    const { client, repo, admin, auditChannel } = enabledGuild();
    const interaction = await runMc(client, admin, 'ban', { jugador: 'Griefer', razon: 'grief' });
    const ids = payloadCustomIds(last(interaction, 'editReply').payload);
    const confirm = ids.find((id) => id.startsWith('mc:confirm:'));
    assert.ok(confirm, 'ban must return a confirmation button');
    assert.ok(!legit.commands.some((command) => command.startsWith('ban Griefer')));

    const intruder = mockMember({ id: '700000000000000001', guild, roles: ['r-admin'] });
    const rejected = await press(client, intruder, confirm!);
    assert.equal(last(rejected).type, 'reply');
    assert.match(allText(rejected), /otro moderador/);
    assert.ok(!legit.commands.some((command) => command.startsWith('ban Griefer')));

    const accepted = await press(client, admin, confirm!);
    const types = accepted.recorder.events.map((event: any) => event.type);
    assert.deepEqual(types, ['deferUpdate', 'editReply']);
    assert.equal(legit.commands.at(-1), 'ban Griefer grief');
    assert.deepEqual(payloadCustomIds(last(accepted, 'editReply').payload), []);
    assert.equal(repo.listAudit(GUILD, 1)[0]?.action, 'ban');
    assert.equal(repo.listAudit(GUILD, 1)[0]?.result, 'success');
    assert.ok(auditChannel.length > 0);

    const replay = await press(client, admin, confirm!);
    assert.match(allText(replay), /expiró o ya se usó/);
  });

  it('re-checks permissions when Confirm is pressed', async () => {
    const { client, admin } = enabledGuild();
    const interaction = await runMc(client, admin, 'ban', { jugador: 'Steve2' });
    const confirm = payloadCustomIds(last(interaction, 'editReply').payload)[0]!;
    admin.roles.set.delete('r-admin'); // role removed before confirming

    const pressed = await press(client, admin, confirm);
    assert.match(allText(pressed), /No tienes permiso/);
    assert.ok(!legit.commands.includes('ban Steve2 "Moderated by PanBot"'));
  });

  it('audits confirmed console commands', async () => {
    const { client, repo, admin, auditChannel } = enabledGuild();
    repo.addAllowedCommand(GUILD, 'weather', 'clear|rain', admin.id);
    const interaction = await runMc(client, admin, 'command', { comando: 'weather rain' });
    const confirm = payloadCustomIds(last(interaction, 'editReply').payload)[0]!;
    assert.match(confirm, /^mc:confirm:/);

    const before = auditChannel.length;
    await press(client, admin, confirm);
    assert.equal(legit.commands.at(-1), 'weather rain');
    const entry = repo.listAudit(GUILD, 1)[0];
    assert.equal(entry?.action, 'console');
    assert.equal(entry?.command, 'weather rain');
    assert.equal(entry?.result, 'success');
    assert.equal(auditChannel.length, before + 1);
  });

  it('re-validates the console allowlist at confirmation time', async () => {
    const { client, repo, admin } = enabledGuild();
    repo.addAllowedCommand(GUILD, 'weather', 'clear|rain', admin.id);
    const interaction = await runMc(client, admin, 'command', { comando: 'weather clear' });
    const confirm = payloadCustomIds(last(interaction, 'editReply').payload)[0]!;
    repo.removeAllowedCommand(GUILD, 'weather');
    const pressed = await press(client, admin, confirm);
    assert.match(allText(pressed), /fuera de la lista/);
    assert.notEqual(legit.commands.at(-1), 'weather clear');
  });
});

describe('gamerules end to end', () => {
  it('sends the rule name and value separately', async () => {
    const { client, moderator } = enabledGuild();
    await runMc(client, moderator, 'gamerules', { regla: 'keepInventory', valor: 'true' });
    assert.equal(legit.commands.at(-1), 'gamerule keepInventory true');
    await runMc(client, moderator, 'gamerules', { regla: 'keepInventory' });
    assert.equal(legit.commands.at(-1), 'gamerule keepInventory');
  });
});

describe('Discord deferred responses', () => {
  before(() => clearConfirmations());

  it('/mc defers before contacting a slow server and edits the reply once', async () => {
    const { client, moderator } = enabledGuild();
    const recorder = createRecorder();
    const interaction = mockChatInput({ member: moderator, subcommand: 'status', recorder });
    const started = Date.now();
    await mcCommand.execute(interaction, client);

    const types = recorder.events.map((event) => event.type);
    assert.deepEqual(types, ['deferReply', 'editReply']);
    const deferredAt = recorder.events[0]!.at;
    assert.ok(deferredAt - started < 100, 'deferReply must happen immediately');
    const connectedAt = statusSink.connections.at(-1)!;
    assert.ok(deferredAt <= connectedAt, 'defer must precede the network call');
    assert.ok(recorder.events[1]!.at - started >= 450, 'status query waited for its timeout');
    assert.match(payloadText(recorder.events[1]!.payload), /sin respuesta/);
  });

  it('/mcadmin defers every subcommand and never replies twice', async () => {
    const { client, admin } = enabledGuild();
    for (const [subcommand, options] of [
      ['audit', {}],
      ['notifications', { join: false }],
      ['maintenance', { enabled: true }],
      ['setup', { enabled: true }],
    ] as const) {
      const interaction = await runMcadmin(client, admin, subcommand, options);
      const types = interaction.recorder.events.map((event: any) => event.type);
      assert.equal(types[0], 'deferReply', subcommand);
      assert.ok(!types.includes('reply'), `${subcommand} must not reply after deferring`);
    }
  });

  it('panel buttons defer the update before re-rendering', async () => {
    const { client, repo, moderator } = enabledGuild();
    const panel = repo.createPanel({
      guildId: GUILD,
      channelId: 'c',
      kind: 'overview',
      title: 'p',
    });
    const interaction = await press(client, moderator, `mc:status:${panel.id}`);
    const types = interaction.recorder.events.map((event: any) => event.type);
    assert.deepEqual(types, ['deferUpdate', 'editReply']);
  });

  it('panel buttons answer denials privately without touching the panel', async () => {
    const { client, repo } = enabledGuild();
    const panel = repo.createPanel({
      guildId: GUILD,
      channelId: 'c',
      kind: 'overview',
      title: 'p',
    });
    const stranger = mockMember({ id: '800000000000000001', guild, perms: ['ManageGuild'] });
    const interaction = await press(client, stranger, `mc:status:${panel.id}`);
    const types = interaction.recorder.events.map((event: any) => event.type);
    assert.deepEqual(types, ['reply']);
    assert.match(allText(interaction), /No tienes permiso/);
  });
});

// Must stay last: it shuts the legitimate fake server down.
describe('secrets in connection failures', () => {
  it('connection failures shown in Discord do not contain the password', async () => {
    const { client, repo, moderator } = enabledGuild();
    await legit.close(); // simulate the server going away (runs last in this file)
    {
      const interaction = await runMc(client, moderator, 'kick', { jugador: 'Steve' });
      const text = allText(interaction);
      assert.match(text, /No se pudo completar la acción/);
      assert.ok(!text.includes(PASSWORD));
      assert.ok(!JSON.stringify(repo.listAudit(GUILD, 10)).includes(PASSWORD));
    }
  });
});
