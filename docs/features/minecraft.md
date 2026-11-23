# Administración de Minecraft — PAN BOT v1.1.5

Esta integración permite administrar **pansmp.mcserv.world** desde Discord sin exponer credenciales, sin usar economía y sin asumir que RCON/plugins estén instalados.

## Seguridad y alcance

- **No economía:** no hay balances, tiendas, rankings, recompensas, eventos ni competencias.
- **RCON opt-in:** si `MINECRAFT_RCON_PASSWORD` está vacío, los comandos de administración RCON quedan desactivados; `status/players/info/version` siguen usando el ping público.
- **Consola segura:** `/mc command` y la consola del panel solo aceptan comandos en allowlist por defecto. El modo irrestricto está desactivado por defecto, solo lo activa el dueño del servidor Discord y nunca permite `stop`, `restart`, `reload`, `end`, `save-all` fuera del comando dedicado, ni cambios de whitelist/ban/op por consola cruda.
- **Validación estricta:** nombres de jugador, motivos, mensajes, gamerules, coordenadas y duración se validan antes de construir comandos.
- **Auditoría:** toda acción guarda admin, acción, objetivo, comando redacted-safe, resultado y error en SQLite.
- **Mantenimiento:** requiere confirmación antes de activar/desactivar; puede anunciar y opcionalmente activar whitelist; no reinicia ni detiene el servidor.

## Configuración

Variables en `.env` (placeholders en `.env.example`):

```env
MINECRAFT_HOST=pansmp.mcserv.world
MINECRAFT_PORT=25565
MINECRAFT_RCON_PORT=25575
MINECRAFT_RCON_PASSWORD=
MINECRAFT_RCON_TIMEOUT_MS=5000
MINECRAFT_RCON_RETRIES=1
MINECRAFT_STATUS_TIMEOUT_MS=5000
```

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

Niveles: `readonly`, `moderator`, `admin`, `owner` (dueño del servidor Discord).

- `readonly`: status, players, info, version, mantenimiento status.
- `moderator`: kick, mute/unmute, whitelist, pardon, time/weather/difficulty/gamemode/teleport/heal/feed/xp/save/gamerules, `/mc message tipo:say|broadcast|announce`.
- `admin`: ban, op/deop, setup, roles, allowlist, paneles, notificaciones, auditoría, mantenimiento, integraciones.
- `owner`: puede activar consola irrestricta; sigue sujeto a comandos destructivos bloqueados.

Si no hay roles Minecraft configurados, el bot usa fallback conservador de permisos Discord (Manage Guild/Moderate Members/Admin).

## RCON y compatibilidad

- **Paper/Spigot/Bukkit/Purpur:** status y RCON vanilla compatibles cuando están habilitados.
- **Fabric/Forge/NeoForge:** status Java funciona; comandos RCON dependen de configuración del servidor.
- **Plugins opcionales:** EssentialsX (mute/heal/feed/broadcast), LuckPerms (mute/opciones según setup), PlaceholderAPI/Vault detectables como informativos; Vault no habilita economía.

## Paneles y notificaciones

Los paneles persistentes usan `customId` con prefijo `mc:` y validan permisos en cada interacción. Si un mensaje fue borrado, el panel puede reenviarse con `/mcadmin panel`.

Las notificaciones se deduplican por huella (`evento + sujeto + estado`) y respetan un rate limit interno para evitar spam.

## Mantenimiento

`/mcadmin maintenance` pide confirmación por botón antes de aplicar cambios. Puede activar whitelist durante mantenimiento si RCON está disponible. No ejecuta stop/restart.

## Auditoría

Cada acción crea un registro en `minecraft_audit_log` con: guild, admin Discord, acción, jugador objetivo, comando redacted-safe, resultado y error. Los secretos nunca se guardan.
