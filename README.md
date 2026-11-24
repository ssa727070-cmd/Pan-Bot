# PAN BOT

**Versión actual: 1.1.6** — [notas de publicación](docs/releases/v1.1.6.md).

Un bot de Discord profesional y listo para producción, creado con **TypeScript**, **discord.js v14**, **SQLite** y **comandos de barra diagonal (slash commands)**. No depende de Docker ni de servicios externos.

## Características

- **Moderación:** 11 comandos (`ban`, `unban`, `kick`, `timeout`, `untimeout`, `warn`, `warnings`, `clear`, `slowmode`, `lock`, `unlock`) con validación de permisos y jerarquía de roles.
- **Advertencias persistentes** en SQLite con consulta por miembro.
- **Bienvenidas y despedidas** con canales configurables, mensajes personalizados, placeholders y embeds con color propio.
- **Sistema de tickets** con panel interactivo, canales privados, reclamación, cierre, transcripción y gestión de participantes.
- **Registros (logs) configurables** de entradas/salidas, mensajes editados/borrados, canales, roles, baneos, moderación y tickets.
- **Roles automáticos (v1.1.0):** roles de entrada múltiples y paneles persistentes de autoselección con límites y botones.
- **Estadísticas (v1.1.0):** miembros/humanos/bots en vivo, entradas, salidas, mensajes y canales contador con throttling, sin contenido de mensajes.
- **Sugerencias (v1.1.0):** modal, votos 👍/👎 cambiables, estados y respuestas del staff.
- **AutoMod avanzado (v1.1.0):** spam, menciones, invitaciones, enlaces, palabras y caracteres repetidos con exenciones, acciones y reglas nativas opcionales de Discord.
- **Administración de Minecraft (v1.1.5):** estado/jugadores del servidor `pansmp.mcserv.world`, acciones admin por RCON con validación estricta y destino fijado en el entorno (v1.1.6), allowlist de consola, permisos por rol de Discord, paneles persistentes, notificaciones, mantenimiento y auditoría en SQLite. Sin economía, rankings, recompensas ni eventos.
- Configuración por servidor persistida en SQLite con migraciones versionadas y transaccionales.
- Configuración de entorno tipada (falla rápido si faltan valores), logging estructurado con pino y apagado graceful.
- Descubrimiento automático de comandos y eventos, cooldowns por comando y manejo centralizado de errores.
- CI de GitHub Actions, healthcheck y pruebas unitarias.

## Requisitos

- **Node.js 22 LTS** (ver `.nvmrc`) y npm 10+.
- Una aplicación de bot de Discord con token y Application ID, con los scopes `applications.commands` y `bot`.
- Almacenamiento persistente para el archivo SQLite (en Wispbyte, usa una ruta dentro del volumen persistente del contenedor).

### Intents de la pasarela (Gateway)

El bot solicita estos intents; **los dos marcados como privilegiados** deben activarse en _Discord Developer Portal → Bot → Privileged Gateway Intents_:

| Intent                | Privilegiado | Uso                                                                   |
| --------------------- | ------------ | --------------------------------------------------------------------- |
| `Guilds`              | No           | Comandos, roles, canales y miembros                                   |
| `Guild Messages`      | No           | Registro de mensajes editados/borrados y limpieza                     |
| **`Guild Members`**   | **Sí**       | Jerarquía de roles en moderación y eventos de miembros                |
| **`Message Content`** | **Sí**       | Leer el contenido de mensajes para la transcripción de tickets y logs |

Los permisos de invitación que necesita el bot son `Manage Roles`, `Manage Channels`, `Manage Guild`, `Manage Messages`, `Moderate Members`, `Ban Members`, `Kick Members`, `View Channel`, `Send Messages`, `Read Message History`, `Embed Links`, `Attach Files` y `Use Application Commands`. El bitfield recomendado es **`1101927672886`**, que corresponde exactamente a esa lista. Ojo: el valor `1078062142` publicado en v1.1.0–v1.1.5 era incorrecto, porque incluía **Administrator** y no incluía _Manage Roles_, _Moderate Members_ ni _Use Application Commands_; si invitaste el bot con él, quítale el permiso de administrador y concede los que faltan. Consulta [docs/deployment.md](docs/deployment.md#3-invitar-el-bot-al-servidor).

## Inicio rápido

```bash
npm ci
cp .env.example .env           # rellena token y Application ID; nunca subas .env
npm run build
npm start
```

Para desarrollo con recarga automática: `npm run dev`.

Los comandos slash se registran una sola vez con `npm run commands:deploy`. Antes puedes validar el payload sin llamar a Discord con `npm run commands:preview`.

## Variables de entorno

| Variable                      | Requerida | Valor por defecto     | Uso                                                       |
| ----------------------------- | --------- | --------------------- | --------------------------------------------------------- |
| `DISCORD_TOKEN`               | sí        | —                     | Token del bot del Developer Portal                        |
| `DISCORD_CLIENT_ID`           | sí        | —                     | Application ID                                            |
| `DISCORD_GUILD_ID`            | no        | —                     | Registrar comandos solo en un servidor durante desarrollo |
| `NODE_ENV`                    | no        | `development`         | `development`, `production` o `test`                      |
| `LOG_LEVEL`                   | no        | `info`                | Nivel de pino                                             |
| `DATABASE_PATH`               | no        | `data/panbot.sqlite`  | Ruta del archivo SQLite                                   |
| `EMBED_COLOR`                 | no        | `5865F2`              | Color de marca (6 dígitos hexadecimales, sin `#`)         |
| `MINECRAFT_HOST`              | no        | `pansmp.mcserv.world` | Host del servidor Minecraft                               |
| `MINECRAFT_PORT`              | no        | `25565`               | Puerto Java/status del servidor                           |
| `MINECRAFT_RCON_PORT`         | no        | `25575`               | Puerto RCON (configurable por separado)                   |
| `MINECRAFT_RCON_PASSWORD`     | no        | vacío                 | Contraseña RCON; vacío = RCON desactivado                 |
| `MINECRAFT_RCON_TIMEOUT_MS`   | no        | `5000`                | Timeout de comandos RCON                                  |
| `MINECRAFT_RCON_RETRIES`      | no        | `1`                   | Reintentos RCON seguros                                   |
| `MINECRAFT_STATUS_TIMEOUT_MS` | no        | `5000`                | Timeout del ping/status                                   |

## Scripts

| Script                                    | Descripción                                                                     |
| ----------------------------------------- | ------------------------------------------------------------------------------- |
| `npm run dev`                             | Ejecutar con `tsx watch` (recarga automática)                                   |
| `npm run clean`                           | Borrar `dist/` para evitar artefactos obsoletos                                 |
| `npm run build`                           | Limpiar `dist/` y compilar TypeScript                                           |
| `npm start`                               | Ejecutar el bot compilado (`node dist/index.js`)                                |
| `npm run typecheck`                       | Comprobar tipos sin emitir archivos                                             |
| `npm run lint` / `npm run lint:fix`       | Comprobaciones de ESLint                                                        |
| `npm run format` / `npm run format:check` | Formato con Prettier                                                            |
| `npm test`                                | Ejecutar pruebas unitarias                                                      |
| `npm run healthcheck`                     | Verificar configuración, migraciones, comandos y eventos sin conectar a Discord |
| `npm run commands:preview`                | Validar y guardar los 26 comandos en `data/commands.json` sin llamar a Discord  |
| `npm run commands:deploy`                 | Registrar comandos slash en Discord                                             |
| `npm run db:migrate`                      | Comprobar/aplicar migraciones pendientes de SQLite                              |

## Estructura del proyecto

```text
PanBot/
├── src/
│   ├── index.ts                 # Arranque, login y apagado graceful
│   ├── config/env.ts            # Entorno validado con Zod
│   ├── core/                    # Cliente Discord y logger
│   ├── commands/
│   │   ├── general/             # ping, help, about
│   │   ├── configuration/       # settings
│   │   ├── moderation/          # ban, kick, timeout, warn, clear, ...
│   │   ├── welcome/             # welcome, goodbye
│   │   ├── tickets/             # ticket
│   │   ├── logging/             # logs
│   │   ├── autoroles/           # autorole
│   │   ├── statistics/          # stats
│   │   ├── suggestions/         # suggest y suggestions
│   │   ├── automod/             # automod
│   │   └── minecraft/           # mc y mcadmin
│   ├── events/                  # interacciones, miembros, mensajes, canales, roles, baneos
│   ├── features/                # bienvenidas y plantillas de mensajes
│   ├── autoroles/               # servicio de roles y paneles persistentes
│   ├── statistics/              # snapshot, throttling y embeds
│   ├── suggestions/             # modal, votos y embeds
│   ├── automod/                 # detección, acciones y reglas nativas
│   ├── minecraft/               # RCON, status, permisos, allowlist, monitor y paneles
│   ├── handlers/                # cargadores automáticos de comandos y eventos
│   ├── logging/                 # eventos configurables y servicio de registros
│   ├── moderation/              # validación de permisos y formato
│   ├── tickets/                 # panel, servicio, transcripción y formato
│   ├── database/                # conexión, migraciones y repositorios
│   ├── scripts/                 # despliegue de comandos, migraciones y healthcheck
│   ├── types/                   # contratos compartidos
│   └── utils/                   # embeds, formato, canales, errores (+ pruebas)
├── docs/commands.md             # Referencia completa de comandos
├── docs/features/               # Guías de autoroles, estadísticas, sugerencias, AutoMod y Minecraft
├── docs/releases/v1.1.6.md      # Notas de la versión actual
├── docs/deployment.md           # Despliegue en Wispbyte
├── .github/workflows/ci.yml     # Verificación en CI
└── data/                        # Ignorado: archivos SQLite
```

## Configuración inicial recomendada

```text
/settings modlog canal:#moderacion
/logs setup canal:#logs
/welcome setup canal:#bienvenidas mensaje:"¡Bienvenido {user} a {server}! Somos {memberCount}."
/goodbye setup canal:#despedidas
/ticket setup soporte:@Soporte categoria:CategoríaTickets panel:#tickets
/ticket panel canal:#tickets
/autorole setup bots:false
/autorole add rol:@Miembro
/autorole panel-create canal:#roles titulo:"Elige tus roles" limite:2
/stats setup canal:"Contador" metrica:members
/suggestions setup canal:#sugerencias staff:@Staff
/automod setup nativo:false eliminar:true advertir:true silenciar:0 registrar:true
/automod spam ventana:10 max_mensajes:6 identicos:true
/mcadmin setup enabled:true notificaciones:#minecraft auditoria:#mc-audit
/mcadmin roles nivel:admin accion:add rol:@AdminsMinecraft
/mcadmin panel canal:#minecraft tipo:overview
```

Consulta [docs/commands.md](docs/commands.md) para la referencia completa de comandos, opciones y placeholders. Para el despliegue en Wispbyte, sigue [docs/deployment.md](docs/deployment.md).

## Base de datos

Las migraciones son aditivas y se ejecutan una sola vez en orden:

1. `001_initial_schema` — configuración de servidor y estadísticas de comandos.
2. `002_moderation_welcome_tickets_logging` — advertencias, tickets, participantes, ajustes de bienvenidas y configuración de registros.
3. `003_autoroles_statistics_suggestions_automod` — autoroles, paneles, estadísticas, sugerencias y AutoMod (v1.1.0).
4. `004_minecraft_administration` — configuración Minecraft, roles por nivel, allowlist de consola, paneles, auditoría, estado de notificaciones y mantenimiento (v1.1.5).

Se aplican automáticamente al abrir la base de datos. `npm run db:migrate` es un equivalente explícito. Las columnas/tablas musicales heredadas se ignoran y no se eliminan para preservar los datos existentes.

## Seguridad

- `.env`, `data/`, `dist/` y los archivos de claves están excluidos en `.gitignore`.
- Las claves privadas SSH y los tokens de Discord nunca se suben ni se muestran.
- CI ejecuta solo verificaciones de lectura; publicar es un paso manual autorizado explícitamente.

## Licencia

MIT — consulta [LICENSE](LICENSE).
