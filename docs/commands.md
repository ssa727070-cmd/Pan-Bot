# Referencia de comandos — PAN BOT

Todos los comandos son slash commands. Las respuestas y los errores están en español. Los comandos marcados con 🔒 requieren permisos de gestión y están restringidos por defecto a quienes tienen `Manage Guild`, `Manage Channels` o el permiso indicado.

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

## Notas sobre permisos

- El bot necesita permisos de **Gestionar canales** para tickets, `/slowmode`, `/lock` y `/unlock`.
- Necesita **Gestionar mensajes** para `/clear` y para eliminar canales de ticket al cerrarlos.
- Necesita **Ver canal** y **Enviar mensajes** en cada canal de registro configurado.
- Los intents privilegiados `Guild Members` y `Message Content` deben activarse en el Developer Portal. Consulta el [README](../README.md#intents-de-la-pasarela-gateway).
