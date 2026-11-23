export interface TemplateData {
  userId: string;
  username: string;
  guildName: string;
  memberCount: number;
}

export const DEFAULT_WELCOME_MESSAGE =
  '¡Bienvenido {user} a {server}! Ya somos {memberCount} miembros.';
export const DEFAULT_GOODBYE_MESSAGE = 'Adiós, **{username}**. Te extrañaremos en {server}.';

/** Replaces all supported placeholders in a welcome/goodbye message. */
export function renderTemplate(template: string, data: TemplateData): string {
  return template
    .replaceAll('{user}', `<@${data.userId}>`)
    .replaceAll('{mention}', `<@${data.userId}>`)
    .replaceAll('{username}', data.username)
    .replaceAll('{server}', data.guildName)
    .replaceAll('{guild}', data.guildName)
    .replaceAll('{memberCount}', String(data.memberCount))
    .replaceAll('{count}', String(data.memberCount));
}

/** Validates a six-digit hex colour, returning null when invalid. */
export function parseEmbedColor(value: string): number | null {
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return null;
  return Number.parseInt(value, 16);
}
