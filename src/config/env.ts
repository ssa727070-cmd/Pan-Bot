import 'dotenv/config';
import { z } from 'zod';

const snowflake = z.string().regex(/^\d{17,20}$/, 'Expected a Discord snowflake (17-20 digits)');

// Empty strings in .env mean "not configured" for optional values.
const optionalSnowflake = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  snowflake.optional(),
);

/** Environment numbers arrive as strings. Empty values use the documented default. */
const numberFromEnv = (defaultValue: number, min: number, max: number) =>
  z.preprocess((value) => {
    if (value === undefined || value === null || value === '') return defaultValue;
    if (typeof value === 'string') return Number(value.trim());
    return value;
  }, z.number().int().min(min).max(max));

const portFromEnv = (defaultValue: number) => numberFromEnv(defaultValue, 1, 65535);

/** Comma/space separated list of Discord snowflakes. Empty means "none". */
const snowflakeList = z.preprocess(
  (value) => {
    if (value === undefined || value === null) return [];
    if (typeof value !== 'string') return value;
    return value
      .split(/[\s,]+/)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  },
  z.array(snowflake).transform((ids) => Object.freeze([...new Set(ids)])),
);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  DISCORD_TOKEN: z.string().min(1, 'DISCORD_TOKEN is required'),
  DISCORD_CLIENT_ID: snowflake,
  DISCORD_GUILD_ID: optionalSnowflake,

  // Discord user IDs of the bot operators. They count as owners for owner-only
  // Minecraft features (unrestricted console mode) in authorised guilds.
  BOT_OWNER_IDS: snowflakeList,

  DATABASE_PATH: z.string().default('data/panbot.sqlite'),

  EMBED_COLOR: z
    .string()
    .regex(/^[0-9a-fA-F]{6}$/, 'Expected a 6-digit hex colour without #')
    .default('5865F2'),

  // Minecraft administration. The connection target is fixed here by the operator:
  // Discord users can never change the host or ports the bot connects to, so the
  // RCON password is only ever sent to MINECRAFT_HOST:MINECRAFT_RCON_PORT.
  // RCON is opt-in: an empty password disables commands that need it, while the
  // public status query never authenticates.
  MINECRAFT_HOST: z.string().trim().min(1).default('pansmp.mcserv.world'),
  MINECRAFT_PORT: portFromEnv(25565),
  MINECRAFT_RCON_PORT: portFromEnv(25575),
  MINECRAFT_RCON_PASSWORD: z.string().default(''),
  MINECRAFT_RCON_TIMEOUT_MS: numberFromEnv(5000, 500, 60000),
  MINECRAFT_RCON_RETRIES: numberFromEnv(1, 0, 3),
  MINECRAFT_STATUS_TIMEOUT_MS: numberFromEnv(5000, 500, 60000),
  // Guilds allowed to use the Minecraft integration. RCON is only available to the
  // guilds listed here; when empty, RCON is disabled everywhere and only the
  // read-only status query is available.
  MINECRAFT_GUILD_IDS: snowflakeList,
  // Consecutive failed status polls before the monitor reports the server offline.
  MINECRAFT_OFFLINE_FAILURES: numberFromEnv(3, 1, 10),
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
