# Estadísticas del servidor — PAN BOT v1.1.0

Contadores persistentes por servidor. **Nunca se guarda el contenido de los mensajes ni datos personales**: solo IDs de servidor, contadores agregados y claves de día/semana en UTC.

## Datos en vivo e históricos

`/stats members`, `/stats activity` y `/stats` muestran el mismo embed con dos bloques claramente separados:

- **En vivo:** miembros totales, humanos y bots (instantánea del servidor).
- **Histórico:** entradas, salidas y mensajes acumulados, más la actividad diaria de los últimos 7 días (UTC).

`total` es un alias de `members` en los contadores. Las claves de día (`YYYY-MM-DD`) y semana (`YYYY-Www`) usan UTC y se renuevan automáticamente.

| Comando                                        | Descripción                                       |
| ---------------------------------------------- | ------------------------------------------------- |
| `/stats` / `/stats members`                    | Instantánea de miembros, humanos y bots.          |
| `/stats activity`                              | Entradas, salidas, mensajes y actividad reciente. |
| `/stats setup canal:<canal> metrica:<métrica>` | Configura/actualiza un canal contador.            |
| `/stats channels`                              | Lista los contadores configurados.                |
| `/stats disable`                               | Quita todos los contadores de este servidor.      |

Métricas disponibles: `members`, `humans`, `bots`, `total` (alias) y `messages`.

## Canales contador

- Se admiten canales de texto, anuncio y voz; el nombre se actualiza con `setName`.
- El bot necesita `Manage Channels`. Si no lo tiene, no se renombra nada y se avisa en logs.
- **Throttling:** si el nombre calculado es igual al último aplicado, se espera al menos **15 minutos** entre intentos. Si el valor cambia, se aplica de inmediato.
- Los canales borrados o inaccesibles (`Unknown Channel` / `Missing Access`) se eliminan de la configuración automáticamente.
- Se refrescan al arrancar, cada 15 minutos, tras entradas/salidas (forzado) y tras mensajes con un filtro grueso de 30 segundos para no saturar la API.

## Permisos

- `/stats setup` y `/stats disable` requieren `Manage Guild`.
- El bot requiere `Manage Channels` para renombrar; `View Channel` para comprobar el canal.

## Limitaciones

- Humanos y bots se calculan con `Guild Members Intent` y la caché/miembros consultados. Si el intent privilegiado está desactivado o la consulta falla, se usa la caché disponible; el total usa `guild.memberCount`.
- Las estadísticas empiezan en la migración `003_*`: no se reconstruyen datos anteriores.
- No se registra quién envió cada mensaje ni cuándo exactamente, solo el contador agregado y la última marca de tiempo global del servidor.
- Un mismo canal solo puede pertenecer a un servidor (índice único en `stat_channels`).
