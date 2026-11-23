import 'dotenv/config';
import { z } from 'zod';

const snowflake = z.string().regex(/^\d{17,20}$/, 'Expected a Discord snowflake (17-20 digits)');

// Empty strings in .env mean "not configured" for optional values.
const optionalSnowflake = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  snowflake.optional(),
);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  DISCORD_TOKEN: z.string().min(1, 'DISCORD_TOKEN is required'),
  DISCORD_CLIENT_ID: snowflake,
  DISCORD_GUILD_ID: optionalSnowflake,

  DATABASE_PATH: z.string().default('data/panbot.sqlite'),

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
