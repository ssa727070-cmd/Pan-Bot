export const SUGGEST_MODAL = 'suggest_modal';
export const SUGGEST_TEXT_INPUT = 'suggest_text';
export const SUGGEST_VOTE_PREFIX = 'suggest_vote:';

export type SuggestionVoteAction = 'up' | 'down' | 'clear';

/** Parses persistent vote buttons; rejects malformed or legacy ids. */
export function parseVoteCustomId(
  customId: string,
): { id: number; action: SuggestionVoteAction } | null {
  if (!customId.startsWith(SUGGEST_VOTE_PREFIX)) return null;
  const parts = customId.slice(SUGGEST_VOTE_PREFIX.length).split(':');
  if (parts.length !== 2) return null;
  const id = Number(parts[0]);
  const action = parts[1];
  if (!Number.isSafeInteger(id) || id <= 0 || !['up', 'down', 'clear'].includes(action ?? '')) {
    return null;
  }
  return { id, action: action as SuggestionVoteAction };
}
