import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../types/command.js';
import { translateMcInvocation } from '../../minecraft/options.js';
import { executeMinecraftAction, respondWithResult } from '../../minecraft/service.js';
import { errorEmbed } from '../../utils/embeds.js';

const command: Command = {
  category: 'minecraft',
  data: new SlashCommandBuilder()
    .setName('mc')
    .setDescription('Administra el servidor de Minecraft configurado.')
    .addSubcommand((sub) =>
      sub.setName('status').setDescription('Muestra estado, versión, jugadores y latencia.'),
    )
    .addSubcommand((sub) => sub.setName('list').setDescription('Muestra los jugadores conectados.'))
    .addSubcommand((sub) => sub.setName('info').setDescription('Muestra información del servidor.'))
    .addSubcommand((sub) =>
      sub.setName('version').setDescription('Muestra versión y software detectado.'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('kick')
        .setDescription('Expulsa a un jugador.')
        .addStringOption((o) =>
          o.setName('jugador').setDescription('Nombre del jugador').setRequired(true),
        )
        .addStringOption((o) => o.setName('razon').setDescription('Razón').setRequired(false)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('ban')
        .setDescription('Banea a un jugador (requiere confirmación).')
        .addStringOption((o) =>
          o.setName('jugador').setDescription('Jugador o UUID').setRequired(true),
        )
        .addStringOption((o) => o.setName('razon').setDescription('Razón').setRequired(false)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('unban')
        .setDescription('Quita el ban a un jugador.')
        .addStringOption((o) =>
          o.setName('jugador').setDescription('Jugador o UUID').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('say')
        .setDescription('Envía un mensaje al chat del servidor de Minecraft.')
        .addStringOption((o) =>
          o
            .setName('mensaje')
            .setDescription('Mensaje a enviar')
            .setMaxLength(200)
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('whitelist')
        .setDescription('Gestiona la whitelist.')
        .addStringOption((o) =>
          o
            .setName('accion')
            .setDescription('Acción')
            .setRequired(true)
            .addChoices(
              { name: 'add', value: 'add' },
              { name: 'remove', value: 'remove' },
              { name: 'list', value: 'list' },
            ),
        )
        .addStringOption((o) =>
          o.setName('jugador').setDescription('Jugador (add/remove)').setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('op')
        .setDescription('Da OP a un jugador.')
        .addStringOption((o) => o.setName('jugador').setDescription('Jugador').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('deop')
        .setDescription('Quita OP a un jugador.')
        .addStringOption((o) => o.setName('jugador').setDescription('Jugador').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('mute')
        .setDescription('Silencia a un jugador (requiere plugin compatible).')
        .addStringOption((o) => o.setName('jugador').setDescription('Jugador').setRequired(true))
        .addStringOption((o) =>
          o.setName('duracion').setDescription('Ej: 30m, 1h, 7d').setRequired(false),
        )
        .addStringOption((o) => o.setName('razon').setDescription('Razón').setRequired(false)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('unmute')
        .setDescription('Quita el silencio a un jugador (requiere plugin compatible).')
        .addStringOption((o) => o.setName('jugador').setDescription('Jugador').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('time')
        .setDescription('Cambia o consulta el tiempo.')
        .addStringOption((o) =>
          o
            .setName('accion')
            .setDescription('Acción')
            .setRequired(true)
            .addChoices(
              { name: 'set', value: 'set' },
              { name: 'add', value: 'add' },
              { name: 'query', value: 'query' },
            ),
        )
        .addStringOption((o) =>
          o
            .setName('valor')
            .setDescription('day/night/noon/midnight/sunrise/sunset o ticks')
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('weather')
        .setDescription('Cambia el clima.')
        .addStringOption((o) =>
          o
            .setName('modo')
            .setDescription('Clima')
            .setRequired(true)
            .addChoices(
              { name: 'clear', value: 'clear' },
              { name: 'rain', value: 'rain' },
              { name: 'thunder', value: 'thunder' },
            ),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('difficulty')
        .setDescription('Cambia la dificultad.')
        .addStringOption((o) =>
          o
            .setName('modo')
            .setDescription('Dificultad')
            .setRequired(true)
            .addChoices(
              { name: 'peaceful', value: 'peaceful' },
              { name: 'easy', value: 'easy' },
              { name: 'normal', value: 'normal' },
              { name: 'hard', value: 'hard' },
            ),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('gamemode')
        .setDescription('Cambia el modo de juego de un jugador.')
        .addStringOption((o) =>
          o
            .setName('modo')
            .setDescription('Modo')
            .setRequired(true)
            .addChoices(
              { name: 'survival', value: 'survival' },
              { name: 'creative', value: 'creative' },
              { name: 'adventure', value: 'adventure' },
              { name: 'spectator', value: 'spectator' },
            ),
        )
        .addStringOption((o) => o.setName('jugador').setDescription('Jugador').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('teleport')
        .setDescription('Teletransporta a un jugador.')
        .addStringOption((o) => o.setName('jugador').setDescription('Jugador').setRequired(true))
        .addStringOption((o) =>
          o.setName('destino').setDescription('Otro jugador o coordenadas x y z').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('heal')
        .setDescription('Cura a un jugador (EssentialsX).')
        .addStringOption((o) => o.setName('jugador').setDescription('Jugador').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('feed')
        .setDescription('Alimenta a un jugador (EssentialsX).')
        .addStringOption((o) => o.setName('jugador').setDescription('Jugador').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('xp')
        .setDescription('Da XP a un jugador.')
        .addStringOption((o) => o.setName('jugador').setDescription('Jugador').setRequired(true))
        .addIntegerOption((o) =>
          o.setName('cantidad').setDescription('Cantidad').setMinValue(1).setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName('tipo')
            .setDescription('points o levels')
            .addChoices({ name: 'points', value: 'points' }, { name: 'levels', value: 'levels' })
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) => sub.setName('save').setDescription('Guarda el mundo (save-all).'))
    .addSubcommand((sub) =>
      sub
        .setName('gamerules')
        .setDescription('Consulta o cambia una gamerule.')
        .addStringOption((o) =>
          o.setName('regla').setDescription('Nombre de la gamerule').setRequired(true),
        )
        .addStringOption((o) =>
          o.setName('valor').setDescription('true/false/número (opcional)').setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('message')
        .setDescription('Envía say, broadcast o announce al servidor.')
        .addStringOption((o) =>
          o
            .setName('tipo')
            .setDescription('Tipo de mensaje')
            .setRequired(true)
            .addChoices(
              { name: 'say', value: 'say' },
              { name: 'broadcast (plugin)', value: 'broadcast' },
              { name: 'announce', value: 'announce' },
            ),
        )
        .addStringOption((o) => o.setName('mensaje').setDescription('Mensaje').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('command')
        .setDescription('Ejecuta un comando de consola permitido (allowlist).')
        .addStringOption((o) =>
          o
            .setName('comando')
            .setDescription('Comando sin /, sujeto a allowlist')
            .setRequired(true),
        ),
    ),

  async execute(interaction, client) {
    // Acknowledge first: status pings and RCON can exceed Discord's 3 s window.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    let invocation;
    try {
      invocation = translateMcInvocation(interaction.options.getSubcommand(), interaction.options);
    } catch (error) {
      await interaction.editReply({
        embeds: [errorEmbed(error instanceof Error ? error.message : 'Opciones inválidas.')],
      });
      return;
    }

    const result = await executeMinecraftAction(client, interaction, invocation.action, {
      ...invocation.options,
      ephemeral: true,
    });
    await respondWithResult(interaction, result);
  },
};

export default command;
