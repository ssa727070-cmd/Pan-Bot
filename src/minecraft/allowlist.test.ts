import '../test/setup.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateConsoleInput } from './allowlist.js';

describe('minecraft console allowlist', () => {
  it('allows read-only default commands', () => {
    const result = validateConsoleInput('list', {
      custom: [],
      unrestricted: false,
      isOwner: false,
    });
    assert.equal(result.ok, true);
  });

  it('blocks dangerous commands', () => {
    const result = validateConsoleInput('stop', { custom: [], unrestricted: true, isOwner: true });
    assert.equal(result.ok, false);
  });

  it('enforces custom patterns', () => {
    const ok = validateConsoleInput('say hello', {
      custom: [{ command: 'say', argPattern: '[A-Za-z ]+' }],
      unrestricted: false,
      isOwner: false,
    });
    const bad = validateConsoleInput('say hello;stop', {
      custom: [{ command: 'say', argPattern: '[A-Za-z ]+' }],
      unrestricted: false,
      isOwner: false,
    });
    assert.equal(ok.ok, true);
    assert.equal(bad.ok, false);
  });

  it('blocks unrestricted console for non-owners', () => {
    const result = validateConsoleInput('customcmd arg', {
      custom: [],
      unrestricted: true,
      isOwner: false,
    });
    assert.equal(result.ok, false);
  });
});
