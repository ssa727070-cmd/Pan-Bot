import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_GOODBYE_MESSAGE,
  DEFAULT_WELCOME_MESSAGE,
  parseEmbedColor,
  renderTemplate,
} from './messages.js';

const data = {
  userId: '123456789012345678',
  username: 'Kimo',
  guildName: 'Panadería',
  memberCount: 42,
};

describe('renderTemplate', () => {
  it('replaces all supported placeholders', () => {
    const result = renderTemplate(
      '{user} {mention} {username} {server} {guild} {memberCount} {count}',
      data,
    );
    assert.equal(
      result,
      '<@123456789012345678> <@123456789012345678> Kimo Panadería Panadería 42 42',
    );
  });

  it('renders the default welcome and goodbye messages', () => {
    assert.match(renderTemplate(DEFAULT_WELCOME_MESSAGE, data), /<@123456789012345678>/);
    assert.match(renderTemplate(DEFAULT_GOODBYE_MESSAGE, data), /Panadería/);
  });

  it('leaves unknown placeholders untouched', () => {
    assert.equal(renderTemplate('Hola {unknown}', data), 'Hola {unknown}');
  });
});

describe('parseEmbedColor', () => {
  it('accepts six-digit hexadecimal colours', () => {
    assert.equal(parseEmbedColor('5865F2'), 0x5865f2);
    assert.equal(parseEmbedColor('ffffff'), 0xffffff);
  });

  it('rejects invalid values', () => {
    assert.equal(parseEmbedColor('#5865F2'), null);
    assert.equal(parseEmbedColor('xyzxyz'), null);
    assert.equal(parseEmbedColor(''), null);
  });
});
