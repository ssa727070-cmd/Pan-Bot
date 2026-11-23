import 'dotenv/config';
import { z } from 'zod';

const booleanFromString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const snowflake = z.string().regex(/^\d{17,20}$/, 'Expected a Discord snowflake (17-20 digits)');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  DISCORD_TOKEN: z.string().min(1, 'DISCORD_TOKEN is required'),
  DISCORD_CLIENT_ID: snowflake,
  DISCORD_GUILD_ID: snowflake.optional(),

  DATABASE_PATH: z.string().default('data/panbot.sqlite'),

  LAVALINK_HOST: z.string().default('127.0.0.1'),
  LAVALINK_PORT: z.coerce.number().int().min(1).max(65535).default(2333),
  LAVALINK_PASSWORD: z.string().min(1).default('youshallnotpass'),
  LAVALINK_SECURE: booleanFromString,

  DEFAULT_VOLUME: z.coerce.number().int().min(0).max(100).default(80),
  MAX_QUEUE_SIZE: z.coerce.number().int().min(1).max(10000).default(500),
  EMBED_COLOR: z
    .string()
    .regex(/^[0-9a-fA-F]{6}$/, 'Expected a 6-digit hex colour without #')
    .default('5865F2'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map(
    (issue) => `  • ${issue.path.join('.')}: ${issue.message}`,
  );
  throw new Error(`Invalid environment configuration:\n${issues.join('\n')}\n\nSee .env.example.`);
}

export const env = Object.freeze(parsed.data);
export const isDev = env.NODE_ENV === 'development';
