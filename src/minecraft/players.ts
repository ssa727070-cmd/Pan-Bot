import type { MinecraftStatus } from './types.js';

/** A player list plus whether it is known to contain every online player. */
export interface PlayerSnapshot {
  complete: boolean;
  players: string[];
}

const USERNAME = /^[A-Za-z0-9_]{1,16}$/;

function stripFormatting(value: string): string {
  return value.replace(/§./g, '');
}

/**
 * Parses the output of the `list` console command (vanilla, Paper/Spigot and the
 * grouped EssentialsX format). Returns null when the output is not a player list.
 * The snapshot is only complete when every name is a real username and the
 * number of names matches the reported count (nicknames and hidden players fail).
 */
export function parseListOutput(raw: string): PlayerSnapshot | null {
  const text = stripFormatting(raw).trim();
  const match =
    /There (?:are|is) (\d+)\s*(?:of a max(?:imum)?(?: of)?|out of (?:a )?max(?:imum)?|\/)\s*\d+\s*players? online[.:]?\s*([\s\S]*)$/i.exec(
      text,
    );
  if (!match) return null;

  const count = Number(match[1]);
  const names: string[] = [];
  let valid = true;
  for (const rawLine of (match[2] ?? '').split(/\r?\n/)) {
    // EssentialsX prints "Group: name, name"; vanilla prints names directly.
    const line = rawLine.includes(':') ? rawLine.slice(rawLine.indexOf(':') + 1) : rawLine;
    for (const entry of line.split(',')) {
      const name = entry
        .trim()
        .replace(/^(?:\[[^\]]*\]\s*)+/, '')
        .trim();
      if (!name) continue;
      if (USERNAME.test(name)) names.push(name);
      else valid = false;
    }
  }

  const unique = [...new Set(names)];
  return { complete: valid && unique.length === count, players: unique };
}

/**
 * The server-list ping `sample` is a *partial* list (vanilla shows at most 12
 * players and plugins may replace it with arbitrary text). It is only treated as
 * complete when it holds exactly `playersOnline` valid usernames.
 */
export function snapshotFromStatus(status: MinecraftStatus): PlayerSnapshot {
  if (status.playersOnline === 0) return { complete: true, players: [] };
  const names = [...new Set(status.playerNames)];
  const allValid = names.every((name) => USERNAME.test(name));
  return {
    complete: allValid && names.length === status.playersOnline,
    players: names.filter((name) => USERNAME.test(name)),
  };
}
