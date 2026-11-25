# Tickets avanzados — PAN BOT v1.2.0

Cada servidor de Discord tiene su propia configuración, roles, contadores y tickets (`guild_id` en todas las tablas). Nada está ligado a un servidor de pruebas.

## Configuración (por servidor)

Requiere **Administrar servidor** o **Administrador** (se comprueba en cada ejecución).

| Comando                                                       | Efecto                                                                               |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `/ticket setup soporte categoria? panel?`                     | Configuración rápida (compatible con v1.1.x).                                        |
| `/ticket roles tipo rol quitar?`                              | `support` (atienden), `excluded` (no pueden abrir ni ver), `closer` (pueden cerrar). |
| `/ticket archivo canal?`                                      | Canal donde se archivan los transcriptos.                                            |
| `/ticket opciones activo? multiples? maximo? creador_cierra?` | Activar módulo, tickets simultáneos por usuario, si el creador cierra.               |
| `/ticket panel canal?`                                        | Publica el panel con el botón **Abrir ticket**.                                      |
| `/ticket estado`                                              | Muestra la configuración y advierte de lo que falta.                                 |
| `/ticket add` / `/ticket remove`                              | Añade o quita usuarios en el ticket actual (equipo de soporte).                      |

Los administradores (permiso **Administrador**) tienen acceso total a todos los tickets.

## Ciclo de vida

`open → accepted → claimed → closing → closed`

1. El usuario pulsa **Abrir ticket** e indica el motivo. Se crea un canal privado visible solo para el creador, el bot, los roles de atención y los administradores. Los roles excluidos nunca lo ven.
2. No hay duplicados: un bloqueo en memoria evita dobles clics y `maximo` limita los tickets abiertos por usuario.
3. Botones **Aceptar**, **Reclamar** y **Cerrar**; solo los usan quienes tienen permiso (se vuelve a comprobar en cada pulsación).
4. Al cerrar, el ticket pasa a `closing`, se genera el transcripto (hasta 1000 mensajes, con cabecera y eventos), se envía al canal de archivo (o a los registros) y después se borra el canal. Si hay un destino configurado pero el envío falla, **el canal se conserva** para no perder el historial.
5. Se registran abrir, aceptar, reclamar, cerrar y añadir/quitar usuarios (`ticket_events`) y en los logs del servidor.

## Recuperación tras reinicio

Al arrancar, el bot (`reconcileTickets`) cierra los tickets cuyo canal ya no existe y termina los que quedaron en `closing`. Los botones siguen funcionando porque su estado vive en SQLite, no en memoria.

## Límites

- Los menciones del transcripto se neutralizan para no hacer ping al archivarlas.
- Si el bot no tiene **Gestionar canales** o la jerarquía de roles lo impide, el error se muestra y no se deja un ticket a medias.
