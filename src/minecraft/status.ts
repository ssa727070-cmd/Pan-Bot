import { Socket } from 'node:net';
import { detectSoftware } from './integrations.js';
import type { MinecraftStatus } from './types.js';

const PROTOCOL_VERSION = 765;

/** Minecraft network varint helpers, exported for focused unit tests. */
export function encodeVarInt(value: number): Buffer {
  let remaining = value >>> 0;
  const bytes: number[] = [];
  do {
    let byte = remaining & 0x7f;
    remaining >>>= 7;
    if (remaining > 0) byte |= 0x80;
    bytes.push(byte);
  } while (remaining > 0);
  return Buffer.from(bytes);
}

export function decodeVarInt(buffer: Buffer, offset = 0): { value: number; next: number } | null {
  let value = 0;
  let shift = 0;
  for (let index = 0; index < 5; index += 1) {
    const byte = buffer[offset + index];
    if (byte === undefined) return null;
    value += (byte & 0x7f) * 2 ** shift;
    if ((byte & 0x80) === 0) return { value, next: offset + index + 1 };
    shift += 7;
  }
  return null;
}

function encodeStatusPacket(packetId: number, body: Buffer): Buffer {
  const id = encodeVarInt(packetId);
  return Buffer.concat([encodeVarInt(id.length + body.length), id, body]);
}

interface RawStatusPayload {
  version?: { name?: unknown; protocol?: unknown };
  players?: {
    online?: unknown;
    max?: unknown;
    sample?: Array<{ name?: unknown }>;
  };
  description?: unknown;
  modinfo?: { modList?: Array<{ modid?: unknown }> };
}

function parseDescription(value: unknown, depth = 0): string {
  if (typeof value === 'string') return value;
  if (depth > 3 || value === null || typeof value !== 'object') return '';
  const object = value as { text?: unknown; extra?: unknown };
  const own = typeof object.text === 'string' ? object.text : '';
  const extras = Array.isArray(object.extra)
    ? object.extra.map((entry) => parseDescription(entry, depth + 1)).join('')
    : '';
  return `${own}${extras}`;
}

export function parseStatusPayload(raw: string, host: string, port: number): MinecraftStatus {
  let payload: RawStatusPayload;
  try {
    payload = JSON.parse(raw) as RawStatusPayload;
  } catch {
    throw new Error('Respuesta de estado del servidor no válida');
  }

  const versionName =
    typeof payload.version?.name === 'string' ? payload.version.name : 'Desconocida';
  const protocol = typeof payload.version?.protocol === 'number' ? payload.version.protocol : null;
  const motd = parseDescription(payload.description).replace(/§./g, '').trim().slice(0, 500);
  const names = Array.isArray(payload.players?.sample)
    ? payload.players.sample
        .map((entry) => (typeof entry.name === 'string' ? entry.name : ''))
        .filter((name) => name.length > 0)
    : [];
  const modIds = Array.isArray(payload.modinfo?.modList)
    ? payload.modinfo.modList
        .map((entry) => (typeof entry.modid === 'string' ? entry.modid.toLowerCase() : ''))
        .filter(Boolean)
    : [];
  const software = detectSoftware(`${versionName} ${motd} ${modIds.join(' ')}`);

  return {
    host,
    port,
    version: versionName.slice(0, 200),
    protocol,
    software,
    motd,
    playersOnline:
      typeof payload.players?.online === 'number' ? Math.max(0, payload.players.online) : 0,
    playersMax: typeof payload.players?.max === 'number' ? Math.max(0, payload.players.max) : 0,
    playerNames: names.slice(0, 20),
    latencyMs: null,
  };
}

/** Reads the Java Edition server-list ping. Returns null when the server is unreachable. */
export function queryMinecraftStatus(options: {
  host: string;
  port: number;
  timeoutMs: number;
}): Promise<MinecraftStatus | null> {
  return new Promise((resolve) => {
    const socket = new Socket();
    let buffer = Buffer.alloc(0);
    let status: MinecraftStatus | null = null;
    let pingSentAt: number | null = null;
    let finished = false;

    const finish = (result: MinecraftStatus | null): void => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(result);
    };

    const timer = setTimeout(() => finish(status), options.timeoutMs);
    timer.unref();

    const sendPing = (): void => {
      if (!socket.writable || pingSentAt !== null) return;
      pingSentAt = Date.now();
      const payload = Buffer.alloc(8);
      payload.writeBigInt64BE(BigInt(pingSentAt));
      socket.write(encodeStatusPacket(1, payload));
    };

    socket.on('error', () => finish(status));
    socket.on('close', () => finish(status));
    socket.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length > 0) {
        const length = decodeVarInt(buffer);
        if (!length || buffer.length < length.next + length.value) return;
        const packet = buffer.subarray(length.next, length.next + length.value);
        buffer = buffer.subarray(length.next + length.value);
        const packetId = decodeVarInt(packet);
        if (!packetId) return;

        if (packetId.value === 0 && !status) {
          try {
            status = parseStatusPayload(
              packet.subarray(packetId.next).toString('utf8'),
              options.host,
              options.port,
            );
            sendPing();
          } catch {
            finish(null);
            return;
          }
        } else if (packetId.value === 1 && pingSentAt !== null && status) {
          status.latencyMs = Date.now() - pingSentAt;
          finish(status);
          return;
        }
      }
    });

    socket.connect({ host: options.host, port: options.port }, () => {
      const host = Buffer.from(options.host, 'utf8');
      const port = Buffer.allocUnsafe(2);
      port.writeUInt16BE(options.port);
      const handshake = Buffer.concat([
        encodeVarInt(0),
        encodeVarInt(PROTOCOL_VERSION),
        encodeVarInt(host.length),
        host,
        port,
        encodeVarInt(1),
      ]);
      socket.write(encodeStatusPacket(0, handshake));
      socket.write(encodeStatusPacket(0, Buffer.alloc(0)));
    });
  });
}
