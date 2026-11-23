# PAN BOT

A professional, production-ready Discord music bot built with **TypeScript**, **discord.js v14**, **Lavalink v4**, **SQLite** and **slash commands**.

## Features

- Slash commands with autocomplete, per-command cooldowns and centralised error handling.
- Music playback through Lavalink: play (search/URL/playlist), pause, resume, skip, stop, queue, now playing, seek, volume, loop, shuffle and disconnect.
- Automatic "now playing" announcements in the text channel that requested the track.
- Per-guild configuration persisted in SQLite (DJ role, dedicated music channel, default volume).
- Versioned, transactional SQLite migrations.
- Typed environment configuration (fail fast on missing/invalid values).
- Structured logging with pino, graceful shutdown and unit tests.
- Docker Compose setup for the Lavalink node and GitHub Actions CI.

## Requirements

- Node.js **18.18+** (Node **22 LTS** recommended — see `.nvmrc`; Node 18 is end-of-life).
- npm 9+.
- A Discord bot application (token + application ID) with the `applications.commands` and `bot` scopes.
- A Lavalink v4 node (Docker Compose config included) with the YouTube plugin.
- Optional: Docker + Docker Compose for running Lavalink locally.

Required Discord gateway intents: **Guilds** and **Guild Voice States** (neither is privileged).

## Quick start

```bash
cd ~/Proyectos/PanBot
npm ci                         # install dependencies
cp .env.example .env           # then edit .env with your token and IDs
npm run db:migrate             # create/upgrade the SQLite database
docker compose up -d lavalink  # start Lavalink (or use an existing node)
npm run commands:deploy        # register slash commands with Discord
npm run dev                    # start the bot with hot reload
```

Production:

```bash
npm run build
npm start
```

Never commit `.env`, bot tokens, database files or private keys.

## Environment variables

| Variable            | Required | Default              | Purpose                                                   |
| ------------------- | -------- | -------------------- | --------------------------------------------------------- |
| `DISCORD_TOKEN`     | yes      | —                    | Bot token from the Discord Developer Portal               |
| `DISCORD_CLIENT_ID` | yes      | —                    | Application (client) ID                                   |
| `DISCORD_GUILD_ID`  | no       | —                    | Register commands in one guild instantly while developing |
| `NODE_ENV`          | no       | `development`        | `development`, `production` or `test`                     |
| `LOG_LEVEL`         | no       | `info`               | pino log level                                            |
| `DATABASE_PATH`     | no       | `data/panbot.sqlite` | SQLite file path                                          |
| `LAVALINK_HOST`     | no       | `127.0.0.1`          | Lavalink node host                                        |
| `LAVALINK_PORT`     | no       | `2333`               | Lavalink node port                                        |
| `LAVALINK_PASSWORD` | no       | `youshallnotpass`    | Must match `lavalink/application.yml`                     |
| `LAVALINK_SECURE`   | no       | `false`              | Use TLS for the node connection                           |
| `DEFAULT_VOLUME`    | no       | `80`                 | Default player volume (0–100)                             |
| `MAX_QUEUE_SIZE`    | no       | `500`                | Maximum queued tracks per guild                           |
| `EMBED_COLOR`       | no       | `5865F2`             | Brand colour (six hex digits, no `#`)                     |

## Scripts

| Script                                    | Description                                                         |
| ----------------------------------------- | ------------------------------------------------------------------- |
| `npm run dev`                             | Run with `tsx watch` (hot reload)                                   |
| `npm run build`                           | Compile TypeScript into `dist/`                                     |
| `npm start`                               | Run the compiled bot                                                |
| `npm run typecheck`                       | Type-check without emitting files                                   |
| `npm run lint` / `npm run lint:fix`       | ESLint checks                                                       |
| `npm run format` / `npm run format:check` | Prettier formatting                                                 |
| `npm test`                                | Run unit tests                                                      |
| `npm run commands:deploy`                 | Register slash commands (guild-scoped if `DISCORD_GUILD_ID` is set) |
| `npm run db:migrate`                      | Apply pending SQLite migrations                                     |

## Project structure

```text
PanBot/
├── src/
│   ├── index.ts                 # Bootstrap, login and graceful shutdown
│   ├── config/env.ts            # Zod-validated environment
│   ├── core/                    # Discord client, Lavalink manager, logger
│   ├── commands/
│   │   ├── general/             # ping, help, about
│   │   ├── music/               # play, pause, resume, skip, stop, queue, ...
│   │   └── configuration/       # settings (DJ role, channel, volume)
│   ├── events/                  # ready, interactionCreate, raw packet forwarding
│   ├── handlers/                # Automatic command/event loaders
│   ├── music/                   # Player helpers and Lavalink event handlers
│   ├── database/                # SQLite connection, migrations, repositories
│   ├── scripts/                 # Command deployment and migration CLI
│   ├── types/                   # Shared command/event contracts
│   └── utils/                   # Embeds and formatting helpers (+ tests)
├── lavalink/application.yml     # Lavalink v4 + YouTube plugin configuration
├── docker-compose.yml           # Lavalink service
├── .github/workflows/ci.yml     # Typecheck, lint, test and build on CI
├── .env.example
└── data/                        # Ignored: SQLite files live here
```

## Adding a command

1. Create `src/commands/<category>/<name>.ts`.
2. Default-export an object implementing `Command` (`data`, `category`, `execute`).
3. Restart the bot (or let `tsx watch` reload it), then run `npm run commands:deploy`.

Commands and events are discovered automatically — no manual registration list to maintain.

## Lavalink

The bundled `docker-compose.yml` starts Lavalink v4 on port `2333` and mounts `lavalink/application.yml`. The YouTube source plugin is declared through `lavalink.plugins` and downloaded by Lavalink on first start. Change the password in **both** `.env` and `lavalink/application.yml` before exposing the node publicly. Never expose Lavalink's port to the internet without authentication and TLS.

## Security

- `.env`, `data/`, `dist/` and downloaded plugins are gitignored.
- The private SSH key and Discord tokens must never be committed or shared.
- CI runs only read-only verification; publishing is a manual, explicitly authorised step.

## License

MIT — see [LICENSE](LICENSE).
