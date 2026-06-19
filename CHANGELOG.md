# Changelog — out-box-skills

Todos los cambios notables del pack de skills de Outbox.
Formato basado en [Keep a Changelog](https://keepachangelog.com/). El repo sigue SemVer
(`package.json`); cada skill versiona su propio `version` en el frontmatter de su `SKILL.md`.

## [Unreleased]

### Changed
- **`outbox-publish` 1.2.0 → 1.3.0**: documenta las novedades de daily documents — campo `project` en el append (manifest-level, agrupa en el índice; `400 invalid_project`), atribución automática por bloque (`authorLabel`/`authorKind` derivados de la key, NUNCA del body → habilita contribuidores múltiples en un daily compartido), el índice global `GET /api/dailies` (con `contributors`, `project`, `preview`, `activeToday`), y que `GET /blocks` inlinea el `html` de cada bloque + sin `?date` cae al día más reciente. Alineado con `capabilities.clients.skill.latest = 1.3.0`. El CLI suma `outbox dailies` y el flag `outbox append --project`.
- **`outbox-publish` 1.1.0 → 1.2.0**: documenta `POST /api/keys/revoke-bulk` (revocar varias keys en una request, gate `admin:self`). Alineado con `capabilities.clients.skill.latest = 1.2.0` para que `outbox skill update` detecte el cambio. (`logout-all` es de sesión de navegador, no de agentes → fuera de esta skill.)

## [0.1.0] - 2026-06-15

### Added
- SemVer + CHANGELOG del repo (antes el pack no tenía reloj propio).
- `package.json` con la versión del repo.

### Changed
- Alineado el drift de versión: `AGENTS.md` y `STATUS.md` decían `1.0.0` para la skill `outbox-publish` mientras el frontmatter de `SKILL.md` (fuente de verdad) está en `1.1.0`. Se alinean las docs a `1.1.0`.

### Skills incluidas
- **`outbox-publish` `1.1.0`** — publicar/leer/actualizar/gestionar páginas en Outbox vía API. Soporta markdown publish, squash, export público, share/grants, 40 tools. Ejerce contract del worker ≥ 1.0 (descubrir en runtime con `GET /api/capabilities`, no hardcodear).
