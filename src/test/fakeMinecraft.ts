/** Test-only fake network servers. They bind to 127.0.0.1 on a random port. */
import net from 'node:net';

function encode(id: number, type: number, body: string): Buffer {
  const payload = Buffer.concat([Buffer.from(body, 'utf8'), Buffer.from([0, 0])]);
  const packet = Buffer.alloc(12 + payload.length);
  packet.writeInt32LE(8 + payload.length, 0);
  packet.writeInt32LE(id, 4);
  packet.writeInt32LE(type, 8);
  payload.copy(packet, 12);
  return packet;
}

export interface FakeRconServer {
  port: number;
  connections: number;
  passwords: string[];
  commands: string[];
  close(): Promise<void>;
}

/** A Source-RCON server that records every password and command it receives. */
export async function startFakeRcon(options: {
  password: string;
  respond?: (command: string) => string;
}): Promise<FakeRconServer> {
  const state = { connections: 0, passwords: [] as string[], commands: [] as string[] };
  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    state.connections += 1;
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => undefined);
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
          state.passwords.push(payload);
          socket.write(encode(payload === options.password ? id : -1, 2, ''));
        } else if (type === 2) {
          state.commands.push(payload);
          socket.write(encode(id, 0, options.respond?.(payload) ?? `ok: ${payload}`));
        }
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No fake RCON address');
  return {
    port: address.port,
    get connections() {
      return state.connections;
    },
    passwords: state.passwords,
    commands: state.commands,
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => resolve());
      }),
  };
}

export interface TcpSink {
  port: number;
  /** Timestamps (ms) of every accepted connection. */
  connections: number[];
  close(): Promise<void>;
}

/** Accepts TCP connections and never answers (a slow or hung server). */
export async function startTcpSink(): Promise<TcpSink> {
  const connections: number[] = [];
  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    connections.push(Date.now());
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => undefined);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No sink address');
  return {
    port: address.port,
    connections,
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => resolve());
      }),
  };
}
