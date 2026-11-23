import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatTranscript, ticketChannelName } from './format.js';

describe('formatTranscript', () => {
  it('includes the guild name, messages and attachments', () => {
    const transcript = formatTranscript(
      [
        {
          createdAt: new Date('2026-01-02T03:04:05Z'),
          author: 'Kimo',
          content: 'Hola, necesito ayuda',
          attachments: ['https://example.com/a.png'],
        },
        {
          createdAt: new Date('2026-01-02T03:05:05Z'),
          author: 'Soporte',
          content: '',
          attachments: [],
        },
      ],
      'Panadería',
    );

    assert.match(transcript, /TRANSCRIPTO DE TICKET — Panadería/);
    assert.match(transcript, /\[2026-01-02 03:04:05\] Kimo: Hola, necesito ayuda/);
    assert.match(transcript, /Adjuntos: https:\/\/example.com\/a.png/);
    assert.match(transcript, /\(sin contenido\)/);
  });
});

describe('ticketChannelName', () => {
  it('builds a safe channel name with the ticket number', () => {
    assert.equal(ticketChannelName(7, 'José Pérez'), 'ticket-7-jose-perez');
    assert.equal(ticketChannelName(12, 'User_123'), 'ticket-12-user-123');
  });

  it('handles unusual usernames', () => {
    const name = ticketChannelName(1, '!!!');
    assert.equal(name, 'ticket-1');
    assert.ok(name.length <= 32);
  });
});
