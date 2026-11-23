import '../test/setup.js';
import assert from 'node:assert/strict';
import net from 'node:net';
import { describe, it } from 'node:test';
import { RconClient, decodePacket, encodePacket } from './rcon.js';

describe('minecraft rcon protocol', () => {
  it('encodes and decodes packets', () => {
    const packet = encodePacket(7, 2, 'hello');
    const decoded = decodePacket(packet.subarray(4));
    assert.deepEqual(decoded, { id: 7, type: 2, body: 'hello' });
  });

  it('authenticates and executes a command against a mock server', async () => {
    const server = net.createServer((socket) => {
      let buffer = Buffer.alloc(0);
      socket.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        while (buffer.length >= 4) {
          const length = buffer.readInt32LE(0);
          if (buffer.length < 4 + length) return;
          const body = buffer.subarray(4, 4 + length);
          buffer = buffer.subarray(4 + length);
          const id = body.readInt32LE(0);
          const type = body.readInt32LE(4);
          const payload = body.subarray(8).toString('utf8').replace(/\0+$/, '');
          if (type === 3) {
            const ok = payload === 'secret';
            socket.write(encodePacket(ok ? id : -1, 2, ''));
          } else if (type === 2) {
            socket.write(
              encodePacket(id, 0, payload === 'list' ? 'There are 0 players' : 'Unknown'),
            );
          }
        }
      });
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No mock address');

    const client = new RconClient({
      host: '127.0.0.1',
      port: address.port,
      password: 'secret',
      timeoutMs: 1000,
      maxRetries: 0,
    });

    try {
      const response = await client.send('list');
      assert.equal(response, 'There are 0 players');
    } finally {
      client.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('rejects bad authentication', async () => {
    const server = net.createServer((socket) => {
      socket.on('data', () => {
        socket.write(encodePacket(-1, 2, ''));
        socket.end();
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No mock address');
    const client = new RconClient({
      host: '127.0.0.1',
      port: address.port,
      password: 'wrong',
      timeoutMs: 1000,
      maxRetries: 0,
    });
    await assert.rejects(() => client.send('list'), /Autenticación RCON rechazada/);
    client.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});
