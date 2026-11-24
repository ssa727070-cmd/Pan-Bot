import pino from 'pino';
import { env, isDev } from '../config/env.js';

// Defence in depth: credentials must never reach the logs even if an object
// carrying them is logged by mistake.
export const LOG_REDACTION = {
  paths: [
    'password',
    '*.password',
    '*.*.password',
    'token',
    '*.token',
    'MINECRAFT_RCON_PASSWORD',
    '*.MINECRAFT_RCON_PASSWORD',
    'DISCORD_TOKEN',
    '*.DISCORD_TOKEN',
  ],
  censor: '[REDACTED]',
};

export const logger = pino({
  level: env.LOG_LEVEL,
  base: undefined,
  redact: LOG_REDACTION,
  ...(isDev
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss',
            ignore: 'pid,hostname',
          },
        },
      }
    : {}),
});
