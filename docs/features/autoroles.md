# Roles automáticos y paneles — PAN BOT v1.1.0

Sistema por servidor para asignar roles al entrar y para publicar paneles persistentes de autoselección. Toda la configuración vive en SQLite y sobrevive reinicios.

## Roles de entrada

| Comando                      | Descripción                                                              |
| ---------------------------- | ------------------------------------------------------------------------ |
| `/autorole setup [bots]`     | Activa los roles automáticos. `bots:true` incluye bots (no por defecto). |
| `/autorole add rol:<rol>`    | Añade un rol a la lista de entrada (se permiten varios).                 |
| `/autorole remove rol:<rol>` | Quita un rol de la lista.                                                |
| `/autorole list`             | Muestra estado, inclusión de bots, roles y paneles.                      |
| `/autorole disable`          | Desactiva la asignación al entrar sin borrar la configuración.           |

Comportamiento:

- Se asignan **todos** los roles configurados que sigan existiendo y sean asignables.
- Los bots se omiten salvo `/autorole setup bots:true`.
- Si falta el permiso `Manage Roles`, el rol está por encima del rol más alto del bot o es gestionado por una integración, se omite con un aviso en logs; el resto de roles se procesan igual.
- Los roles eliminados en Discord se podan automáticamente de la configuración al producirse una entrada, y también de los paneles.
- Los fallos de la API de Discord se registran pero no detienen el evento de bienvenida ni los registros.

## Paneles de autoselección

> **Nota de Discord:** la API no permite mezclar subcomandos y grupos de subcomandos en el mismo nivel. Por eso las acciones de panel son subcomandos planos (`panel-create`, `panel-edit`, `panel-delete`) en lugar de `/autorole panel …`.

| Comando                                                                                   | Descripción                                                            |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `/autorole panel-create canal:<canal> titulo:<texto> [descripcion] [limite]`              | Publica un panel vacío. `limite` = máximo de roles por miembro (1–10). |
| `/autorole panel-edit panel:<id> rol:<rol> accion:<add\|remove> [etiqueta] [descripcion]` | Añade o quita un rol y refresca el mensaje publicado.                  |
| `/autorole panel-delete panel:<id>`                                                       | Elimina la configuración e intenta borrar el mensaje.                  |

Detalles:

- Se pueden crear **varios paneles** por servidor; cada uno tiene un ID numérico local.
- Cada panel admite hasta **25 roles**, con botones de hasta 5 por fila.
- La etiqueta (1–45 caracteres) y la descripción (hasta 100) se validan con Zod.
- Al pulsar un botón, el rol se alterna. Solo cuentan para el límite los roles **de ese panel** que el miembro ya tiene.
- Los `customId` son `autorole_panel:<panelId>:<roleId>`; se ignoran ids mal formados o heredados. El router central los gestiona tras un reinicio sin necesidad de volver a registrar nada.
- Si el mensaje del panel se borra manualmente, la configuración permanece; vuelve a publicarlo con `panel-create` y elimina el anterior con `panel-delete`.

## Permisos

- Quien ejecuta `/autorole` necesita `Manage Guild` (permiso por defecto del comando).
- El bot necesita `Manage Roles` y que su rol esté por encima de los roles que va a asignar.
- En el canal del panel necesita `View Channel`, `Send Messages` y `Embed Links`; para editar/borrar el mensaje, `Read Message History` y permiso sobre ese mensaje.

## Limitaciones

- No se pueden asignar roles gestionados por bots o integraciones.
- No se usa un selector desplegable: Discord limita los selectores a 25 opciones y los botones permiten refrescar el panel con menos permisos.
- El límite de selección se aplica por panel, no globalmente.
- No se reenvía un panel desaparecido de forma periódica; se comprueba al editarlo o al usarlo.
