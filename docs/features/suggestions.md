# Sugerencias — PAN BOT v1.1.0

Sistema de sugerencias por servidor con formulario, votación persistente y gestión de staff.

## Flujo de usuario

1. El staff configura el canal con `/suggestions setup canal:<canal> [staff:<rol>]`.
2. Cualquier miembro usa `/suggest` y rellena un modal de 10–1000 caracteres.
3. El bot crea un ID único incremental y publica un embed con 👍 / 👎 / ↩️ (quitar voto).
4. Cada usuario tiene **un voto** que puede cambiar o eliminar libremente. El embed se refresca con los recuentos `up`, `down` y `score`.
5. El staff cambia el estado y, opcionalmente, añade una respuesta.

## Comandos

| Comando                                                   | Descripción                                                                    |
| --------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `/suggest`                                                | Abre el modal para enviar una sugerencia.                                      |
| `/suggestions setup canal:<canal> [staff]`                | Define canal y rol de staff, y activa el sistema.                              |
| `/suggestions config [activar] [estado] [etiqueta]`       | Activa/desactiva o personaliza la etiqueta de un estado (hasta 60 caracteres). |
| `/suggestions view id:<id>`                               | Muestra una sugerencia y sus votos (solo para ti).                             |
| `/suggestions status id:<id> estado:<estado> [respuesta]` | Aprueba, rechaza, marca como implementada o reabre (`pending`).                |
| `/suggestions disable`                                    | Desactiva `/suggest` sin borrar sugerencias.                                   |

Estados: `pending`, `approved`, `rejected`, `implemented`. **Reabrir** equivale a volver a `pending`.

## Permisos

- Los comandos `/suggestions` requieren `Manage Guild` por defecto.
- Se considera staff a quien tiene `Manage Messages` **o** el rol configurado con `staff:<rol>`.
- La gestión de estados se comprueba de nuevo en el servidor; un `customId` manipulado no basta.

## Persistencia y datos

- Tablas: `suggestion_settings`, `suggestion_statuses`, `suggestions` y `suggestion_votes`.
- Se guardan ID de autor, servidor, canal, mensaje, contenido, fecha, estado, respuesta y votos (sin contenido de mensajes de terceros).
- Los `customId` de voto son `suggest_vote:<id>:up|down|clear`; el router central los gestiona tras reinicios.
- Si el canal o mensaje desaparece, se omite la actualización del embed y se registran los votos igualmente.
- Los cambios de estado envían un evento `moderation` a los registros configurados.

## Limitaciones

- Los botones de voto del mensaje principal son persistentes; los de `/suggestions view` son efímeros y sirven solo como vista previa.
- El histórico no se migra desde otros bots.
- Las etiquetas personalizadas afectan al embed, no a los valores internos de estado.
- No hay notificación automática al autor aparte de la respuesta visible en el embed; el bot intenta enviar solo avisos de moderación al canal de logs.
