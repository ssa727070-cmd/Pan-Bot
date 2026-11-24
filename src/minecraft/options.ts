import type { MinecraftAction, MinecraftActionOptions } from './types.js';

/** The subset of discord.js' option resolver used by `/mc`, so translation is testable. */
export interface McOptionReader {
  getString(name: string): string | null;
  getInteger(name: string): number | null;
}

export interface McInvocation {
  action: MinecraftAction;
  options: MinecraftActionOptions;
}

const READ_ONLY = new Set(['status', 'players', 'info', 'version', 'save']);
const PLAYER_ONLY = new Set(['pardon', 'op', 'deop', 'unmute', 'heal', 'feed']);
const WHITELIST_ACTIONS: Record<string, MinecraftAction> = {
  add: 'whitelist-add',
  remove: 'whitelist-remove',
  list: 'whitelist-list',
};
const MESSAGE_ACTIONS: Record<string, MinecraftAction> = {
  say: 'say',
  broadcast: 'broadcast',
  announce: 'announce',
};

function str(reader: McOptionReader, name: string): string | undefined {
  return reader.getString(name) ?? undefined;
}

/**
 * Maps each `/mc` subcommand to one action with explicitly named options. Every
 * subcommand reads only its own options, so values can never leak between fields
 * (v1.1.5 sent the gamerule *value* as the rule name).
 */
export function translateMcInvocation(subcommand: string, reader: McOptionReader): McInvocation {
  if (READ_ONLY.has(subcommand)) {
    return { action: subcommand as MinecraftAction, options: {} };
  }
  if (PLAYER_ONLY.has(subcommand)) {
    return { action: subcommand as MinecraftAction, options: { player: str(reader, 'jugador') } };
  }

  switch (subcommand) {
    case 'kick':
    case 'ban':
      return {
        action: subcommand,
        options: { player: str(reader, 'jugador'), reason: str(reader, 'razon') },
      };
    case 'whitelist': {
      const action = WHITELIST_ACTIONS[reader.getString('accion') ?? ''];
      if (!action) throw new Error('Acción de whitelist inválida.');
      return { action, options: { player: str(reader, 'jugador') } };
    }
    case 'mute':
      return {
        action: 'mute',
        options: {
          player: str(reader, 'jugador'),
          value: str(reader, 'duracion'),
          reason: str(reader, 'razon'),
        },
      };
    case 'time':
      return {
        action: 'time',
        options: { mode: str(reader, 'accion'), value: str(reader, 'valor') },
      };
    case 'weather':
    case 'difficulty':
      return { action: subcommand, options: { mode: str(reader, 'modo') } };
    case 'gamemode':
      return {
        action: 'gamemode',
        options: { mode: str(reader, 'modo'), player: str(reader, 'jugador') },
      };
    case 'teleport':
      return {
        action: 'teleport',
        options: { player: str(reader, 'jugador'), destination: str(reader, 'destino') },
      };
    case 'xp':
      return {
        action: 'xp',
        options: {
          player: str(reader, 'jugador'),
          amount: reader.getInteger('cantidad') ?? undefined,
          mode: str(reader, 'tipo'),
        },
      };
    case 'gamerules':
      return {
        action: 'gamerules',
        options: { gamerule: str(reader, 'regla'), gameruleValue: str(reader, 'valor') },
      };
    case 'message': {
      const action = MESSAGE_ACTIONS[reader.getString('tipo') ?? ''];
      if (!action) throw new Error('Tipo de mensaje inválido.');
      return { action, options: { message: str(reader, 'mensaje') } };
    }
    case 'command':
      return { action: 'console', options: { command: str(reader, 'comando') } };
    default:
      throw new Error(`Subcomando de Minecraft desconocido: ${subcommand}`);
  }
}
