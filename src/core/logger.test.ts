import '../test/setup.js';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { describe, it } from 'node:test';
import pino from 'pino';
import { LOG_REDACTION } from './logger.js';

describe('logger redaction', () => {
  it('never writes passwords or tokens, even when logged by mistake', () => {
    let output = '';
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        output += String(chunk);
        callback();
      },
    });
    const log = pino({ redact: LOG_REDACTION }, stream);
    log.warn({
      password: 'pw-top',
      options: { password: 'pw-nested', host: 'h' },
      client: { options: { password: 'pw-deep' } },
      token: 'tk-top',
      env: { MINECRAFT_RCON_PASSWORD: 'pw-env', DISCORD_TOKEN: 'tk-env' },
    });
    for (const secret of ['pw-top', 'pw-nested', 'pw-deep', 'tk-top', 'pw-env', 'tk-env']) {
      assert.ok(!output.includes(secret), `${secret} leaked to logs`);
    }
    assert.match(output, /\[REDACTED\]/);
    assert.match(output, /"host":"h"/);
  });
});
