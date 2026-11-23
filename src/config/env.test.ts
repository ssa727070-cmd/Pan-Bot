import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

describe('environment configuration', () => {
  it('treats an empty DISCORD_GUILD_ID as unset (global command scope)', async () => {
    process.env.DISCORD_TOKEN = 'test-token';
    process.env.DISCORD_CLIENT_ID = '123456789012345678';
    process.env.DISCORD_GUILD_ID = '';

    const { env } = await import('./env.js');

    assert.equal(env.DISCORD_GUILD_ID, undefined);
    assert.equal(env.DISCORD_CLIENT_ID, '123456789012345678');
  });

  it('does not expose music-only settings', async () => {
    process.env.DISCORD_TOKEN = 'test-token';
    process.env.DISCORD_CLIENT_ID = '123456789012345678';
    process.env.LAVALINK_HOST = 'leftover.example';
    process.env.DEFAULT_VOLUME = '80';
    process.env.MAX_QUEUE_SIZE = '500';

    const { env } = await import('./env.js');

    assert.equal('LAVALINK_HOST' in env, false);
    assert.equal('LAVALINK_PORT' in env, false);
    assert.equal('LAVALINK_PASSWORD' in env, false);
    assert.equal('LAVALINK_SECURE' in env, false);
    assert.equal('DEFAULT_VOLUME' in env, false);
    assert.equal('MAX_QUEUE_SIZE' in env, false);
  });
});
