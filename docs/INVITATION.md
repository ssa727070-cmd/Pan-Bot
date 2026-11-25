# Invitar a Pan Bot a otros servidores

Pan Bot se invita **sin `Administrator`**. El bitfield de permisos es **`1101927672886`**.

## Enlace de invitación (OAuth2)

Scopes: `bot` + `applications.commands`.

```text
https://discord.com/oauth2/authorize?client_id=1574503088126173214&permissions=1101927672886&scope=bot%20applications.commands
```

El `client_id` es el Application ID público de Pan Bot (no es un secreto). El token del bot nunca forma parte del enlace.

## Permisos incluidos

| Permiso                  | Para qué lo usa Pan Bot                                                                                                                                                                |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| View Channel             | Ver los canales donde opera, y el canal de cada ticket.                                                                                                                                |
| Send Messages            | Responder, enviar paneles, bienvenidas, logs, sugerencias, avisos de Minecraft y el primer mensaje de cada ticket.                                                                     |
| Read Message History     | Leer el historial para las transcripciones de tickets y para `/clear`.                                                                                                                 |
| Embed Links              | Casi todas las respuestas y paneles son embeds.                                                                                                                                        |
| Attach Files             | Adjuntar transcripciones de tickets y archivos de logs. También se concede al creador del ticket.                                                                                      |
| Manage Messages          | `/clear` (borrado masivo), borrar mensajes que infringen AutoMod y gestionar mensajes dentro de tickets.                                                                               |
| Manage Channels          | Crear y cerrar canales de tickets, `/lock`, `/unlock`, `/slowmode` y renombrar los canales de estadísticas.                                                                            |
| Manage Roles             | Autoroles, paneles de roles y editar permisos de canal (`/lock`, `/unlock`, tickets).                                                                                                  |
| Manage Server            | Crear y eliminar las reglas nativas de AutoMod de Discord (si el módulo está activado).                                                                                                |
| Moderate Members         | `/timeout`, `/untimeout` y el castigo automático de AutoMod.                                                                                                                           |
| Kick Members             | `/kick`.                                                                                                                                                                               |
| Ban Members              | `/ban` y `/unban`.                                                                                                                                                                     |
| Use Application Commands | Permite usar comandos slash en canales donde el rol del bot lo necesite. No es obligatorio para que el bot funcione, pero se mantiene por coherencia con la documentación y los tests. |

### Permisos que NO se piden (a propósito)

- **Administrator**: nunca. Si un enlace antiguo (`1078062142`) lo incluía, quita el permiso al rol del bot.
- **Manage Threads / Send Messages in Threads**: el código no crea ni gestiona hilos, así que no hacen falta. Si en el futuro se añaden, se documentarán aquí.
- **v1.2.0 (hilos y AutoMod):** no cambia el valor de permisos de la invitación. AutoMod analiza hilos públicos con _View Channel_ y _Read Message History_; en hilos privados solo ve los mensajes si el bot es miembro. Para borrar necesita _Manage Messages_ y para silenciar _Moderate Members_ (ya incluidos).
- **View Audit Log**: el bot no lo consulta. (Solo se usa como _criterio de rol_ de los usuarios en Minecraft.)
- **Manage Nicknames, Manage Webhooks, Create Invite, Add Reactions, Use External Emojis**: no se utilizan.

## Permisos adicionales opcionales (configuración manual)

| Permiso          | Valor decimal con él | Cuándo hace falta                                                                                                                                                           |
| ---------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mention Everyone | `1101927803958`      | Los tickets mencionan al rol de soporte (`@rol`). Si ese rol **no es mencionable**, la mención solo notifica con este permiso. Alternativa: marcar el rol como mencionable. |

No está en el enlace principal para mantener el mínimo privilegio.

## Cosas que se configuran manualmente

### En el Developer Portal (una vez, por el propietario del bot)

- **Privileged Gateway Intents** activados: **Server Members Intent** y **Message Content Intent** (el bot los solicita en `src/core/client.ts`; sin ellos no arranca). Cuando Pan Bot esté en **100 o más servidores**, Discord exige verificar el bot y aprobar estos intents.
- Bot público: activa _Public Bot_ en la pestaña **Bot** si quieres que cualquiera con el enlace pueda invitarlo.

### En cada servidor

- Mover el rol **Pan Bot** por **encima** de los roles que debe asignar o moderar (ver limitaciones).
- Si el servidor usa permisos por canal, dar al bot _View Channel_, _Send Messages_ y _Embed Links_ en los canales de logs, bienvenida, sugerencias y estadísticas.
- Crear o elegir el rol de soporte y (opcional) la categoría de tickets.

## Limitaciones de Discord

1. **Jerarquía de roles.** El bot solo puede asignar, quitar o moderar roles/miembros que estén **por debajo** de su rol más alto. No puede moderar al propietario del servidor ni a miembros con un rol igual o superior al suyo. Aplica a autoroles, `/kick`, `/ban`, `/timeout` y `/untimeout`.
2. **Un bot no puede conceder permisos que no tiene.** Al crear un ticket, solo puede dar a los usuarios permisos que él mismo tenga en ese canal; por eso necesita View Channel, Send Messages, Read Message History, Attach Files y Manage Messages.
3. **Timeout** no funciona sobre administradores (permiso `Administrator`) ni sobre el propietario.
4. **Overrides de canal.** Un `deny` explícito en un canal sobre el bot o su rol anula los permisos globales.
5. **Verificación y intents.** Pasados los 100 servidores se necesita verificación y aprobar _Server Members_ y _Message Content_.
6. **Comandos globales.** Tras desplegarlos pueden tardar hasta ~1 hora en aparecer en todos los servidores. Con `DISCORD_GUILD_ID` definido, solo se registran en ese servidor.
7. **Límite de borrado.** `/clear` solo borra mensajes de menos de 14 días.

## Cómo invitar a Pan Bot

1. Abre el enlace de invitación de arriba.
2. Elige el servidor. Necesitas el permiso **Manage Server** en él.
3. Revisa los permisos (no aparece _Administrator_) y pulsa **Autorizar**.
4. En **Ajustes del servidor → Roles**, arrastra el rol de Pan Bot por encima de los roles que deba gestionar.

## Configurar los módulos tras invitarlo

Todos los comandos de configuración requieren **Manage Server** por defecto y son independientes por servidor.

| Módulo            | Primer paso                                                                     |
| ----------------- | ------------------------------------------------------------------------------- |
| Ajustes generales | `/settings` — ajustes generales (modlog).                                       |
| Logs              | `/logs` — elegir canal y eventos.                                               |
| Tickets           | `/ticket` — categoría, rol de soporte y publicar el panel.                      |
| Moderación        | Funciona sin configuración (`/warn`, `/kick`, `/ban`, `/timeout`, `/clear`, …). |
| AutoMod           | `/automod` — activar reglas, palabras, exenciones y reglas nativas (opcional).  |
| Autoroles         | `/autorole` — roles automáticos al entrar y paneles de roles.                   |
| Estadísticas      | `/stats` — canales de estadísticas.                                             |
| Sugerencias       | `/suggestions` — canal de sugerencias; los miembros usan `/suggest`.            |
| Bienvenida        | `/welcome` y `/goodbye`.                                                        |
| Minecraft         | `/mcadmin setup` (ver nota). `/mc` muestra el estado.                           |

Consulta [commands.md](commands.md) y `docs/features/` para el detalle de cada comando.

> **Nota sobre Minecraft.** El host y los puertos los fija el operador del bot en variables de entorno, no los servidores de Discord; todos los servidores consultan el **mismo** servidor de Minecraft. La administración por RCON solo está disponible en servidores cuyo ID figure en `MINECRAFT_GUILD_IDS` (vacío = RCON desactivado; el estado público sigue funcionando).

## Compatibilidad multi-servidor (resultado de la auditoría)

| Comprobación                        | Resultado                                                                                                                                                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dependencia del servidor de pruebas | Ninguna. Los comandos se registran globalmente si `DISCORD_GUILD_ID` está vacío.                                                                                                                                    |
| IDs codificados                     | No hay IDs de servidores, canales ni roles reales en el código fuente; solo IDs ficticios en tests.                                                                                                                 |
| Datos por servidor                  | Todas las tablas de configuración y datos (ajustes, tickets, warnings, autoroles, estadísticas, sugerencias, AutoMod, logs, Minecraft) se indexan por `guild_id`.                                                   |
| Permisos por servidor               | Se comprueban con `interaction.memberPermissions` / `guild.members.me` y `setDefaultMemberPermissions`; los comandos solo se ejecutan dentro de un servidor.                                                        |
| Módulos opcionales                  | AutoMod, sugerencias, autoroles y Minecraft están desactivados por defecto (`enabled = 0`) y las estadísticas solo actúan sobre canales configurados. El arranque solo exige `DISCORD_TOKEN` y `DISCORD_CLIENT_ID`. |
| Minecraft                           | El monitor solo actúa en servidores con la integración activada. RCON requiere `MINECRAFT_GUILD_IDS`. El host de Minecraft es global (limitación de diseño).                                                        |

## Verificación del bitfield

`ManageRoles | ManageChannels | ManageGuild | ManageMessages | ModerateMembers | BanMembers | KickMembers | ViewChannel | SendMessages | ReadMessageHistory | EmbedLinks | AttachFiles | UseApplicationCommands` = **`1101927672886`**, sin `Administrator`. El test `src/config/deployment.test.ts` comprueba este valor contra el README y la documentación.
