import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../types/command.js';
import { HelperRepository } from '../../database/repositories/helperRepository.js';
import { isValidGroupName, isValidSkriptTemplate, prepareHelperGrant } from '../../helper/grant.js';
import { minecraftUsername } from '../../minecraft/validators.js';
import { respondWithResult } from '../../minecraft/service.js';
import { errorEmbed, infoEmbed, successEmbed } from '../../utils/embeds.js';

function isConfigAdmin(permissions: { has(flag: bigint): boolean } | null | undefined): boolean {
  return (
    !!permissions &&
    (permissions.has(PermissionFlagsBits.Administrator) ||
      permissions.has(PermissionFlagsBits.ManageGuild))
  );
}

export const helperCommand: Command = {
  category: 'helper',
  cooldownSeconds: 3,
  data: new SlashCommandBuilder()
    .setName('helper')
    .setDescription('Acepta helpers desde un ticket y gestiona la vinculación Discord ↔ Minecraft.')
    .setContexts(0)
    .addSubcommand((sub) =>
      sub
        .setName('aceptar')
        .setDescription('Da el rango helper a un jugador (solo dentro de un ticket).')
        .addUserOption((o) =>
          o.setName('usuario_discord').setDescription('Usuario de Discord').setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName('jugador_minecraft')
            .setDescription('Nombre de jugador de Minecraft')
            .setRequired(true)
            .setMaxLength(16),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('vincular')
        .setDescription('Vincula un usuario de Discord con un jugador de Minecraft.')
        .addUserOption((o) =>
          o.setName('usuario_discord').setDescription('Usuario').setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName('jugador_minecraft')
            .setDescription('Jugador')
            .setRequired(true)
            .setMaxLength(16),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('desvincular')
        .setDescription('Elimina la vinculación de un usuario.')
        .addUserOption((o) =>
          o.setName('usuario_discord').setDescription('Usuario').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('config')
        .setDescription('Configura la función de helpers (requiere Administrar servidor).')
        .addBooleanOption((o) => o.setName('activado').setDescription('Activar o desactivar'))
        .addStringOption((o) =>
          o
            .setName('metodo')
            .setDescription('Cómo se concede el rango')
            .addChoices(
              { name: 'LuckPerms', value: 'luckperms' },
              { name: 'Skript', value: 'skript' },
            ),
        )
        .addStringOption((o) =>
          o
            .setName('grupo')
            .setDescription('Grupo de LuckPerms (por defecto helper)')
            .setMaxLength(32),
        )
        .addStringOption((o) =>
          o
            .setName('comando_skript')
            .setDescription('Plantilla: comando {player}. Debe estar en la allowlist de /mc.')
            .setMaxLength(60),
        )
        .addBooleanOption((o) =>
          o.setName('exigir_vinculo').setDescription('Exigir vínculo Discord ↔ Minecraft'),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('estado').setDescription('Muestra la configuración y los últimos registros.'),
    ),

  async execute(interaction, client) {
    if (!interaction.inGuild() || !interaction.guildId) {
      await interaction.reply({
        embeds: [errorEmbed('Este comando solo funciona en servidores.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const guildId = interaction.guildId;
    const repo = new HelperRepository(client.db.sqlite);
    const sub = interaction.options.getSubcommand();

    if (sub === 'aceptar') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        const user = interaction.options.getUser('usuario_discord', true);
        const result = prepareHelperGrant(client, interaction, {
          discordId: user.id,
          player: interaction.options.getString('jugador_minecraft', true),
        });
        await respondWithResult(interaction, result);
      } catch (error) {
        await interaction.editReply({
          embeds: [errorEmbed(error instanceof Error ? error.message : 'Error inesperado.')],
        });
      }
      return;
    }

    // Everything else changes configuration or links: needs server-management rights.
    if (!isConfigAdmin(interaction.memberPermissions)) {
      await interaction.reply({
        embeds: [errorEmbed('Necesitas el permiso Administrar servidor.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === 'vincular') {
      const user = interaction.options.getUser('usuario_discord', true);
      const parsed = minecraftUsername.safeParse(
        interaction.options.getString('jugador_minecraft', true),
      );
      if (!parsed.success) {
        await interaction.reply({
          embeds: [errorEmbed('Nombre de jugador inválido (1–16 letras, números o _).')],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      const ok = repo.link(guildId, user.id, parsed.data, interaction.user.id);
      await interaction.reply({
        embeds: [
          ok
            ? successEmbed('Vinculado', `<@${user.id}> ↔ **${parsed.data}**`)
            : errorEmbed('Ese jugador ya está vinculado a otra cuenta de Discord.'),
        ],
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      });
      return;
    }

    if (sub === 'desvincular') {
      const user = interaction.options.getUser('usuario_discord', true);
      const removed = repo.unlink(guildId, user.id);
      await interaction.reply({
        embeds: [
          removed
            ? successEmbed('Desvinculado', `<@${user.id}> ya no tiene jugador vinculado.`)
            : errorEmbed('Ese usuario no tenía vínculo.'),
        ],
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      });
      return;
    }

    if (sub === 'config') {
      const patch: Parameters<HelperRepository['updateSettings']>[1] = {};
      const enabled = interaction.options.getBoolean('activado');
      if (enabled !== null) patch.enabled = enabled;
      const method = interaction.options.getString('metodo');
      if (method === 'luckperms' || method === 'skript') patch.method = method;
      const group = interaction.options.getString('grupo');
      if (group !== null) {
        const normalized = group.trim().toLowerCase();
        if (!isValidGroupName(normalized)) {
          await interaction.reply({
            embeds: [errorEmbed('Grupo inválido: usa solo a-z, 0-9, _ o - (máx. 32).')],
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        patch.groupName = normalized;
      }
      const template = interaction.options.getString('comando_skript');
      if (template !== null) {
        const normalized = template.trim();
        if (!isValidSkriptTemplate(normalized)) {
          await interaction.reply({
            embeds: [errorEmbed('Plantilla inválida: usa `comando {player}` (un solo comando).')],
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        patch.skriptCommand = normalized;
      }
      const requireLink = interaction.options.getBoolean('exigir_vinculo');
      if (requireLink !== null) patch.requireLink = requireLink;
      repo.updateSettings(guildId, patch);
    }

    const settings = repo.getSettings(guildId);
    const grants = repo.listGrants(guildId, 5);
    await interaction.reply({
      embeds: [
        infoEmbed(
          'Helpers',
          [
            `Estado: **${settings.enabled ? 'activado' : 'desactivado'}**`,
            `Método: **${settings.method}** · Grupo: \`${settings.groupName}\``,
            `Skript: ${settings.skriptCommand ? `\`${settings.skriptCommand}\`` : 'sin configurar'}`,
            `Vínculo obligatorio: **${settings.requireLink ? 'sí' : 'no'}**`,
            '',
            grants.length
              ? grants
                  .map((g) => `#${g.id} <@${g.discordId}> → **${g.player}** · ${g.result}`)
                  .join('\n')
              : 'Sin registros todavía.',
          ].join('\n'),
        ),
      ],
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
  },
};

export default helperCommand;
