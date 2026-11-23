import { Socket } from 'node:net';
import { redactSecrets } from './redact.js';
import { isSafeRconText } from './validators.js';

const MAX_PACKET_LENGTH = 1024 * 1024;
const AUTH_TYPE = 3;
const AUTH_RESPONSE_TYPE = 2;
const COMMAND_TYPE = 2;
const COMMAND_RESPONSE_TYPE = 0;

export interface RconOptions {
  host: string;
  port: number;
  password: string;
  timeoutMs: number;
  maxRetries?: number;
}

export interface RconPacket {
  id: number;
  type: number;
  body: string;
}

export class RconError extends Error {
  public constructor(message: string) {
    super(redactSecrets(message));
    this.name = 'RconError';
  }
}

/** Encodes a Source RCON packet. The trailing double NUL is mandatory. */
export function encodePacket(id: number, type: number, body: string): Buffer {
  const payload = Buffer.concat([Buffer.from(body, 'utf8'), Buffer.from([0, 0])]);
  const packet = Buffer.allocUnsafe(4 + 4 + 4 + payload.length);
  packet.writeInt32LE(4 + 4 + payload.length, 0);
  packet.writeInt32LE(id, 4);
  packet.writeInt32LE(type, 8);
  payload.copy(packet, 12);
  return packet;
}

/** Decodes one packet body (without the leading length field), or null when incomplete. */
export function decodePacket(body: Buffer): RconPacket | null {
  if (body.length < 8) return null;
  const raw = body.subarray(8).toString('utf8').replace(/\0+$/, '');
  return { id: body.readInt32LE(0), type: body.readInt32LE(4), body: raw };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref();
  });
}

interface PendingResponse {
  resolve: (body: string) => void;
  reject: (error: Error) => void;
}

/** Minimal dependency-free RCON client with authentication, timeouts and reconnection. */
export class RconClient {
  private socket: Socket | null = null;
  private buffer = Buffer.alloc(0);
  private nextId = 1;
  private authed = false;
  private connecting: Promise<void> | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly pending = new Map<number, PendingResponse>();
  private readonly maxRetries: number;

  public constructor(private readonly options: RconOptions) {
    this.maxRetries = options.maxRetries ?? 1;
  }

  public get connected(): boolean {
    return this.authed && this.socket !== null;
  }

  /** Sends a validated command. Calls are serialized so responses cannot be mixed up. */
  public async send(command: string): Promise<string> {
    if (!isSafeRconText(command)) {
      throw new RconError('Comando RCON inválido (longitud o caracteres de control).');
    }

    const run = (): Promise<string> => this.sendOnce(command);
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => undefined);
    return result;
  }

  public close(): void {
    this.authed = false;
    this.socket?.destroy();
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.rejectAll(new RconError('Conexión RCON cerrada'));
  }

  private async sendOnce(command: string): Promise<string> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        await this.ensureConnected();
        const id = this.nextId++;
        const response = this.waitForPacket(id, this.options.timeoutMs);
        this.writePacket(encodePacket(id, COMMAND_TYPE, command));
        return await response;
      } catch (error) {
        lastError = error;
        this.close();
        if (attempt < this.maxRetries) await delay(100 * (attempt + 1));
      }
    }
    throw lastError instanceof Error ? lastError : new RconError('Fallo RCON desconocido');
  }

  private ensureConnected(): Promise<void> {
    if (this.connecting) return this.connecting;
    if (this.connected) return Promise.resolve();
    const connection = this.open()
      .catch((error: unknown) => {
        this.close();
        throw error;
      })
      .finally(() => {
        this.connecting = null;
      });
    this.connecting = connection;
    return connection;
  }

  private open(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new Socket();
      this.socket = socket;
      this.buffer = Buffer.alloc(0);
      this.authed = false;
      let settled = false;

      const fail = (error: Error): void => {
        if (settled) return;
        settled = true;
        reject(error);
      };
      const succeed = (): void => {
        if (settled) return;
        settled = true;
        resolve();
      };

      socket.on('data', (chunk: Buffer) => this.handleData(chunk));
      socket.on('error', (error: Error) => {
        const wrapped = new RconError(`Error de conexión RCON: ${error.message}`);
        this.rejectAll(wrapped);
        fail(wrapped);
      });
      socket.on('close', () => {
        this.authed = false;
        const error = new RconError('El servidor cerró la conexión RCON');
        this.rejectAll(error);
        fail(error);
      });
      socket.setTimeout(this.options.timeoutMs, () => {
        const error = new RconError('Tiempo de espera agotado al conectar por RCON');
        socket.destroy(error);
        fail(error);
      });

      socket.connect({ host: this.options.host, port: this.options.port }, () => {
        const id = this.nextId++;
        const authResponse = this.waitForPacket(id, this.options.timeoutMs);
        authResponse.then(
          () => {
            this.authed = true;
            socket.setTimeout(0);
            succeed();
          },
          (error: unknown) => {
            socket.destroy();
            fail(error instanceof Error ? error : new RconError('Autenticación RCON fallida'));
          },
        );
        this.writePacket(encodePacket(id, AUTH_TYPE, this.options.password));
      });
    });
  }

  private waitForPacket(id: number, timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new RconError(`La respuesta RCON tardó más de ${timeoutMs} ms`));
      }, timeoutMs);
      timer.unref();

      this.pending.set(id, {
        resolve: (body: string) => {
          clearTimeout(timer);
          resolve(body);
        },
        reject: (error: Error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
    });
  }

  private handleData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 4) {
      const length = this.buffer.readInt32LE(0);
      if (length < 10 || length > MAX_PACKET_LENGTH) {
        const error = new RconError('Paquete RCON inválido recibido');
        this.rejectAll(error);
        this.buffer = Buffer.alloc(0);
        this.close();
        return;
      }
      if (this.buffer.length < 4 + length) return;

      const raw = this.buffer.subarray(4, 4 + length);
      this.buffer = this.buffer.subarray(4 + length);
      const packet = decodePacket(raw);
      if (!packet) continue;

      if (packet.type === AUTH_RESPONSE_TYPE && packet.id === -1) {
        this.rejectAll(new RconError('Autenticación RCON rechazada por el servidor'));
        this.close();
        return;
      }

      const pending = this.pending.get(packet.id);
      if (pending) {
        this.pending.delete(packet.id);
        if (packet.type === COMMAND_RESPONSE_TYPE || packet.type === AUTH_RESPONSE_TYPE) {
          pending.resolve(packet.body);
        } else {
          pending.reject(new RconError('Tipo de respuesta RCON inesperado'));
        }
      }
    }
  }

  private writePacket(packet: Buffer): void {
    if (!this.socket?.writable) throw new RconError('No hay conexión RCON activa');
    this.socket.write(packet);
  }

  private rejectAll(error: Error): void {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
}
