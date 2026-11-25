export interface TranscriptMessage {
  createdAt: Date;
  author: string;
  content: string;
  attachments: string[];
  /** Plain-text summaries of embeds, so bot/system notices appear in the transcript. */
  embeds?: string[];
}

/** Builds a readable plain-text transcript from ticket messages. */
export function formatTranscript(
  messages: TranscriptMessage[],
  guildName = 'Servidor',
  header: string[] = [],
): string {
  const lines = messages.map((message) => {
    const timestamp = message.createdAt.toISOString().replace('T', ' ').slice(0, 19);
    const content = message.content || '(sin contenido)';
    const attachments = message.attachments.length
      ? `\n  Adjuntos: ${message.attachments.join(', ')}`
      : '';
    const embeds = message.embeds?.length
      ? message.embeds.map((embed) => `\n  [Embed] ${embed}`).join('')
      : '';
    return `[${timestamp}] ${message.author}: ${content}${embeds}${attachments}`;
  });

  return [
    `TRANSCRIPTO DE TICKET — ${guildName}`,
    `Generado: ${new Date().toISOString()}`,
    ...header,
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

/** Escapes Discord mentions so transcripts and logs can never ping anybody. */
export function neutralizeMentions(text: string): string {
  return text.replace(/@(everyone|here)/g, '@\u200b$1').replace(/<@([!&]?\d+)>/g, '<@\u200b$1>');
}
