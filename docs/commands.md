# Referencia de comandos — PAN BOT v1.1.5

26 comandos disponibles. Todos son slash commands. Las respuestas y los errores están en español. Los comandos marcados con 🔒 requieren permisos de gestión y están restringidos por defecto a quienes tienen `Manage Guild`, `Manage Channels` o el permiso indicado.

## General

| Comando  | Descripción                                                  | Opciones                   |
| -------- | ------------------------------------------------------------ | -------------------------- |
| `/help`  | Muestra todos los comandos o el detalle de uno.              | `comando` (autocompletado) |
| `/ping`  | Muestra la latencia del gateway y el tiempo de ida y vuelta. | —                          |
| `/about` | Muestra versión, entorno, tiempo activo y servidores.        | —                          |

## Configuración (🔒 `Manage Guild`)

| Comando            | Descripción                                       | Opciones             |
| ------------------ | ------------------------------------------------- | -------------------- |
| `/settings view`   | Muestra la configuración actual del servidor.     | —                    |
| `/settings modlog` | Establece o quita el canal de logs de moderación. | `channel` (opcional) |

## Moderación

Todos los comandos comprueban que el moderador y el bot tengan el permiso necesario, que el objetivo no sea el dueño del servidor ni un miembro con rol igual o superior, y registran la acción en el canal de moderación (o en el evento `moderation` de `/logs`).

| Comando      | Permiso            | Descripción                                             | Opciones                                      |
| ------------ | ------------------ | ------------------------------------------------------- | --------------------------------------------- |
| `/ban`       | `Ban Members`      | Banea a un miembro.                                     | `usuario`, `razon` (opc.), `dias` (0–7, opc.) |
| `/unban`     | `Ban Members`      | Desbanea por ID de usuario.                             | `usuario_id`, `razon` (opc.)                  |
| `/kick`      | `Kick Members`     | Expulsa a un miembro.                                   | `usuario`, `razon` (opc.)                     |
| `/timeout`   | `Moderate Members` | Silencia a un miembro (1–40320 min).                    | `usuario`, `minutos`, `razon` (opc.)          |
| `/untimeout` | `Moderate Members` | Quita el silencio.                                      | `usuario`, `razon` (opc.)                     |
| `/warn`      | `Moderate Members` | Registra una advertencia persistente.                   | `usuario`, `razon`                            |
| `/warnings`  | `Moderate Members` | Consulta las advertencias activas.                      | `usuario`                                     |
| `/clear`     | `Manage Messages`  | Borra 1–100 mensajes recientes (omite los de >14 días). | `cantidad`                                    |
| `/slowmode`  | `Manage Channels`  | Configura el modo lento del canal (0–21600 s).          | `segundos`                                    |
| `/lock`      | `Manage Channels`  | Bloquea el envío de mensajes en el canal.               | —                                             |
| `/unlock`    | `Manage Channels`  | Desbloquea el canal.                                    | —                                             |

Las advertencias se almacenan en la tabla `warnings` y permanecen hasta que se desactivan manualmente.

## Bienvenidas (🔒 `Manage Guild`)

| Comando            | Descripción                                                 | Opciones                  |
| ------------------ | ----------------------------------------------------------- | ------------------------- |
| `/welcome setup`   | Define el canal y, opcionalmente, el mensaje de bienvenida. | `canal`, `mensaje` (opc.) |
| `/welcome mensaje` | Cambia el mensaje de bienvenida.                            | `mensaje`                 |
| `/welcome color`   | Cambia el color de los embeds (6 dígitos hex).              | `color`                   |
| `/welcome test`    | Envía una vista previa del embed (solo tú la ves).          | —                         |
| `/welcome disable` | Desactiva las bienvenidas.                                  | —                         |
| `/goodbye setup`   | Define el canal y, opcionalmente, el mensaje de despedida.  | `canal`, `mensaje` (opc.) |
| `/goodbye mensaje` | Cambia el mensaje de despedida.                             | `mensaje`                 |
| `/goodbye test`    | Envía una vista previa del embed.                           | —                         |
| `/goodbye disable` | Desactiva las despedidas.                                   | —                         |

### Placeholders

| Placeholder                 | Sustitución                  |
| --------------------------- | ---------------------------- |
| `{user}` / `{mention}`      | Mención al usuario           |
| `{username}`                | Nombre de usuario de Discord |
| `{server}` / `{guild}`      | Nombre del servidor          |
| `{memberCount}` / `{count}` | Número total de miembros     |

Ejemplo: `¡Bienvenido {user} a {server}! Ya somos {memberCount} miembros.`

## Tickets (🔒 `Manage Guild`)

| Comando          | Descripción                                                     | Opciones                                      |
| ---------------- | --------------------------------------------------------------- | --------------------------------------------- |
| `/ticket setup`  | Configura el rol de soporte, la categoría y el canal del panel. | `soporte`, `categoria` (opc.), `panel` (opc.) |
| `/ticket panel`  | Publica el panel con el botón «Crear ticket».                   | `canal` (opc.; por defecto, el actual)        |
| `/ticket add`    | Añade un usuario al ticket actual.                              | `usuario`                                     |
| `/ticket remove` | Elimina un usuario del ticket actual (no al creador).           | `usuario`                                     |

### Flujo

1. El usuario pulsa **Crear ticket** en el panel y rellena el formulario con el motivo.
2. Se crea un canal privado `ticket-N-<usuario>` con permisos para el creador, el bot y el rol de soporte.
3. El equipo de soporte puede pulsar **Reclamar ticket**.
4. El creador o el soporte puede pulsar **Cerrar ticket**: se genera un transcripto, se envía al registro y se elimina el canal.
5. Solo se permite un ticket abierto por usuario a la vez.

## Registros / Logs (🔒 `Manage Guild`)

| Comando         | Descripción                               | Opciones                 |
| --------------- | ----------------------------------------- | ------------------------ |
| `/logs setup`   | Activa los 14 eventos en un canal.        | `canal`                  |
| `/logs set`     | Configura o desactiva un evento concreto. | `evento`, `canal` (opc.) |
| `/logs view`    | Muestra el estado de todos los eventos.   | —                        |
| `/logs disable` | Desactiva un evento.                      | `evento`                 |

### Eventos disponibles

`member_join`, `member_leave`, `message_edit`, `message_delete`, `channel_create`, `channel_delete`, `channel_update`, `role_create`, `role_delete`, `role_update`, `ban`, `unban`, `moderation`, `ticket`.

Las acciones de moderación usan preferentemente el canal configurado con `/settings modlog` y, si no existe, el evento `moderation`. Los transcriptos de tickets se envían al canal de moderación o al evento `ticket`.

## Roles automáticos (🔒 `Manage Guild`)

| Comando                  | Descripción                                                 | Opciones                                                                           |
| ------------------------ | ----------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `/autorole setup`        | Activa los roles de entrada.                                | `bots` (opc.; incluir bots, por defecto `false`)                                   |
| `/autorole add`          | Añade un rol de entrada (varios permitidos).                | `rol`                                                                              |
| `/autorole remove`       | Quita un rol de entrada.                                    | `rol`                                                                              |
| `/autorole list`         | Muestra estado, roles y paneles.                            | —                                                                                  |
| `/autorole disable`      | Desactiva los roles de entrada sin borrar la configuración. | —                                                                                  |
| `/autorole panel-create` | Publica un panel vacío y devuelve su ID.                    | `canal`, `titulo`, `descripcion` (opc.), `limite` (1–10, opc.)                     |
| `/autorole panel-edit`   | Añade/quita un rol del panel y refresca el mensaje.         | `panel`, `rol`, `accion` (`add`/`remove`), `etiqueta` (opc.), `descripcion` (opc.) |
| `/autorole panel-delete` | Elimina el panel y su mensaje.                              | `panel`                                                                            |

> Discord prohíbe mezclar subcomandos y grupos de subcomandos en el mismo nivel; por eso las acciones de panel son subcomandos planos `panel-*` y no `/autorole panel …`.

Consulta [docs/features/autoroles.md](features/autoroles.md).

## Estadísticas

| Comando           | Descripción                                                    | Opciones                                                              |
| ----------------- | -------------------------------------------------------------- | --------------------------------------------------------------------- |
| `/stats`          | Muestra datos en vivo e históricos.                            | —                                                                     |
| `/stats members`  | Miembros, humanos y bots en vivo.                              | —                                                                     |
| `/stats activity` | Entradas, salidas, mensajes y actividad de los últimos 7 días. | —                                                                     |
| `/stats setup`    | Configura un canal contador (🔒 `Manage Guild`).               | `canal`, `metrica` (`members`, `humans`, `bots`, `total`, `messages`) |
| `/stats channels` | Lista los contadores configurados.                             | —                                                                     |
| `/stats disable`  | Quita todos los contadores (🔒 `Manage Guild`).                | —                                                                     |

Consulta [docs/features/statistics.md](features/statistics.md).

## Sugerencias

| Comando                | Descripción                                                        | Opciones                                             |
| ---------------------- | ------------------------------------------------------------------ | ---------------------------------------------------- |
| `/suggest`             | Abre el modal para enviar una sugerencia (10–1000 caracteres).     | —                                                    |
| `/suggestions setup`   | Define canal y staff, y activa el sistema (🔒 `Manage Guild`).     | `canal`, `staff` (opc.)                              |
| `/suggestions config`  | Activa/desactiva o cambia etiquetas de estado (🔒 `Manage Guild`). | `activar` (opc.), `estado` (opc.), `etiqueta` (opc.) |
| `/suggestions view`    | Muestra una sugerencia y sus votos.                                | `id`                                                 |
| `/suggestions status`  | Cambia el estado y añade una respuesta (staff).                    | `id`, `estado`, `respuesta` (opc.)                   |
| `/suggestions disable` | Desactiva `/suggest` (🔒 `Manage Guild`).                          | —                                                    |

Estados: `pending` (reabrir), `approved`, `rejected`, `implemented`. Consulta [docs/features/suggestions.md](features/suggestions.md).

## AutoMod (🔒 `Manage Guild`)

| Comando               | Descripción                                           | Opciones                                                                                |
| --------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `/automod setup`      | Activa AutoMod y configura acciones y reglas nativas. | `nativo`, `eliminar`, `advertir`, `repetidos`, `silenciar` (0–1440), `registrar` (opc.) |
| `/automod status`     | Muestra filtros, acciones y exenciones.               | —                                                                                       |
| `/automod enable`     | Activa los filtros conservando la configuración.      | —                                                                                       |
| `/automod disable`    | Desactiva los filtros conservando la configuración.   | —                                                                                       |
| `/automod spam`       | Umbrales de frecuencia, idénticos y menciones.        | `activo`, `ventana`, `max_mensajes`, `max_menciones`, `identicos` (opc.)                |
| `/automod words`      | Gestiona palabras/frases literales bloqueadas.        | `accion` (`add`/`remove`/`list`), `palabra` (opc.)                                      |
| `/automod links`      | Activa/desactiva el filtro de enlaces.                | `activo`                                                                                |
| `/automod invites`    | Activa/desactiva el filtro de invitaciones.           | `activo`                                                                                |
| `/automod mentions`   | Configura menciones masivas.                          | `activo`, `maximo` (opc.)                                                               |
| `/automod exemptions` | Gestiona roles/canales/usuarios exentos.              | `accion` (`add`/`remove`/`list`), `tipo`, `id` (opc.)                                   |
| `/automod logs`       | Muestra incidencias o configura su registro.          | `registrar` (opc.)                                                                      |

Consulta [docs/features/automod.md](features/automod.md).

## Minecraft (v1.1.5)

### `/mc`

| Subcomando                        | Nivel mínimo | Descripción                                                          | Dependencias                                             |
| --------------------------------- | ------------ | -------------------------------------------------------------------- | -------------------------------------------------------- |
| `status`                          | readonly     | Estado online/offline, host, versión, software, jugadores y latencia | Ping público; RCON no requerido                          |
| `players`                         | readonly     | Conteo y nombres visibles                                            | Ping público                                             |
| `info` / `version`                | readonly     | Información y versión/software detectado                             | Ping público                                             |
| `kick`                            | moderator    | Expulsa a un jugador                                                 | RCON                                                     |
| `ban`                             | admin        | Banea a un jugador                                                   | RCON                                                     |
| `pardon`                          | moderator    | Quita ban                                                            | RCON                                                     |
| `whitelist (add/remove/list)`     | moderator    | Gestiona whitelist                                                   | RCON                                                     |
| `op` / `deop`                     | admin        | Gestiona operadores                                                  | RCON                                                     |
| `mute` / `unmute`                 | moderator    | Silencia/desilencia                                                  | Plugin (EssentialsX/LuckPerms)                           |
| `time` / `weather` / `difficulty` | moderator    | Cambios de mundo                                                     | RCON                                                     |
| `gamemode` / `teleport` / `xp`    | moderator    | Gestión de jugadores                                                 | RCON                                                     |
| `heal` / `feed`                   | moderator    | Curar/alimentar                                                      | EssentialsX                                              |
| `save`                            | moderator    | Guarda el mundo (`save-all`)                                         | RCON                                                     |
| `gamerules`                       | moderator    | Consulta/cambia gamerule                                             | RCON                                                     |
| `message`                         | moderator    | `say`, `broadcast` o `announce` al servidor                          | RCON; `broadcast` puede requerir plugin                  |
| `command`                         | admin        | Ejecuta comando de consola permitido                                 | RCON + allowlist; confirmación si es mutante/irrestricto |

### `/mcadmin` (🔒 `Manage Guild`)

| Subcomando      | Descripción                                                          |
| --------------- | -------------------------------------------------------------------- |
| `setup`         | Activa integración, host/puertos, canales de notificación/auditoría  |
| `roles`         | Asigna roles Discord a niveles `owner/admin/moderator/readonly`      |
| `allowlist`     | Añade/quita/lista comandos de consola permitidos con patrón seguro   |
| `panel`         | Publica panel persistente (overview/status/players/maintenance)      |
| `notifications` | Configura canal, eventos y intervalo                                 |
| `maintenance`   | Activa/desactiva mantenimiento con confirmación y whitelist opcional |
| `console-mode`  | Activa modo consola irrestricto solo para dueño del servidor Discord |
| `audit`         | Muestra auditoría reciente                                           |

Consulta [docs/features/minecraft.md](features/minecraft.md).

## Notas sobre permisos

- El bot necesita permisos de **Gestionar canales** para tickets, contadores, `/slowmode`, `/lock` y `/unlock`.
- Necesita **Gestionar mensajes** para `/clear`, eliminar mensajes de AutoMod y canales de ticket al cerrarlos.
- Necesita **Gestionar roles** para autoroles y **Moderar miembros** para silencios de AutoMod.
- Necesita **Gestionar servidor** para reglas nativas de AutoMod; los comandos de configuración lo exigen a quien los ejecuta.
- Necesita **Ver canal** y **Enviar mensajes** en cada canal de registro, panel, sugerencias y contador configurado.
- Bitfield de invitación recomendado: `1078062142`.
- Los intents privilegiados `Guild Members` y `Message Content` deben activarse en el Developer Portal. Consulta el [README](../README.md#intents-de-la-pasarela-gateway).
- Minecraft: RCON es opcional; sin `MINECRAFT_RCON_PASSWORD` solo funcionan status/players/info/version. La consola irrestricta está desactivada por defecto, solo la puede activar el dueño del servidor y nunca permite `stop/restart/reload`.
