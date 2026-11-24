import { minecraftArgPattern, minecraftCommandName } from './validators.js';

export interface ConsoleCommandDescriptor {
  name: string;
  usage: string;
  description: string;
  pattern?: string;
  plugin?: string;
}

export interface CustomAllowedCommand {
  command: string;
  argPattern: string;
}

export type ConsoleValidationResult =
  | { ok: true; command: string; mutating: boolean; source: 'default' | 'custom' | 'unrestricted' }
  | { ok: false; error: string };

/** Read-only commands are safe by default. Nothing that can stop the server appears here. */
export const DEFAULT_ALLOWLIST: readonly ConsoleCommandDescriptor[] = [
  { name: 'list', usage: 'list', description: 'Jugadores conectados' },
  { name: 'tps', usage: 'tps', description: 'Ticks por segundo' },
  { name: 'version', usage: 'version', description: 'Versión y software del servidor' },
  {
    name: 'plugins',
    usage: 'plugins',
    description: 'Plugins instalados',
    plugin: 'Paper/Spigot/Bukkit',
  },
  { name: 'help', usage: 'help', description: 'Ayuda de comandos del servidor' },
  {
    name: 'gamerule',
    usage: 'gamerule <regla>',
    description: 'Consulta el valor de una gamerule',
    pattern: '[A-Za-z][A-Za-z0-9]*',
  },
];

/**
 * Command roots that stay blocked in every mode (default, custom allowlist and
 * unrestricted), after namespace normalisation: `minecraft:stop` → `stop`.
 * Lifecycle, persistence, access-control and privilege commands have dedicated,
 * validated and audited Discord commands instead.
 */
export const FORBIDDEN_COMMAND_ROOTS: ReadonlySet<string> = new Set([
  // Server lifecycle (vanilla, Bukkit/Spigot/Paper, Essentials and proxy aliases).
  'stop',
  'restart',
  'shutdown',
  'end',
  'estop',
  'erestart',
  'reload',
  'reloadall',
  'rl',
  'ereload',
  'reloaddata',
  // World persistence.
  'save-all',
  'saveall',
  'save-off',
  'save-on',
  // Access control and privilege.
  'whitelist',
  'ban',
  'ban-ip',
  'banip',
  'tempban',
  'ipban',
  'pardon',
  'pardon-ip',
  'unban',
  'unbanip',
  'op',
  'deop',
  'lp',
  'luckperms',
  'lpb',
  'lpv',
  'perm',
  'perms',
  'permissions',
  'pex',
  'permissionsex',
  // Plugin managers that can unload or replace code.
  'plugman',
  'plugmanx',
]);

/**
 * Commands that execute other commands. Their payload cannot be validated by a
 * flat allowlist, so they are blocked outright — except `execute`, whose `run`
 * clauses are analysed recursively.
 */
export const INDIRECT_COMMAND_ROOTS: ReadonlySet<string> = new Set([
  'sudo',
  'esudo',
  'function',
  'schedule',
  'run',
  'asconsole',
  'console',
  'sync',
  'bungee',
  'send',
  'script',
  'skript',
  'sk',
  'trigger',
]);

/** Subcommands that reload or stop a plugin or proxy, e.g. `essentials reload`. */
const FORBIDDEN_SUBCOMMANDS: ReadonlySet<string> = new Set([
  'stop',
  'restart',
  'shutdown',
  'reload',
  'rl',
  'disable',
  'unload',
]);

/** Chat commands whose arguments are free text, so words like "stop" are not subcommands. */
const MESSAGE_ROOTS: ReadonlySet<string> = new Set([
  'say',
  'me',
  'tell',
  'msg',
  'w',
  'whisper',
  'tellraw',
  'broadcast',
  'bc',
  'bcast',
  'title',
]);

const SAFE_ROOT = /^[a-z][a-z0-9:._-]{0,63}$/;
const READ_ONLY_ROOTS = new Set(DEFAULT_ALLOWLIST.map((entry) => entry.name));
const MAX_EXECUTE_DEPTH = 8;

/** `/minecraft:Stop` → `stop`. Namespaces never change which command is blocked. */
export function normalizeCommandRoot(token: string): string {
  const value = token
    .trim()
    .replace(/^["'/]+|["']+$/g, '')
    .toLowerCase();
  const separator = value.lastIndexOf(':');
  return separator >= 0 ? value.slice(separator + 1) : value;
}

/** Returns a reason when the command, or anything it runs, is blocked. */
export function findBlockedCommand(value: string, depth = 0): string | null {
  const tokens = value.trim().split(/\s+/).filter(Boolean);
  const root = normalizeCommandRoot(tokens[0] ?? '');
  if (!root) return null;

  if (FORBIDDEN_COMMAND_ROOTS.has(root)) {
    return `\`${root}\` está bloqueado por seguridad (detener/recargar el servidor, persistencia, whitelist, bans o permisos).`;
  }
  if (INDIRECT_COMMAND_ROOTS.has(root)) {
    return `\`${root}\` ejecuta otros comandos y no se permite por consola.`;
  }

  const subcommand = normalizeCommandRoot(tokens[1] ?? '');
  if (subcommand && !MESSAGE_ROOTS.has(root) && FORBIDDEN_SUBCOMMANDS.has(subcommand)) {
    return `El subcomando \`${root} ${subcommand}\` está bloqueado (recargar, detener o desactivar).`;
  }

  if (root === 'execute') {
    if (depth >= MAX_EXECUTE_DEPTH) return '`execute` anidado demasiadas veces.';
    // Every `run` clause starts a new command: analyse each one.
    for (let index = 1; index < tokens.length; index += 1) {
      if (normalizeCommandRoot(tokens[index] ?? '') !== 'run') continue;
      const nested = tokens.slice(index + 1).join(' ');
      if (!nested) return '`execute run` sin comando no es válido.';
      const blocked = findBlockedCommand(nested, depth + 1);
      if (blocked) return blocked;
    }
  }
  return null;
}

function matchesPattern(args: string, pattern: string | undefined): boolean {
  if (!pattern) return args.length === 0;
  try {
    return new RegExp(`^(?:${pattern})$`).test(args);
  } catch {
    return false;
  }
}

/** Validates a console request before any RCON connection is attempted. */
export function validateConsoleInput(
  raw: string,
  context: { custom: CustomAllowedCommand[]; unrestricted: boolean; isOwner: boolean },
): ConsoleValidationResult {
  const value = raw.trim();
  // eslint-disable-next-line no-control-regex -- we intentionally reject control chars in console input.
  if (!value || !/^[^\r\n\u0000-\u001F\u007F]{1,500}$/.test(value)) {
    return {
      ok: false,
      error: 'Comando inválido: no se permiten saltos de línea ni caracteres de control.',
    };
  }
  if (value.startsWith('/')) {
    return { ok: false, error: 'Escribe el comando sin la barra inicial (/).' };
  }

  const [rawName, ...rest] = value.split(/\s+/);
  const name = (rawName ?? '').toLowerCase();
  const args = rest.join(' ');
  if (!SAFE_ROOT.test(name)) return { ok: false, error: 'Nombre de comando no permitido.' };

  // Applies to every mode before any allowlist lookup.
  const blocked = findBlockedCommand(`${name} ${args}`);
  if (blocked) return { ok: false, error: blocked };

  const preset = DEFAULT_ALLOWLIST.find((entry) => entry.name === name);
  if (preset) {
    if (!matchesPattern(args, preset.pattern)) {
      return { ok: false, error: `Uso válido: \`${preset.usage}\`.` };
    }
    return {
      ok: true,
      command: preset.pattern ? `${name} ${args}`.trim() : name,
      mutating: false,
      source: 'default',
    };
  }

  const custom = context.custom.find((entry) => entry.command === name);
  if (custom) {
    if (!isValidCustomCommand(custom.command, custom.argPattern)) {
      return { ok: false, error: `La entrada de allowlist \`${name}\` ya no es segura.` };
    }
    if (!matchesPattern(args, custom.argPattern || undefined)) {
      return {
        ok: false,
        error: `El comando \`${name}\` solo admite argumentos seguros configurados.`,
      };
    }
    return {
      ok: true,
      command: `${name} ${args}`.trim(),
      mutating: !READ_ONLY_ROOTS.has(normalizeCommandRoot(name)),
      source: 'custom',
    };
  }

  if (!context.unrestricted) {
    return {
      ok: false,
      error: 'Comando fuera de la lista de permitidos. Pide a un administrador que lo añada.',
    };
  }
  if (!context.isOwner) {
    return {
      ok: false,
      error: 'El acceso irrestricto a consola está reservado al dueño del servidor.',
    };
  }

  return {
    ok: true,
    command: value,
    mutating: !READ_ONLY_ROOTS.has(normalizeCommandRoot(name)),
    source: 'unrestricted',
  };
}

/** Custom allowlist entries can never name a blocked or indirect command. */
export function customCommandError(command: string, argPattern: string): string | null {
  if (!minecraftCommandName.safeParse(command).success) return 'Nombre de comando no seguro.';
  if (!minecraftArgPattern.safeParse(argPattern).success) return 'Patrón de argumentos no seguro.';
  const root = normalizeCommandRoot(command);
  if (FORBIDDEN_COMMAND_ROOTS.has(root) || INDIRECT_COMMAND_ROOTS.has(root) || root === 'execute') {
    return `\`${command}\` no se puede añadir a la allowlist: está bloqueado por seguridad.`;
  }
  return null;
}

export function isValidCustomCommand(command: string, argPattern: string): boolean {
  return customCommandError(command, argPattern) === null;
}
