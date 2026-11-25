import type { Guild, GuildMember } from 'discord.js';
import type { PanClient } from '../core/client.js';
import { logger } from '../core/logger.js';
import {
  HelperRepository,
  type HelperSettings,
} from '../database/repositories/helperRepository.js';
import { MinecraftRepository } from '../database/repositories/minecraftRepository.js';
import { TicketRepository, type Ticket } from '../database/repositories/ticketRepository.js';
import { validateConsoleInput } from '../minecraft/allowlist.js';
import { createConfirmation, type MinecraftConfirmationAction } from '../minecraft/confirmation.js';
import { getMinecraftConnection, runRconCommand } from '../minecraft/connection.js';
import { detectPlugins } from '../minecraft/integrations.js';
import { redactSecrets } from '../minecraft/redact.js';
import { checkMinecraftAccess, confirmationPrompt, ensureGuild } from '../minecraft/service.js';
import type { MinecraftActionResult, MinecraftInteraction } from '../minecraft/types.js';
import { minecraftUsername } from '../minecraft/validators.js';
import { actorOf, policyFor } from '../tickets/service.js';
import { isTicketStaff } from '../tickets/permissions.js';
import { errorEmbed, successEmbed, warningEmbed } from '../utils/embeds.js';

export type HelperConfirmation = Extract<MinecraftConfirmationAction, { kind: 'helper' }>;

const GROUP_PATTERN = /^[a-z0-9_-]{1,32}$/;
const SKRIPT_TEMPLATE_PATTERN = /^[A-Za-z0-9_:-]{1,32} \{player\}$/;

export function isValidGroupName(value: string): boolean {
  return GROUP_PATTERN.test(value);
}

/** The Skript command must be a single command name followed by the `{player}` placeholder. */
export function isValidSkriptTemplate(value: string): boolean {
  return SKRIPT_TEMPLATE_PATTERN.test(value);
}

export interface HelperOutcome {
  result: 'success' | 'failure';
  detail: string;
}

/**
 * Interprets the text a LuckPerms console command returns. Wording differs between
 * versions, so anything unrecognised is reported as unconfirmed instead of success.
 */
export function classifyLuckPermsOutput(rawOutput: string): HelperOutcome {
  const output = rawOutput
    .replace(/§./g, '')
    // eslint-disable-next-line no-control-regex -- strips ANSI colour codes from console output.
    .replace(/\u001b\[[0-9;]*m/g, '')
    .trim();
  if (!output) return { result: 'failure', detail: 'LuckPerms no devolvió respuesta.' };
  if (/already|ya (?:es|tiene|hereda)/i.test(output)) {
    return { result: 'success', detail: 'El jugador ya pertenecía al grupo.' };
  }
  if (
    /does not exist|could not be found|unable to find|no such|unknown (?:command|group|user)|not found|invalid|usage:|no permission|never joined|cannot/i.test(
      output,
    )
  ) {
    return { result: 'failure', detail: output.slice(0, 200) };
  }
  if (/now inherits|inherit|set parent|added|success|has been/i.test(output)) {
    return { result: 'success', detail: output.slice(0, 200) };
  }
  return {
    result: 'failure',
    detail: `Respuesta no reconocida, no se puede confirmar: ${output.slice(0, 160)}`,
  };
}

export function classifyGenericOutput(rawOutput: string): HelperOutcome {
  const output = rawOutput.replace(/§./g, '').trim();
  if (/unknown command|not found|no such command|usage:|no permission|error/i.test(output)) {
    return { result: 'failure', detail: output.slice(0, 200) };
  }
  return {
    result: 'success',
    detail: output ? output.slice(0, 200) : 'Comando ejecutado (Skript no confirma el resultado).',
  };
}

export type HelperCheck =
  | { ok: true; ticket: Ticket; settings: HelperSettings; player: string; command: string | null }
  | { ok: false; error: string };

/**
 * Every precondition for a helper grant. It runs both when the staff member asks and
 * again when they confirm, so nothing relies on state captured earlier.
 */
export function checkHelperRequest(
  client: PanClient,
  guild: Guild,
  member: GuildMember,
  input: { ticketChannelId: string; discordId: string; player: string },
): HelperCheck {
  const helper = new HelperRepository(client.db.sqlite);
  const settings = helper.getSettings(guild.id);
  if (!settings.enabled) {
    return {
      ok: false,
      error: 'La función de helpers está desactivada. Un administrador debe usar `/helper config`.',
    };
  }

  const parsed = minecraftUsername.safeParse(input.player);
  if (!parsed.success) {
    return { ok: false, error: 'Nombre de jugador inválido (1–16 letras, números o _).' };
  }
  const player = parsed.data;

  const tickets = new TicketRepository(client.db.sqlite);
  const ticket = tickets.getByChannel(input.ticketChannelId);
  if (!ticket || ticket.guildId !== guild.id) {
    return { ok: false, error: 'Este comando solo funciona dentro de un ticket de este servidor.' };
  }
  if (ticket.status === 'closing' || ticket.status === 'closed') {
    return { ok: false, error: 'El ticket ya no está abierto.' };
  }

  if (!isTicketStaff(actorOf(member), policyFor(tickets, guild.id))) {
    return { ok: false, error: 'Solo el equipo de soporte de este ticket puede aceptar helpers.' };
  }

  const participants = new Set([ticket.creatorId, ...tickets.participants(ticket.id)]);
  if (!participants.has(input.discordId)) {
    return { ok: false, error: 'Ese usuario no forma parte de este ticket.' };
  }

  const ownLink = helper.getLinkByDiscord(guild.id, input.discordId);
  if (ownLink && ownLink.player.toLowerCase() !== player.toLowerCase()) {
    return {
      ok: false,
      error: `Ese usuario está vinculado al jugador **${ownLink.player}**, no a **${player}**.`,
    };
  }
  const playerOwner = helper.getLinkByPlayer(guild.id, player);
  if (playerOwner && playerOwner.discordId !== input.discordId) {
    return { ok: false, error: `**${player}** está vinculado a otra cuenta de Discord.` };
  }
  if (settings.requireLink && !ownLink) {
    return {
      ok: false,
      error: 'Este servidor exige vincular Discord y Minecraft antes (`/helper vincular`).',
    };
  }

  let command: string | null = null;
  if (settings.method === 'luckperms') {
    if (!isValidGroupName(settings.groupName)) {
      return { ok: false, error: 'El nombre del grupo configurado no es válido.' };
    }
    command = `lp user ${player} parent add ${settings.groupName}`;
  } else {
    if (!settings.skriptCommand || !isValidSkriptTemplate(settings.skriptCommand)) {
      return { ok: false, error: 'No hay un comando de Skript válido configurado.' };
    }
    const candidate = settings.skriptCommand.replace('{player}', player);
    // Reuse the console allowlist: the command must have been explicitly allowed by an admin.
    const validation = validateConsoleInput(candidate, {
      custom: new MinecraftRepository(client.db.sqlite).listAllowedCommands(guild.id),
      unrestricted: false,
      isOwner: false,
    });
    if (!validation.ok) {
      return {
        ok: false,
        error: `El comando de Skript no está permitido: ${validation.error}`,
      };
    }
    command = validation.command;
  }

  return { ok: true, ticket, settings, player, command };
}

/** `/helper aceptar`: validates everything, then asks the staff member to confirm. */
export function prepareHelperGrant(
  client: PanClient,
  interaction: MinecraftInteraction,
  input: { discordId: string; player: string },
): MinecraftActionResult {
  const { guild, member } = ensureGuild(interaction);
  const denied = checkMinecraftAccess(client, member, 'helper-grant', { target: input.player });
  if (denied) return denied;

  const channelId = interaction.channelId;
  const check = channelId
    ? checkHelperRequest(client, guild, member, { ticketChannelId: channelId, ...input })
    : ({ ok: false, error: 'Este comando solo funciona dentro de un ticket.' } as const);
  if (!check.ok) return { ephemeral: true, embeds: [errorEmbed(check.error)] };

  const token = createConfirmation({
    guildId: guild.id,
    userId: member.id,
    action: {
      kind: 'helper',
      ticketChannelId: check.ticket.channelId,
      discordId: input.discordId,
      player: check.player,
    },
  });
  return confirmationPrompt(
    token,
    'Confirmar helper',
    `Vas a dar el rango **${check.settings.groupName}** a **${check.player}** (<@${input.discordId}>) ` +
      `mediante **${check.settings.method === 'luckperms' ? 'LuckPerms' : 'Skript'}**.\n` +
      `Comando: \`${check.command}\``,
  );
}

/** Runs the confirmed grant. Called from `applyConfirmedAction` after the access check. */
export async function applyHelperGrant(
  client: PanClient,
  interaction: MinecraftInteraction,
  action: HelperConfirmation,
): Promise<MinecraftActionResult> {
  const { guild, member } = ensureGuild(interaction);
  const helper = new HelperRepository(client.db.sqlite);
  const minecraft = new MinecraftRepository(client.db.sqlite);

  const check = checkHelperRequest(client, guild, member, action);
  if (!check.ok) return { ephemeral: true, embeds: [errorEmbed(check.error)] };
  const { ticket, settings, player, command } = check;

  const base = {
    guildId: guild.id,
    ticketId: ticket.id,
    channelId: ticket.channelId,
    discordId: action.discordId,
    player,
    approvedBy: member.id,
    method: settings.method,
  };
  const finish = async (outcome: HelperOutcome): Promise<MinecraftActionResult> => {
    helper.recordGrant({ ...base, result: outcome.result, detail: outcome.detail });
    minecraft.recordAudit({
      guildId: guild.id,
      adminId: member.id,
      action: 'helper-grant',
      targetPlayer: player,
      command,
      result: outcome.result,
      error: outcome.result === 'failure' ? outcome.detail : null,
    });
    new TicketRepository(client.db.sqlite).recordEvent({
      guildId: guild.id,
      ticketId: ticket.id,
      type: outcome.result === 'success' ? 'helper_granted' : 'helper_failed',
      actorId: member.id,
      detail: `${player}: ${outcome.detail}`.slice(0, 300),
    });

    const embed =
      outcome.result === 'success'
        ? successEmbed(
            'Helper aceptado',
            `<@${action.discordId}> (**${player}**) ahora tiene el rango **${settings.groupName}**.\n` +
              `Aprobado por <@${member.id}>.`,
          )
        : warningEmbed(
            'No se pudo aceptar al helper',
            `Jugador: **${player}**\nMotivo: ${redactSecrets(outcome.detail)}\nAprobado por <@${member.id}>.`,
          );
    const channel = await client.channels.fetch(ticket.channelId).catch(() => null);
    if (channel?.isTextBased() && 'send' in channel) {
      await channel
        .send({ embeds: [embed], allowedMentions: { parse: [] } })
        .catch((error: unknown) =>
          logger.warn({ error, guildId: guild.id }, 'No se pudo informar en el ticket'),
        );
    }
    return { ephemeral: true, embeds: [embed] };
  };

  const connection = getMinecraftConnection(client, guild.id);
  if (connection.rconUnavailableReason) {
    return finish({ result: 'failure', detail: 'RCON no está disponible para este servidor.' });
  }

  try {
    const plugins = detectPlugins(await runRconCommand(client, guild.id, 'plugins'));
    if (settings.method === 'luckperms' && !plugins.luckPerms) {
      return finish({ result: 'failure', detail: 'LuckPerms no está instalado o no se detecta.' });
    }
    if (settings.method === 'skript' && !plugins.skript) {
      return finish({ result: 'failure', detail: 'Skript no está instalado o no se detecta.' });
    }
    const output = await runRconCommand(client, guild.id, command ?? '');
    return finish(
      settings.method === 'luckperms'
        ? classifyLuckPermsOutput(output)
        : classifyGenericOutput(output),
    );
  } catch (error) {
    return finish({
      result: 'failure',
      detail: redactSecrets(error instanceof Error ? error.message : error).slice(0, 200),
    });
  }
}
