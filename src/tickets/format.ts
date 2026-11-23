export interface TranscriptMessage {
  createdAt: Date;
  author: string;
  content: string;
  attachments: string[];
}

/** Builds a readable plain-text transcript from ticket messages. */
export function formatTranscript(messages: TranscriptMessage[], guildName = 'Servidor'): string {
  const lines = messages.map((message) => {
    const timestamp = message.createdAt.toISOString().replace('T', ' ').slice(0, 19);
    const content = message.content || '(sin contenido)';
    const attachments = message.attachments.length
      ? `\n  Adjuntos: ${message.attachments.join(', ')}`
      : '';
    return `[${timestamp}] ${message.author}: ${content}${attachments}`;
  });

  return [
    `TRANSCRIPTO DE TICKET — ${guildName}`,
    `Generado: ${new Date().toISOString()}`,
    '════════════════════════════════════════',
    ...lines,
  ].join('\n');
}

/** Generates a safe, Discord-compatible channel name for a ticket. */
export function ticketChannelName(number: number, username: string): string {
  const slug = username
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 20);
  return `ticket-${number}${slug ? `-${slug}` : ''}`;
}
