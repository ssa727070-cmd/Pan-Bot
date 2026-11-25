# Changelog

## [1.2.0] — 2026-11-25

### Añadido

- Tickets avanzados por servidor (roles, archivo, aceptar/reclamar/cerrar, eventos, recuperación).
- AutoMod: flood, similares, mayúsculas, evasión, listas, sensibilidad, strikes, excepciones por hilo/categoría, mensajes editados.
- Minecraft: `/mc list`, `/mc say`, `/mc unban`; confirmación de `op`/`deop`.
- `/helper` (aceptar, vincular, desvincular, config, estado) con LuckPerms o Skript.
- Estado de módulos en `/settings view`.
- Migración `005_v120_tickets_automod_helper` (aditiva).

### Cambiado

- `/mc players` → `/mc list`; `/mc pardon` → `/mc unban`.
- Acceso de reserva de tickets: de Gestionar canales a Administrador.

### Seguridad

- Sin cambios que debiliten v1.1.6; nuevas entradas validadas.

## [1.1.6]

Parche de seguridad de Minecraft (ver `docs/releases/v1.1.6.md`).
