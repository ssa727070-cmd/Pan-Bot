import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const root = fileURLToPath(new URL('../../', import.meta.url));

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')
      ? [path]
      : [];
  });
}

const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  engines: { node: string };
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
  keywords: string[];
};
const envExample = readFileSync(join(root, '.env.example'), 'utf8');
const appSources = sourceFiles(join(root, 'src')).map((path) =>
  readFileSync(path, 'utf8').toLowerCase(),
);
const docs = [join(root, 'README.md'), join(root, 'docs', 'commands.md')].map((path) =>
  readFileSync(path, 'utf8').toLowerCase(),
);

describe('music-free deployment', () => {
  it('has no Lavalink dependency, script or keyword', () => {
    assert.equal(packageJson.dependencies['lavalink-client'], undefined);
    assert.equal(packageJson.scripts['verify:music'], undefined);
    assert.ok(!packageJson.keywords.includes('lavalink'));
    assert.ok(!packageJson.keywords.includes('music'));
  });

  it('targets Node.js 22 and produces a clean production build', () => {
    assert.match(packageJson.engines.node, /22/);
    assert.match(packageJson.scripts.build, /clean/);
    assert.equal(packageJson.scripts.start, 'node dist/index.js');
  });

  it('documents only environment variables the app still reads', () => {
    assert.match(envExample, /DISCORD_TOKEN=/);
    assert.match(envExample, /DISCORD_CLIENT_ID=/);
    assert.match(envExample, /DATABASE_PATH=/);
    for (const removed of ['LAVALINK_', 'DEFAULT_VOLUME', 'MAX_QUEUE_SIZE']) {
      assert.doesNotMatch(envExample, new RegExp(removed));
    }
  });

  it('keeps no music, voice or Lavalink references in application code', () => {
    for (const source of appSources) {
      for (const forbidden of ['lavalink', 'lavalink-client', 'guildvoicestates', "'music'"]) {
        assert.ok(!source.includes(forbidden), `Unexpected "${forbidden}" reference in source`);
      }
    }
  });

  it('keeps music out of user-facing documentation', () => {
    for (const doc of docs) {
      for (const forbidden of ['lavalink', 'música', 'comandos de música']) {
        assert.ok(!doc.includes(forbidden), `Unexpected "${forbidden}" reference in docs`);
      }
    }
  });
});
