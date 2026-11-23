import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import {
  AutomodRepository,
  type AutomodSettings,
} from '../../database/repositories/automodRepository.js';
import { syncNativeRules } from '../../automod/nativeRules.js';
import type { Command } from '../../types/command.js';
import { createEmbed, errorEmbed, successEmbed } from '../../utils/embeds.js';
import { boundedInteger, blockedWord } from '../../validation/config.js';

const command: Command = {
  category: 'automod',
  data: new SlashCommandBuilder()
    .setName('automod')
    .setDescription('Configura la moderación automática del servidor.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName('setup')
        .setDescription('Activa AutoMod y configura las acciones permitidas.')
        .addBooleanOption((option) =>
          option
            .setName('nativo')
            .setDescription('Usar también reglas nativas de Discord')
            .setRequired(false),
        )
        .addBooleanOption((option) =>
          option
            .setName('eliminar')
            .setDescription('Eliminar mensajes que infrinjan')
            .setRequired(false),
        )
        .addBooleanOption((option) =>
          option.setName('advertir').setDescription('Enviar un aviso por DM').setRequired(false),
        )
        .addBooleanOption((option) =>
          option
            .setName('repetidos')
            .setDescription('Detectar caracteres repetidos en exceso')
            .setRequired(false),
        )
        .addIntegerOption((option) =>
          option
            .setName('silenciar')
            .setDescription('Minutos de silencio (0 = desactivado, máx. 1440)')
            .setMinValue(0)
            .setMaxValue(1440)
            .setRequired(false),
        )
        .addBooleanOption((option) =>
          option.setName('registrar').setDescription('Registrar incidencias').setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('status').setDescription('Muestra la configuración actual.'),
    )
    .addSubcommand((sub) =>
      sub.setName('enable').setDescription('Activa los filtros configurados.'),
    )
    .addSubcommand((sub) => sub.setName('disable').setDescription('Desactiva todos los filtros.'))
    .addSubcommand((sub) =>
      sub
        .setName('spam')
        .setDescription('Configura la detección de spam.')
        .addBooleanOption((option) =>
          option
            .setName('activo')
            .setDescription('Activa o desactiva el filtro')
            .setRequired(false),
        )
        .addIntegerOption((option) =>
          option
            .setName('ventana')
            .setDescription('Ventana en segundos (5-60)')
            .setMinValue(5)
            .setMaxValue(60)
            .setRequired(false),
        )
        .addIntegerOption((option) =>
          option
            .setName('max_mensajes')
            .setDescription('Mensajes máximos en la ventana (3-30)')
            .setMinValue(3)
            .setMaxValue(30)
            .setRequired(false),
        )
        .addIntegerOption((option) =>
          option
            .setName('max_menciones')
            .setDescription('Menciones máximas (2-50)')
            .setMinValue(2)
            .setMaxValue(50)
            .setRequired(false),
        )
        .addBooleanOption((option) =>
          option
            .setName('identicos')
            .setDescription('Detectar mensajes idénticos')
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('words')
        .setDescription('Gestiona la lista de palabras bloqueadas.')
        .addStringOption((option) =>
          option
            .setName('accion')
            .setDescription('Acción a realizar')
            .setRequired(true)
            .addChoices(
              { name: 'Añadir', value: 'add' },
              { name: 'Quitar', value: 'remove' },
              { name: 'Listar', value: 'list' },
            ),
        )
        .addStringOption((option) =>
          option.setName('palabra').setDescription('Palabra o frase literal').setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('links')
        .setDescription('Activa o desactiva el filtro de enlaces.')
        .addBooleanOption((option) =>
          option.setName('activo').setDescription('Activar filtro').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('invites')
        .setDescription('Activa o desactiva el filtro de invitaciones.')
        .addBooleanOption((option) =>
          option.setName('activo').setDescription('Activar filtro').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('mentions')
        .setDescription('Configura el filtro de menciones masivas.')
        .addBooleanOption((option) =>
          option.setName('activo').setDescription('Activar filtro').setRequired(true),
        )
        .addIntegerOption((option) =>
          option
            .setName('maximo')
            .setDescription('Menciones máximas (2-50)')
            .setMinValue(2)
            .setMaxValue(50)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('exemptions')
        .setDescription('Gestiona exenciones de AutoMod.')
        .addStringOption((option) =>
          option
            .setName('accion')
            .setDescription('Acción a realizar')
            .setRequired(true)
            .addChoices(
              { name: 'Añadir', value: 'add' },
              { name: 'Quitar', value: 'remove' },
              { name: 'Listar', value: 'list' },
            ),
        )
        .addStringOption((option) =>
          option
            .setName('tipo')
            .setDescription('Tipo de exención')
            .setRequired(false)
            .addChoices(
              { name: 'Rol', value: 'role' },
              { name: 'Canal', value: 'channel' },
              { name: 'Usuario', value: 'user' },
            ),
        )
        .addStringOption((option) =>
          option.setName('id').setDescription('ID del rol, canal o usuario').setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('logs')
        .setDescription('Muestra incidencias o configura su registro.')
        .addBooleanOption((option) =>
          option
            .setName('registrar')
            .setDescription('Registrar incidencias en logs')
            .setRequired(false),
        ),
    ),

  async execute(interaction, client) {
    if (!interaction.guild) return;
    const guildId = interaction.guild.id;
    const repo = new AutomodRepository(client.db.sqlite);
    const settings = repo.getSettings(guildId);
    const subcommand = interaction.options.getSubcommand(true);

    const refreshNative = async (next = repo.getSettings(guildId)): Promise<void> => {
      await syncNativeRules(client, interaction.guild!, next);
    };

    if (subcommand === 'status') {
      const exemptions = repo.listExemptions(guildId);
      await interaction.reply({
        embeds: [
          createEmbed({
            title: '🛡️ Estado de AutoMod',
            fields: [
              {
                name: 'Sistema',
                value: settings.enabled ? 'Activado' : 'Desactivado',
                inline: true,
              },
              {
                name: 'Reglas nativas',
                value: settings.nativeRules ? 'Activadas' : 'Desactivadas',
                inline: true,
              },
              {
                name: 'Filtros',
                value:
                  `Spam: ${settings.spamEnabled ? 'sí' : 'no'} · Enlaces: ${settings.linksEnabled ? 'sí' : 'no'}\n` +
                  `Invitaciones: ${settings.invitesEnabled ? 'sí' : 'no'} · Menciones: ${settings.mentionsEnabled ? 'sí' : 'no'}\n` +
                  `Palabras: ${settings.wordsEnabled ? 'sí' : 'no'} · Repetidos: ${settings.repeatedCharsEnabled ? 'sí' : 'no'}`,
              },
              {
                name: 'Acciones',
                value:
                  `Eliminar: ${settings.deleteMessage ? 'sí' : 'no'} · Avisar: ${settings.warnUser ? 'sí' : 'no'}\n` +
                  `Silenciar: ${settings.timeoutMinutes ? `${settings.timeoutMinutes} min` : 'no'} · Registrar: ${settings.logIncidents ? 'sí' : 'no'}`,
              },
              { name: 'Exenciones', value: String(exemptions.length), inline: true },
            ],
            footer: 'PAN BOT · AutoMod',
          }),
        ],
        ephemeral: true,
      });
      return;
    }

    if (subcommand === 'setup' || subcommand === 'enable' || subcommand === 'disable') {
      const enabled = subcommand !== 'disable';
      const actionPatch: Partial<Omit<AutomodSettings, 'guildId'>> = { enabled };
      if (subcommand === 'setup') {
        const native = interaction.options.getBoolean('nativo');
        const remove = interaction.options.getBoolean('eliminar');
        const warn = interaction.options.getBoolean('advertir');
        const repeated = interaction.options.getBoolean('repetidos');
        const timeout = interaction.options.getInteger('silenciar');
        const register = interaction.options.getBoolean('registrar');
        if (native !== null) actionPatch.nativeRules = native;
        if (remove !== null) actionPatch.deleteMessage = remove;
        if (warn !== null) actionPatch.warnUser = warn;
        if (repeated !== null) actionPatch.repeatedCharsEnabled = repeated;
        if (timeout !== null) actionPatch.timeoutMinutes = boundedInteger(0, 1440).parse(timeout);
        if (register !== null) actionPatch.logIncidents = register;
      }
      repo.setSettings(guildId, actionPatch);
      await refreshNative();
      await interaction.reply({
        embeds: [
          successEmbed(
            enabled ? 'AutoMod activado' : 'AutoMod desactivado',
            'La configuración detallada se ha conservado. Usa `/automod status` para verla.',
          ),
        ],
        ephemeral: true,
      });
      return;
    }

    if (subcommand === 'spam') {
      const active = interaction.options.getBoolean('activo');
      const window = interaction.options.getInteger('ventana');
      const maxMessages = interaction.options.getInteger('max_mensajes');
      const maxMentions = interaction.options.getInteger('max_menciones');
      const identical = interaction.options.getBoolean('identicos');
      const patch: Record<string, number | boolean> = {};
      if (active !== null) patch.spamEnabled = active;
      if (window !== null) patch.spamWindowSeconds = boundedInteger(5, 60).parse(window);
      if (maxMessages !== null) patch.spamMaxMessages = boundedInteger(3, 30).parse(maxMessages);
      if (maxMentions !== null) patch.spamMaxMentions = boundedInteger(2, 50).parse(maxMentions);
      if (identical !== null) patch.spamIdentical = identical;
      repo.setSettings(guildId, patch as Partial<Omit<AutomodSettings, 'guildId'>>);
      await refreshNative();
      await interaction.reply({
        embeds: [successEmbed('Spam configurado', 'Los umbrales de spam se han actualizado.')],
        ephemeral: true,
      });
      return;
    }

    if (subcommand === 'links' || subcommand === 'invites' || subcommand === 'mentions') {
      const active = interaction.options.getBoolean('activo', true);
      const max = interaction.options.getInteger('maximo');
      const patch: Record<string, number | boolean> =
        subcommand === 'links'
          ? { linksEnabled: active }
          : subcommand === 'invites'
            ? { invitesEnabled: active }
            : {
                mentionsEnabled: active,
                ...(max !== null ? { spamMaxMentions: boundedInteger(2, 50).parse(max) } : {}),
              };
      repo.setSettings(guildId, patch as Partial<Omit<AutomodSettings, 'guildId'>>);
      await refreshNative();
      await interaction.reply({
        embeds: [
          successEmbed(
            'Filtro actualizado',
            `El filtro **${subcommand}** se ha ${active ? 'activado' : 'desactivado'}.`,
          ),
        ],
        ephemeral: true,
      });
      return;
    }

    if (subcommand === 'words') {
      const action = interaction.options.getString('accion', true);
      const word = interaction.options.getString('palabra');

      if (action === 'list' || !word) {
        const words = repo.listWords(guildId);
        await interaction.reply({
          embeds: [
            createEmbed({
              title: '🚫 Palabras bloqueadas',
              description: words.length
                ? words.map((item) => `\`${item}\``).join(', ')
                : 'No hay palabras configuradas.',
              footer: 'PAN BOT · AutoMod',
            }),
          ],
          ephemeral: true,
        });
        return;
      }

      const parsed = blockedWord.safeParse(word);
      if (!parsed.success) {
        await interaction.reply({
          embeds: [
            errorEmbed('La frase debe tener 2-50 caracteres y no incluir expresiones regulares.'),
          ],
          ephemeral: true,
        });
        return;
      }

      const changed =
        action === 'add'
          ? repo.addWord(guildId, parsed.data)
          : repo.removeWord(guildId, parsed.data);
      if (action === 'add' && !repo.getSettings(guildId).wordsEnabled)
        repo.setSettings(guildId, { wordsEnabled: true });
      await refreshNative();
      await interaction.reply({
        embeds: [
          changed
            ? successEmbed(
                'Lista actualizada',
                `La frase \`${parsed.data}\` se ha ${action === 'add' ? 'añadido' : 'eliminado'}.`,
              )
            : errorEmbed(
                action === 'add'
                  ? 'La frase ya estaba en la lista.'
                  : 'La frase no estaba en la lista.',
              ),
        ],
        ephemeral: true,
      });
      return;
    }

    if (subcommand === 'exemptions') {
      const action = interaction.options.getString('accion', true);
      const type = interaction.options.getString('tipo');
      const id = interaction.options.getString('id');

      if (action === 'list' || !type || !id || !/^\d{17,20}$/.test(id)) {
        const exemptions = repo.listExemptions(guildId);
        await interaction.reply({
          embeds: [
            createEmbed({
              title: '🙌 Exenciones de AutoMod',
              description: exemptions.length
                ? exemptions.map((entry) => `\`${entry.type}\` — <@${entry.targetId}>`).join('\n')
                : 'No hay exenciones. Los administradores y moderadores siempre están exentos.',
              footer: 'PAN BOT · AutoMod',
            }),
          ],
          ephemeral: true,
        });
        return;
      }

      const exemptionType = type as 'role' | 'channel' | 'user';
      const changed =
        action === 'add'
          ? repo.addExemption(guildId, exemptionType, id)
          : repo.removeExemption(guildId, exemptionType, id);
      await interaction.reply({
        embeds: [
          changed
            ? successEmbed(
                'Exención actualizada',
                `Se ha ${action === 'add' ? 'añadido' : 'eliminado'} la exención.`,
              )
            : errorEmbed('Esa exención no existía o ya estaba añadida.'),
        ],
        ephemeral: true,
      });
      return;
    }

    if (subcommand === 'logs') {
      const register = interaction.options.getBoolean('registrar');
      if (register !== null) repo.setSettings(guildId, { logIncidents: register });
      const incidents = repo.listIncidents(guildId, 10);
      await interaction.reply({
        embeds: [
          createEmbed({
            title: '📋 Incidencias de AutoMod',
            description: incidents.length
              ? incidents
                  .map(
                    (incident) =>
                      `\`#${incident.id}\` · <@${incident.userId}> · ${incident.rule} · ${incident.action}`,
                  )
                  .join('\n')
              : 'No hay incidencias registradas.',
            footer: 'PAN BOT · AutoMod',
          }),
        ],
        ephemeral: true,
      });
    }
  },
};

export default command;
