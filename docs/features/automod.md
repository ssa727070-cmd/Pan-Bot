# AutoMod avanzado — PAN BOT v1.2.0

Filtrado configurable por servidor. **Todos los filtros y el silencio (timeout) están desactivados por defecto**. Solo se aplican las acciones que el admin elige explícitamente.

## Detección

| Regla       | Qué detecta                                        | Ajustes                                                                       |
| ----------- | -------------------------------------------------- | ----------------------------------------------------------------------------- |
| `frequency` | N mensajes en una ventana corta.                   | `/automod spam ventana:<5-60> max_mensajes:<3-30>`                            |
| `identical` | Tres mensajes idénticos en la ventana.             | `/automod spam identicos:true`                                                |
| `mentions`  | Menciones masivas.                                 | `/automod mentions activo:true maximo:<2-50>` o `/automod spam max_menciones` |
| `invites`   | Invitaciones de Discord (`discord.gg`, `/invite`). | `/automod invites activo:true`                                                |
| `links`     | Enlaces `http(s)://`.                              | `/automod links activo:true`                                                  |
| `words`     | Palabras/frases literales (sin regex).             | `/automod words accion:add\|remove\|list`                                     |
| `repeated`  | Seis o más caracteres iguales seguidos.            | `/automod setup repetidos:true`                                               |

Solo se devuelve **la primera regla que coincide** para evitar acciones duplicadas.

## Exenciones

Nunca se sanciona a:

- administradores;
- miembros con `Manage Messages`, `Ban Members`, `Kick Members` o `Moderate Members`;
- bots y webhooks;
- roles, canales o usuarios añadidos con `/automod exemptions`.

## Acciones

`/automod setup [nativo] [eliminar] [advertir] [repetidos] [silenciar] [registrar]` configura:

- **Eliminar mensaje** (por defecto `true` pero inactivo sin filtros).
- **Aviso por DM** (por defecto `true`; si el usuario tiene los DMs cerrados, se ignora).
- **Silencio**: `0` = desactivado; cualquier otro valor 1–1440 minutos es **opt-in**.
- **Registro**: incidencia en `automod_incidents` y evento `moderation` si está configurado.
- Throttling de 5 segundos por usuario para no repetir sanciones en un mismo burst.

## Reglas nativas de Discord (opcional)

`/automod setup nativo:true` crea reglas gestionadas con el prefijo `PAN BOT ·`:

- `Spam` → trigger `Spam`.
- `Menciones` → trigger `MentionSpam` (`mentionTotalLimit`).
- `Invitaciones` → trigger `Keyword` con `discord.gg/`, `discord.com/invite/`, `discordapp.com/invite/`.
- `Palabras bloqueadas` → trigger `Keyword` con hasta 20 frases literales.

Acciones nativas: `BlockMessage` y, si hay canal de logs, `SendAlertMessage`.

**No hay duplicados:** cuando `nativeRules` está activo, el filtro propio omite las acciones de eliminar/avisar/silenciar en las categorías que Discord ya bloquea, pero sigue registrando incidencias. Las reglas nativas se sincronizan al arrancar y al cambiar la configuración. Requieren `Manage Guild` y que el servidor tenga disponible la función de AutoMod; si Discord rechaza una regla, se registra el aviso y el bot sigue funcionando.

## Comandos

| Comando                                                           | Descripción                                       |
| ----------------------------------------------------------------- | ------------------------------------------------- |
| `/automod setup …`                                                | Activa y configura acciones/reglas nativas.       |
| `/automod status`                                                 | Muestra filtros, acciones y número de exenciones. |
| `/automod enable` / `/automod disable`                            | Activa/desactiva sin borrar la configuración.     |
| `/automod spam …`                                                 | Umbrales de frecuencia, idénticos y menciones.    |
| `/automod words accion:… [palabra]`                               | Lista literal de palabras bloqueadas.             |
| `/automod links activo:<bool>` / `/automod invites activo:<bool>` | Filtros de enlaces e invitaciones.                |
| `/automod mentions activo:<bool> [maximo]`                        | Menciones masivas.                                |
| `/automod exemptions accion:… [tipo] [id]`                        | Roles/canales/usuarios exentos.                   |
| `/automod logs [registrar]`                                       | Muestra incidencias o activa su registro.         |

Todos los subcomandos requieren `Manage Guild`. El bot necesita `Manage Messages` para borrar, `Moderate Members` para silenciar y `Manage Guild` para reglas nativas.

## Limitaciones

- El historial de mensajes para `frequency`/`identical` está en memoria; se reinicia con el bot. Los contadores históricos de estadísticas sí persisten.
- Las palabras bloqueadas son literales y se normalizan (minúsculas, sin caracteres de ancho cero); no se aceptan regex.
- Las reglas nativas existentes se emparejan por nombre: cambiar un umbral no reescribe la regla de Discord. Desactiva y vuelve a activar `nativo` o edítala en Discord.
- No se guarda el contenido de los mensajes en `automod_incidents`, solo la regla, canal, usuario y acciones aplicadas.
- Discord puede denegar la creación de reglas nativas por permisos, límite del servidor o funciones no disponibles; se degrada con elegancia.

## Novedades v1.2.0

- **Reglas nuevas:** `flood` (mensajes muy rápidos), `similar` (mensajes casi idénticos), `caps` (exceso de mayúsculas) y evasión de filtros: se normalizan leet (`p4l4br4`), separadores, repeticiones, homoglifos, fullwidth y caracteres invisibles. Zalgo cuenta como `repeated`.
- **Sensibilidad** 1–3 (`/automod avanzado sensibilidad`); 2 equivale al comportamiento de v1.1.
- **Listas por servidor** (`/automod listas`): `word_allow`, `domain_allow`, `domain_block`, `invite_allow`.
- **Strikes** (`/automod strikes`): N incidencias en M minutos → silenciar o expulsar. Solo se aplica si la jerarquía y los permisos del bot lo permiten.
- **Excepciones** por rol, usuario, canal, categoría y el canal padre de un hilo.
- **Mensajes editados** se vuelven a analizar durante 10 minutos tras enviarse.
- Cada incidencia guarda la regla y un detalle (`automod_incidents.detail`).

### Qué no se promete

- Sin el intent **Message Content** el bot no ve el texto; sin **Gestionar mensajes** no puede borrar; sin **Moderar miembros** no puede silenciar; no puede sancionar a quien tenga un rol igual o superior.
- Los hilos privados donde el bot no es miembro no generan eventos.
- Las reglas `domain_block`, `flood`, `similar`, `caps`, evasión y strikes las aplica el bot; **no** se sincronizan con el AutoMod nativo de Discord.
