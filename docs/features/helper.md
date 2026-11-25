# Helpers (`/helper`) — PAN BOT v1.2.0

Acepta a un helper desde un ticket abierto y le concede el grupo en el servidor de Minecraft. **No asume que LuckPerms ni Skript estén instalados**: lo detecta con `plugins` por RCON y, si no está, informa del fallo sin ejecutar nada más.

## Requisitos

- Variables de Minecraft y RCON configuradas (ver [Minecraft](minecraft.md)); el servidor de Discord debe estar en `MINECRAFT_GUILD_IDS`.
- `/mcadmin setup` activo y el ejecutor con nivel **admin** de Minecraft **y** ser equipo de soporte del ticket.
- `/helper config activado:true` (desactivado por defecto).

## Comandos

| Comando                                                                   | Quién                | Descripción                                                  |
| ------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------ |
| `/helper aceptar usuario_discord jugador_minecraft`                       | Soporte + admin MC   | Solo dentro de un ticket. Pide confirmación antes de actuar. |
| `/helper vincular usuario_discord jugador_minecraft`                      | Administrar servidor | Vincula Discord ↔ Minecraft.                                 |
| `/helper desvincular usuario_discord`                                     | Administrar servidor | Quita el vínculo.                                            |
| `/helper config activado? metodo? grupo? comando_skript? exigir_vinculo?` | Administrar servidor | Configura el módulo.                                         |
| `/helper estado`                                                          | Administrar servidor | Configuración y últimos registros.                           |

## Comprobaciones (al pedir y otra vez al confirmar)

1. Módulo activado en este servidor.
2. Nombre de jugador válido (`^[A-Za-z0-9_]{1,16}$`).
3. El canal es un ticket **de este servidor** y sigue abierto.
4. El ejecutor es equipo de soporte (no basta con el rol de Minecraft).
5. El usuario de Discord es el creador o participante del ticket.
6. Si existe vínculo, debe coincidir; un jugador no puede estar vinculado a dos cuentas. Con `exigir_vinculo` el vínculo es obligatorio.
7. Permiso de Minecraft `helper-grant` (nivel admin) y servidor de Discord autorizado para RCON.

## Métodos

- **LuckPerms** (`lp user <jugador> parent add <grupo>`). Grupo por defecto `helper`, validado con `^[a-z0-9_-]{1,32}$`. Solo se ejecuta si `plugins` lista LuckPerms. La respuesta se clasifica: éxito, «ya pertenecía», error o **no reconocida** (se informa como no confirmada, nunca como éxito). El texto de LuckPerms cambia entre versiones.
- **Skript**: plantilla `comando {player}` (un único comando). Debe estar **explícitamente en la allowlist de consola** del servidor (`/mcadmin`), no puede ser un comando bloqueado, y Skript debe aparecer en `plugins`. El bot no inventa comandos de Skript: tú defines el comando de tu script. Skript no suele devolver confirmación; se registra lo que responda la consola.

## Registro

Cada intento se guarda en `helper_grants` (quién aprobó, jugador, método, resultado), en `minecraft_audit_log` (acción `helper-grant`) y en `ticket_events`, y se informa dentro del ticket con menciones desactivadas. No se llama a ninguna API externa (por ejemplo Mojang): la validez del jugador se comprueba por formato, vínculo y respuesta de LuckPerms.
