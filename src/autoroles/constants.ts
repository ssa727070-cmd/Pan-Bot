export const AUTOROLE_PANEL_PREFIX = 'autorole_panel:';
export const AUTOROLE_PANEL_COMPONENT_ID = `${AUTOROLE_PANEL_PREFIX}toggle`;

/** Parses a persistent role-panel button id. Returns null for old or malformed panels. */
export function parsePanelCustomId(customId: string): { panelId: number; roleId: string } | null {
  if (!customId.startsWith(AUTOROLE_PANEL_PREFIX) || customId === AUTOROLE_PANEL_COMPONENT_ID) {
    return null;
  }
  const parts = customId.slice(AUTOROLE_PANEL_PREFIX.length).split(':');
  if (parts.length !== 2) return null;
  const panelId = Number(parts[0]);
  const roleId = parts[1];
  if (!Number.isSafeInteger(panelId) || panelId <= 0 || !roleId || !/^\d{17,20}$/.test(roleId)) {
    return null;
  }
  return { panelId, roleId };
}
