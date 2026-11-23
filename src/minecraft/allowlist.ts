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
    pattern: '^[A-Za-z][A-Za-z0-9]*$',
  },
];

/** These roots stay blocked even if an owner enables unrestricted console access. */
export const FORBIDDEN_COMMAND_ROOTS = new Set([
  'stop',
  'restart',
  'shutdown',
  'end',
  'reload',
  'reloadall',
  'rl',
  'save-all',
  'saveall',
  'whitelist',
  'ban',
  'ban-ip',
  'pardon',
  'pardon-ip',
  'op',
  'deop',
]);

const SAFE_ROOT = /^[a-z][a-z0-9:._-]{0,63}$/;
const READ_ONLY_ROOTS = new Set(DEFAULT_ALLOWLIST.map((entry) => entry.name));

function matchesPattern(args: string, pattern: string | undefined): boolean {
  if (!pattern) return args.length === 0;
  try {
    return new RegExp(`^${pattern}$`).test(args);
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
  if (FORBIDDEN_COMMAND_ROOTS.has(name)) {
    return {
      ok: false,
      error:
        'Ese comando está bloqueado por seguridad (no se permite detener o reiniciar el servidor).',
    };
  }

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
    if (!matchesPattern(args, custom.argPattern || undefined)) {
      return {
        ok: false,
        error: `El comando \`${name}\` solo admite argumentos seguros configurados.`,
      };
    }
    return {
      ok: true,
      command: `${name} ${args}`.trim(),
      mutating: !READ_ONLY_ROOTS.has(name),
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
    mutating: !READ_ONLY_ROOTS.has(name),
    source: 'unrestricted',
  };
}

export function isValidCustomCommand(command: string, argPattern: string): boolean {
  return (
    minecraftCommandName.safeParse(command).success &&
    minecraftArgPattern.safeParse(argPattern).success
  );
}
