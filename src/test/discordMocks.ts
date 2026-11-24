/** Minimal, recording stand-ins for discord.js guilds, members and interactions (tests only). */

export interface Recorder {
  events: Array<{ type: string; at: number; payload?: any }>;
}

export function createRecorder(): Recorder {
  return { events: [] };
}

export function mockGuild(input: { id: string; ownerId: string }): any {
  return {
    id: input.id,
    ownerId: input.ownerId,
    channels: {
      fetch: async (id: string) => ({
        id,
        type: 0, // ChannelType.GuildText
        send: async () => ({ id: `message-${id}` }),
      }),
    },
  };
}

export function mockMember(input: {
  id: string;
  guild: any;
  roles?: string[];
  perms?: string[];
}): any {
  const roles = new Set(input.roles ?? []);
  const perms = new Set(input.perms ?? []);
  return {
    id: input.id,
    guild: input.guild,
    user: { id: input.id },
    roles: { cache: { has: (id: string) => roles.has(id) }, set: roles },
    permissions: { has: (perm: string) => perms.has(perm) },
  };
}

function baseInteraction(member: any, recorder: Recorder): any {
  const interaction: any = {
    guild: member.guild,
    guildId: member.guild.id,
    member,
    user: member.user,
    deferred: false,
    replied: false,
    inGuild: () => true,
    isMessageComponent: () => false,
    async deferReply(payload?: any) {
      if (interaction.deferred || interaction.replied) throw new Error('Already acknowledged');
      interaction.deferred = true;
      recorder.events.push({ type: 'deferReply', at: Date.now(), payload });
    },
    async editReply(payload: any) {
      if (!interaction.deferred && !interaction.replied) throw new Error('Not acknowledged');
      recorder.events.push({ type: 'editReply', at: Date.now(), payload });
    },
    async reply(payload: any) {
      if (interaction.deferred || interaction.replied) throw new Error('Already acknowledged');
      interaction.replied = true;
      recorder.events.push({ type: 'reply', at: Date.now(), payload });
    },
    async followUp(payload: any) {
      recorder.events.push({ type: 'followUp', at: Date.now(), payload });
    },
  };
  return interaction;
}

export function mockChatInput(input: {
  member: any;
  subcommand: string;
  options?: Record<string, string | number | boolean | null | undefined>;
  recorder?: Recorder;
}): any {
  const recorder = input.recorder ?? createRecorder();
  const values = input.options ?? {};
  const interaction = baseInteraction(input.member, recorder);
  interaction.recorder = recorder;
  interaction.options = {
    getSubcommand: () => input.subcommand,
    getString: (name: string) => (typeof values[name] === 'string' ? values[name] : null),
    getInteger: (name: string) => (typeof values[name] === 'number' ? values[name] : null),
    getBoolean: (name: string) => (typeof values[name] === 'boolean' ? values[name] : null),
    getChannel: (name: string) => (typeof values[name] === 'string' ? { id: values[name] } : null),
    getRole: (name: string) => (typeof values[name] === 'string' ? { id: values[name] } : null),
  };
  return interaction;
}

export function mockButton(input: { member: any; customId: string; recorder?: Recorder }): any {
  const recorder = input.recorder ?? createRecorder();
  const interaction = baseInteraction(input.member, recorder);
  interaction.recorder = recorder;
  interaction.customId = input.customId;
  interaction.isMessageComponent = () => true;
  interaction.deferUpdate = async () => {
    if (interaction.deferred || interaction.replied) throw new Error('Already acknowledged');
    interaction.deferred = true;
    recorder.events.push({ type: 'deferUpdate', at: Date.now() });
  };
  interaction.update = async (payload: any) => {
    if (interaction.deferred || interaction.replied) throw new Error('Already acknowledged');
    interaction.replied = true;
    recorder.events.push({ type: 'update', at: Date.now(), payload });
  };
  return interaction;
}

/** All text (titles, descriptions, fields) of the embeds in a recorded payload. */
export function payloadText(payload: any): string {
  const embeds: any[] = payload?.embeds ?? [];
  return embeds
    .map((embed) => {
      const data = embed?.data ?? embed;
      return [
        data.title,
        data.description,
        ...(data.fields ?? []).map((f: any) => `${f.name} ${f.value}`),
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n');
}

/** customIds of the buttons in a recorded payload. */
export function payloadCustomIds(payload: any): string[] {
  const rows: any[] = payload?.components ?? [];
  return rows.flatMap((row) =>
    (row?.components ?? []).map((component: any) => component?.data?.custom_id),
  );
}
