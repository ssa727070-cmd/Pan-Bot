# Guía de despliegue en Wispbyte — PAN BOT

PAN BOT es una aplicación Node.js 22 autocontenida: solo necesita Discord y un archivo SQLite persistente. No usa Docker, puertos entrantes ni servicios externos.

## Resumen para Wispbyte

| Ajuste                 | Valor                                                |
| ---------------------- | ---------------------------------------------------- |
| Runtime                | **Node.js 22 LTS**                                   |
| Comando de instalación | `npm ci`                                             |
| Comando de compilación | `npm run build`                                      |
| **Comando de inicio**  | **`npm start`**                                      |
| Archivo de arranque    | `dist/index.js`                                      |
| Puertos                | Ninguno (el bot solo establece conexiones salientes) |
| Base de datos          | SQLite en la ruta indicada por `DATABASE_PATH`       |

Si el panel permite separar fases, configura **Build Command** = `npm ci && npm run build` y **Startup Command** = `npm start`. Si solo acepta un comando de inicio, usa `npm ci && npm run build && npm start` (la primera vez) y posteriormente `npm start`.

> `npm run build` limpia `dist/` antes de compilar. Esto evita que puntos de código eliminados sigan siendo cargados desde artefactos antiguos.

---

## 1. Preparar la aplicación de Discord

Los pasos que requieren tu cuenta están marcados con ✋.

1. ✋ Abre `https://discord.com/developers/applications`, entra en tu aplicación y ve a **Bot → Privileged Gateway Intents**.
2. Activa **SERVER MEMBERS INTENT** y **MESSAGE CONTENT INTENT** y guarda. Sin ellos el bot no puede arrancar ni gestionar bienvenidas, logs ni transcripciones.
3. ✋ En **Bot → Token**, copia el token. Nunca lo compartas ni lo subas a Git.
4. En **General Information**, copia el **Application ID** (no el ID del usuario bot).

### Intents solicitados por el código

| Intent                | Privilegiado | Funciones que lo necesitan                                      |
| --------------------- | ------------ | --------------------------------------------------------------- |
| `Guilds`              | No           | Comandos, roles, canales y miembros                             |
| `Guild Messages`      | No           | Logs de edición/borrado, `/clear`, AutoMod, actividad           |
| **`Guild Members`**   | **Sí**       | `/ban`, `/kick`, `/timeout`, jerarquía, autoroles, estadísticas |
| **`Message Content`** | **Sí**       | Logs, transcripción de tickets y detección de AutoMod           |

---

## 2. ✋ Obtener el archivo de despliegue

Usa `PanBot-Wispbyte.zip`, generado en la raíz del proyecto. Contiene únicamente código fuente, configuración, manifiestos y documentación. **No contiene** `.env`, tokens, bases de datos, `node_modules`, claves ni logs.

Extrae el ZIP en tu equipo y comprueba que contiene `package.json`, `package-lock.json`, `tsconfig.json`, `.env.example`, `src/` y `docs/`.

---

## 3. Invitar el bot al servidor

URL de invitación (scopes `bot` + `applications.commands`, permisos ya existentes):

```text
https://discord.com/oauth2/authorize?client_id=TU_APPLICATION_ID&permissions=1078062142&scope=bot%20applications.commands
```

Sustituye `TU_APPLICATION_ID` por el Application ID del paso 1. El bitfield **`1078062142`** incluye los permisos necesarios para las funciones actuales. Si el bot ya está en el servidor con el bitfield anterior `1101662383126`, puedes conceder los permisos faltantes manualmente.

---

## 4. Crear el servidor en Wispbyte

1. Crea un servidor nuevo y elige **Node.js** como tipo.
2. Selecciona **Node.js 22** en la configuración del runtime (o el valor más cercano a 22 LTS). El proyecto declara `"engines": { "node": ">=22" }`.
3. Sube el contenido del ZIP a la carpeta principal del servidor. No subas tu `.env` local.
4. Ajusta el directorio de trabajo al de la aplicación (normalmente la carpeta raíz del servidor).
5. Configura instalación, compilación e inicio según la tabla del resumen.

---

## 5. Variables de entorno en Wispbyte

Añádelas en la pestaña **Environment Variables / Variables de entorno** del panel.

### Obligatorias

| Nombre              | Valor                         |
| ------------------- | ----------------------------- |
| `DISCORD_TOKEN`     | El token copiado en el paso 1 |
| `DISCORD_CLIENT_ID` | Tu Application ID             |

### Opcionales (recomendadas)

| Nombre                        | Valor recomendado     | Uso                                                                |
| ----------------------------- | --------------------- | ------------------------------------------------------------------ |
| `NODE_ENV`                    | `production`          | Activa el logging de producción                                    |
| `LOG_LEVEL`                   | `info`                | Nivel de pino (`fatal`, `error`, `warn`, `info`, `debug`, `trace`) |
| `DATABASE_PATH`               | `data/panbot.sqlite`  | Ruta SQLite; debe estar en almacenamiento persistente              |
| `DISCORD_GUILD_ID`            | vacío                 | Vacío = comandos globales; ID de guild = registro instantáneo      |
| `EMBED_COLOR`                 | `5865F2`              | Color hexadecimal de los embeds, sin `#`                           |
| `MINECRAFT_HOST`              | `pansmp.mcserv.world` | Host del servidor Minecraft                                        |
| `MINECRAFT_PORT`              | `25565`               | Puerto Java/status                                                 |
| `MINECRAFT_RCON_PORT`         | `25575`               | Puerto RCON                                                        |
| `MINECRAFT_RCON_PASSWORD`     | vacío si no hay RCON  | Contraseña RCON; nunca la subas a Git                              |
| `MINECRAFT_RCON_TIMEOUT_MS`   | `5000`                | Timeout RCON                                                       |
| `MINECRAFT_STATUS_TIMEOUT_MS` | `5000`                | Timeout de status                                                  |

> Para `DATABASE_PATH`, comprueba en el administrador de archivos de Wispbyte que la ruta esté dentro del volumen persistente del contenedor. La aplicación crea automáticamente el directorio padre. Si el panel usa una ruta absoluta persistente (por ejemplo `/home/container/data/panbot.sqlite`), indícala tal cual. **No** apuntes a `/tmp`.

---

## 6. Migraciones y arranque

Las migraciones se aplican **automáticamente** al abrir la base de datos (`PanDatabase` ejecuta `001`–`004` una sola vez y registra los IDs en `schema_migrations`). No hay que ejecutar nada adicional, pero existe `npm run db:migrate` como comando explícito. Las migraciones son aditivas: crean tablas nuevas y no modifican ni borran datos existentes.

Secuencia recomendada en el panel, la primera vez:

1. `npm ci`
2. `npm run build`
3. `npm start`

Si el panel ya ejecuta instalación y compilación como fases separadas, el comando de inicio es exactamente:

```bash
npm start
```

El proceso atiende `SIGINT` y `SIGTERM`: cierra el cliente de Discord y la conexión SQLite antes de salir.

---

## 7. Registrar los comandos slash

Tras el primer arranque, ejecuta **una sola vez** desde la consola del panel:

```bash
npm run commands:deploy
```

- Con `DISCORD_GUILD_ID` vacío, los comandos se registran globalmente y pueden tardar hasta una hora en aparecer.
- Con un ID de servidor, aparecen al instante en ese servidor.

Para comprobar el payload sin llamar a Discord:

```bash
npm run commands:preview
```

Escribe `data/commands.json` con los **26 comandos** actuales. Vuelve a ejecutar el despliegue siempre que cambie el conjunto de comandos, para que Discord deje de mostrar entradas obsoletas.

---

## 8. Configuración inicial dentro del servidor

```
/settings modlog canal:#moderacion
/logs setup canal:#logs
/welcome setup canal:#bienvenidas mensaje:"¡Bienvenido {user} a {server}! Somos {memberCount}."
/goodbye setup canal:#despedidas
/ticket setup soporte:@Soporte categoria:CategoriaTickets panel:#tickets
/ticket panel canal:#tickets
/autorole setup bots:false
/autorole add rol:@Miembro
/autorole panel-create canal:#roles titulo:"Elige tus roles" limite:2
/stats setup canal:"Contador" metrica:members
/suggestions setup canal:#sugerencias staff:@Staff
/automod setup nativo:false eliminar:true advertir:true silenciar:0 registrar:true
/automod spam ventana:10 max_mensajes:6 identicos:true
/mcadmin setup enabled:true notificaciones:#minecraft auditoria:#mc-audit
/mcadmin roles nivel:admin accion:add rol:@AdminsMinecraft
/mcadmin panel canal:#minecraft tipo:overview
```

Verifica con `/settings view`, `/logs view`, `/autorole list`, `/stats channels`, `/suggestions config` y `/automod status`. La referencia completa está en [docs/commands.md](commands.md) y las guías detalladas en [docs/features/](features/).

---

## 9. Verificación

Antes de subir a Wispbyte, en este equipo:

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run healthcheck
npm run commands:preview
```

`healthcheck` valida configuración, migraciones, carga de comandos y eventos **sin conectar a Discord**. `commands:preview` valida los 26 comandos sin llamadas a la API.

En Wispbyte, comprueba:

| Comprobación | Resultado esperado                                                                                 |
| ------------ | -------------------------------------------------------------------------------------------------- |
| Arranque     | Logs con `Slash commands loaded` (26), `Discord events loaded` (15) y `PAN BOT is online`          |
| Intents      | Sin errores `Used disallowed intents`                                                              |
| `/ping`      | Responde con la latencia                                                                           |
| `/help`      | Lista 26 comandos en 11 categorías                                                                 |
| Persistencia | Tras reiniciar, `/warnings`, paneles, sugerencias, contadores y configuración Minecraft siguen ahí |
| Minecraft    | `/mc status` responde online/offline sin exponer secretos; RCON solo si está configurado           |

> Si aparece `Used disallowed intents`, vuelve a activar **SERVER MEMBERS INTENT** y **MESSAGE CONTENT INTENT** en el Developer Portal.

---

## Seguridad

- El ZIP no incluye secretos; `.env`, `data/`, `dist/`, `node_modules/` y los archivos de claves están excluidos del repositorio y del paquete.
- Configura el token solo como variable de entorno en Wispbyte. No lo escribas en archivos versionados ni lo pegues en tickets o chats.
- La publicación en GitHub y la creación del release se hacen manualmente tras verificar los cambios; no se inicia ninguna instancia adicional del bot.
