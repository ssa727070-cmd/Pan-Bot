import type { MinecraftAction, MinecraftActionOptions } from './types.js';
import {
  minecraftCommandName,
  minecraftCoordinates,
  minecraftDuration,
  minecraftGamerule,
  minecraftGameruleValue,
  minecraftMessage,
  minecraftReason,
  minecraftTarget,
  minecraftUsername,
  minecraftXpAmount,
  quoteRconArgument,
  requireValid,
} from './validators.js';

export interface BuiltCommand {
  command: string;
  action: MinecraftAction;
  targetPlayer?: string | null;
  plugin?: string | null;
}

/** Build a safe, non-interpolated RCON command after argument validation. */
export function buildMinecraftCommand(
  action: MinecraftAction,
  options: MinecraftActionOptions = {},
): BuiltCommand {
  switch (action) {
    case 'kick': {
      const player = requireValid(minecraftUsername, options.player, 'Jugador inválido.');
      const reason = options.reason
        ? requireValid(minecraftReason, options.reason, 'Razón inválida.')
        : 'Moderated by PanBot';
      return {
        command: `kick ${player} ${quoteRconArgument(reason)}`,
        action,
        targetPlayer: player,
      };
    }
    case 'ban': {
      const player = requireValid(minecraftTarget, options.player, 'Jugador inválido.');
      const reason = options.reason
        ? requireValid(minecraftReason, options.reason, 'Razón inválida.')
        : 'Moderated by PanBot';
      return {
        command: `ban ${player} ${quoteRconArgument(reason)}`,
        action,
        targetPlayer: player,
      };
    }
    case 'pardon': {
      const player = requireValid(minecraftTarget, options.player, 'Jugador inválido.');
      return { command: `pardon ${player}`, action, targetPlayer: player };
    }
    case 'whitelist-add': {
      const player = requireValid(minecraftUsername, options.player, 'Jugador inválido.');
      return { command: `whitelist add ${player}`, action, targetPlayer: player };
    }
    case 'whitelist-remove': {
      const player = requireValid(minecraftUsername, options.player, 'Jugador inválido.');
      return { command: `whitelist remove ${player}`, action, targetPlayer: player };
    }
    case 'whitelist-list':
      return { command: 'whitelist list', action };
    case 'op': {
      const player = requireValid(minecraftUsername, options.player, 'Jugador inválido.');
      return { command: `op ${player}`, action, targetPlayer: player };
    }
    case 'deop': {
      const player = requireValid(minecraftUsername, options.player, 'Jugador inválido.');
      return { command: `deop ${player}`, action, targetPlayer: player };
    }
    case 'mute': {
      const player = requireValid(minecraftUsername, options.player, 'Jugador inválido.');
      const duration = options.value
        ? requireValid(minecraftDuration, options.value, 'Duración inválida.')
        : '30m';
      const reason = options.reason
        ? requireValid(minecraftReason, options.reason, 'Razón inválida.')
        : null;
      const tail = reason ? ` ${quoteRconArgument(reason)}` : '';
      return {
        command: `mute ${player} ${duration}${tail}`.trim(),
        action,
        targetPlayer: player,
        plugin: 'EssentialsX o LuckPerms con soporte de mute',
      };
    }
    case 'unmute': {
      const player = requireValid(minecraftUsername, options.player, 'Jugador inválido.');
      return {
        command: `unmute ${player}`,
        action,
        targetPlayer: player,
        plugin: 'EssentialsX o LuckPerms con soporte de mute',
      };
    }
    case 'time': {
      const mode = options.mode ?? '';
      const value = options.value ?? '';
      const allowed = ['set', 'add', 'query'];
      const allowedSet = ['day', 'night', 'noon', 'midnight', 'sunrise', 'sunset'];
      if (!allowed.includes(mode)) throw new Error('Acción de tiempo inválida.');
      if (mode === 'query') return { command: 'time query daytime', action };
      if (mode === 'set' && !allowedSet.includes(value) && !/^\d{1,6}$/.test(value)) {
        throw new Error('Valor de tiempo inválido.');
      }
      if (mode === 'add' && !/^\d{1,6}$/.test(value)) throw new Error('Valor de tiempo inválido.');
      return { command: `time ${mode} ${value}`, action };
    }
    case 'weather': {
      const mode = options.mode ?? '';
      const allowed = ['clear', 'rain', 'thunder'];
      if (!allowed.includes(mode)) throw new Error('Clima inválido.');
      return { command: `weather ${mode}`, action };
    }
    case 'difficulty': {
      const mode = options.mode ?? '';
      const allowed = ['peaceful', 'easy', 'normal', 'hard'];
      if (!allowed.includes(mode)) throw new Error('Dificultad inválida.');
      return { command: `difficulty ${mode}`, action };
    }
    case 'gamemode': {
      const mode = options.mode ?? '';
      const player = requireValid(minecraftUsername, options.player, 'Jugador inválido.');
      const allowed = ['survival', 'creative', 'adventure', 'spectator'];
      if (!allowed.includes(mode)) throw new Error('Modo de juego inválido.');
      return { command: `gamemode ${mode} ${player}`, action, targetPlayer: player };
    }
    case 'teleport': {
      const player = requireValid(minecraftUsername, options.player, 'Jugador inválido.');
      const destination = options.destination ?? '';
      if (minecraftUsername.safeParse(destination).success) {
        return { command: `tp ${player} ${destination}`, action, targetPlayer: player };
      }
      const coords = requireValid(minecraftCoordinates, destination, 'Destino inválido.');
      return { command: `tp ${player} ${coords}`, action, targetPlayer: player };
    }
    case 'heal': {
      const player = requireValid(minecraftUsername, options.player, 'Jugador inválido.');
      return { command: `heal ${player}`, action, targetPlayer: player, plugin: 'EssentialsX' };
    }
    case 'feed': {
      const player = requireValid(minecraftUsername, options.player, 'Jugador inválido.');
      return { command: `feed ${player}`, action, targetPlayer: player, plugin: 'EssentialsX' };
    }
    case 'xp': {
      const player = requireValid(minecraftUsername, options.player, 'Jugador inválido.');
      const amount = requireValid(minecraftXpAmount, options.amount, 'Cantidad de XP inválida.');
      const mode = options.mode === 'levels' ? 'levels' : 'points';
      const suffix = mode === 'levels' ? 'L' : '';
      return { command: `xp add ${player} ${amount}${suffix}`, action, targetPlayer: player };
    }
    case 'save':
      return { command: 'save-all', action };
    case 'gamerules': {
      const rule = requireValid(minecraftGamerule, options.gamerule, 'Gamerule inválida.');
      const value =
        options.gameruleValue !== undefined && options.gameruleValue.trim() !== ''
          ? requireValid(minecraftGameruleValue, options.gameruleValue, 'Valor inválido.')
          : null;
      return value
        ? { command: `gamerule ${rule} ${value}`, action }
        : { command: `gamerule ${rule}`, action };
    }
    case 'say': {
      const message = requireValid(minecraftMessage, options.message, 'Mensaje inválido.');
      return { command: `say ${message}`, action };
    }
    case 'broadcast': {
      const message = requireValid(minecraftMessage, options.message, 'Mensaje inválido.');
      return {
        command: `broadcast ${message}`,
        action,
        plugin: 'EssentialsX / plugin de broadcast',
      };
    }
    case 'announce': {
      const message = requireValid(minecraftMessage, options.message, 'Mensaje inválido.');
      return { command: `say ${message}`, action };
    }
    case 'console': {
      const command = options.command?.trim() ?? '';
      // console validation is handled by allowlist.ts before building.
      const name = command.split(/\s+/)[0]?.toLowerCase() ?? '';
      requireValid(minecraftCommandName, name, 'Comando inválido.');
      return { command, action };
    }
    default:
      throw new Error('Acción de Minecraft no soportada.');
  }
}
