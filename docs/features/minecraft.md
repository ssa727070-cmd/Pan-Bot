# Administración de Minecraft — PAN BOT v1.2.0

Esta integración permite administrar **pansmp.mcserv.world** desde Discord sin exponer credenciales, sin usar economía y sin asumir que RCON o plugins estén instalados.

## Seguridad y alcance

- **Destino fijo:** host, puerto de estado, puerto RCON y contraseña se configuran **solo** en el entorno del bot. Ningún usuario de Discord puede cambiar a dónde se conecta el bot ni a dónde se envía la contraseña RCON (v1.1.6 eliminó las opciones `host`, `query_port` y `rcon_port` de `/mcadmin setup`; los valores antiguos guardados en la base de datos se ignoran).
- **Servidores de Discord autorizados:** RCON solo está disponible en los servidores de Discord listados en `MINECRAFT_GUILD_IDS`. Si la lista está vacía, RCON queda desactivado en todos y solo funciona el ping público de estado.
- **No economía:** no hay balances, tiendas, rankings, recompensas, eventos ni competencias.
- **RCON opt-in:** si `MINECRAFT_RCON_PASSWORD` está vacío, los comandos de administración RCON quedan desactivados; `status/list/info/version` siguen usando el ping público.
- **Consola segura:** `/mc command` solo acepta comandos de la allowlist. Hay comandos bloqueados en **todos** los modos (por defecto, allowlist personalizada e irrestricto):
  - se normalizan los namespaces (`minecraft:stop` se trata como `stop`, igual que `bukkit:reload`);
  - se bloquean detener/reiniciar/recargar (`stop`, `restart`, `reload`, `rl`, `end`…), persistencia (`save-all`, `save-off`, `save-on`), whitelist, bans, op/deop y gestores de permisos (`lp`, `luckperms`, `pex`…);
  - `execute … run <comando>` se analiza de forma recursiva, y `sudo`, `function`, `schedule` y otros comandos que ejecutan comandos se bloquean;
  - se bloquean subcomandos como `essentials reload` o `plugman unload`.
- **Patrones de la allowlist:** `/mcadmin allowlist patron:` acepta un subconjunto seguro de regex (clases, grupos, alternativas, `\d \w \s`) con un máximo de 2 cuantificadores y sin grupos cuantificados, para que un patrón nunca pueda bloquear el bot (ReDoS).
- **Validación estricta:** nombres de jugador, motivos, mensajes, gamerules, coordenadas y duración se validan antes de construir comandos.
- **Confirmación:** `ban`, el mantenimiento y los comandos de consola que modifican algo piden confirmación. Al pulsar Confirmar se vuelven a comprobar permisos, autorización y allowlist. Nadie más puede usar ni anular la confirmación de otro moderador.
- **Auditoría:** toda acción, incluidas las confirmadas, guarda admin, acción, objetivo, comando (con secretos ocultos), resultado y error en SQLite y en el canal de auditoría si está configurado.
- **Mantenimiento:** puede anunciar y opcionalmente activar la whitelist; no reinicia ni detiene el servidor.

## Configuración segura

Variables en `.env` (placeholders en `.env.example`):

```env
MINECRAFT_HOST=pansmp.mcserv.world
MINECRAFT_PORT=25565
MINECRAFT_RCON_PORT=25575
MINECRAFT_RCON_PASSWORD=
MINECRAFT_RCON_TIMEOUT_MS=5000
MINECRAFT_RCON_RETRIES=1
MINECRAFT_STATUS_TIMEOUT_MS=5000
# Servidores de Discord con acceso a RCON (IDs separados por comas).
MINECRAFT_GUILD_IDS=
# Comprobaciones fallidas seguidas antes de avisar "Servidor offline".
MINECRAFT_OFFLINE_FAILURES=3
# Operadores del bot (IDs de usuario) con nivel owner para la consola irrestricta.
BOT_OWNER_IDS=
```

Pasos recomendados:

1. Usa una contraseña RCON larga y única. Nunca la escribas en Discord ni la subas al repositorio.
2. Pon en `MINECRAFT_GUILD_IDS` solo el ID de tu servidor de Discord. Sin esa entrada RCON no funciona.
3. Si tu hosting lo permite, limita el puerto RCON a la IP del bot (firewall o lista de IPs permitidas) y no lo expongas a Internet.
4. Vuelve a registrar los comandos (`npm run commands:deploy`) para que desaparezcan las opciones antiguas de `/mcadmin setup`.
5. Configura roles de Minecraft: en cuanto exista uno, **solo** esos roles dan acceso.

En Discord:

```text
/mcadmin setup enabled:true notificaciones:#minecraft auditoria:#mc-audit
/mcadmin roles nivel:admin accion:add rol:@AdminsMinecraft
/mcadmin roles nivel:moderator accion:add rol:@ModsMinecraft
/mcadmin roles nivel:readonly accion:add rol:@Staff
/mcadmin panel canal:#minecraft tipo:overview
/mcadmin notifications canal:#minecraft join:true leave:true online:true offline:true intervalo:60
```

## Permisos

Niveles: `readonly`, `moderator`, `admin`, `owner`.

- `readonly`: status, list, info, version, estado del mantenimiento.
- `moderator`: kick, mute/unmute, whitelist, unban, time/weather/difficulty/gamemode/teleport/heal/feed/xp/save/gamerules, `/mc message tipo:say|broadcast|announce`.
- `admin`: ban, op/deop, consola, y **todos** los subcomandos de `/mcadmin` (setup, roles, allowlist, paneles, notificaciones, mantenimiento, auditoría), además de integraciones.
- `owner`: el dueño del servidor de Discord siempre tiene este nivel, para que el servidor no pueda quedarse sin acceso. Solo el dueño del servidor de Discord o un operador de `BOT_OWNER_IDS` puede activar la consola irrestricta o gestionar roles de nivel `owner`.

Resolución de niveles:

- **Con roles de Minecraft configurados**, la configuración es restrictiva: solo esos roles conceden acceso y los permisos de Discord (incluido Administrador) no dan acceso alternativo.
- **Sin roles configurados**, se usa la correspondencia con permisos de Discord: Administrador → `admin`, Gestionar servidor/Moderar miembros → `moderator`, Ver registro de auditoría → `readonly`.

## RCON y compatibilidad

- **Paper/Spigot/Bukkit/Purpur:** status y RCON vanilla compatibles cuando están habilitados.
- **Fabric/Forge/NeoForge:** status Java funciona; los comandos RCON dependen de la configuración del servidor.
- **Plugins opcionales:** EssentialsX (mute/heal/feed/broadcast), LuckPerms (mute/opciones según setup), PlaceholderAPI/Vault detectables como informativos; Vault no habilita economía.

## Paneles y notificaciones

Los paneles persistentes usan `customId` con prefijo `mc:` y validan permisos en cada interacción. Si un mensaje fue borrado, el panel puede reenviarse con `/mcadmin panel`.

Notificaciones (v1.1.6):

- **Lista de jugadores fiable:** si RCON está disponible se usa `list` (lista completa). El `sample` del ping público es parcial (vanilla muestra como máximo 12 jugadores y algunos plugins lo reemplazan con texto), por lo que solo se usa cuando contiene exactamente a todos los jugadores conectados. Si la lista no está completa, no se generan avisos de salida falsos.
- **Sesiones:** cada conexión tiene su propio identificador, así que una reconexión dentro de la misma hora genera un aviso nuevo y no hay duplicados. Tras reiniciar el bot, los jugadores que ya estaban conectados no se vuelven a anunciar.
- **Avisos agrupados:** si entran o salen varios jugadores en la misma comprobación, se envían en un único mensaje, sin perder ninguno.
- **Margen offline:** solo se avisa de "Servidor offline" tras `MINECRAFT_OFFLINE_FAILURES` comprobaciones fallidas seguidas, y se avisa en cada caída (no solo en la primera).

## Mantenimiento

`/mcadmin maintenance` pide confirmación por botón antes de aplicar cambios. Puede activar la whitelist durante el mantenimiento si RCON está disponible. No ejecuta stop/restart.

## Auditoría

Cada acción crea un registro en `minecraft_audit_log` con: guild, admin Discord, acción, jugador objetivo, comando (con secretos ocultos), resultado y error. Los secretos nunca se guardan. El logger también oculta campos `password`/`token`.

## Novedades v1.2.0

- `/mc list` (antes `players`), `/mc unban` (antes `pardon`) y `/mc say mensaje` (máx. 200 caracteres, sin saltos de línea ni caracteres de control).
- `/mc op` y `/mc deop` piden confirmación; solo quien la creó puede confirmarla y los permisos se revalidan al confirmar.
- `/mc` tiene exactamente 25 subcomandos (límite de Discord).
- Los helpers usan la acción `helper-grant` (nivel admin). Ver [helper](helper.md).
