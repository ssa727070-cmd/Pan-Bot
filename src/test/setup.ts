/** Test-only environment defaults; real secrets are never read or required. */
process.env.DISCORD_TOKEN ??= 'test-token';
process.env.DISCORD_CLIENT_ID ??= '123456789012345678';
process.env.NODE_ENV ??= 'test';
