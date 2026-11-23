/** Every event that can be toggled through /logs. */
export const LOG_EVENTS = [
  'member_join',
  'member_leave',
  'message_edit',
  'message_delete',
  'channel_create',
  'channel_delete',
  'channel_update',
  'role_create',
  'role_delete',
  'role_update',
  'ban',
  'unban',
  'moderation',
  'ticket',
] as const;

export type LogEvent = (typeof LOG_EVENTS)[number];

export const LOG_EVENT_LABELS: Record<LogEvent, string> = {
  member_join: 'Entrada de miembros',
  member_leave: 'Salida de miembros',
  message_edit: 'Edición de mensajes',
  message_delete: 'Borrado de mensajes',
  channel_create: 'Creación de canales',
  channel_delete: 'Borrado de canales',
  channel_update: 'Actualización de canales',
  role_create: 'Creación de roles',
  role_delete: 'Borrado de roles',
  role_update: 'Actualización de roles',
  ban: 'Baneos',
  unban: 'Desbaneos',
  moderation: 'Acciones de moderación',
  ticket: 'Tickets',
};

export function isLogEvent(value: string): value is LogEvent {
  return (LOG_EVENTS as readonly string[]).includes(value);
}
