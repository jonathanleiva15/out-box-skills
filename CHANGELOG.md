# Changelog — out-box-skills

Todos los cambios notables del pack de skills de Outbox.
Formato basado en [Keep a Changelog](https://keepachangelog.com/). El repo sigue SemVer
(`package.json`); cada skill versiona su propio `version` en el frontmatter de su `SKILL.md`.

## [Unreleased]

## [0.1.0] - 2026-06-15

### Added
- SemVer + CHANGELOG del repo (antes el pack no tenía reloj propio).
- `package.json` con la versión del repo.

### Changed
- Alineado el drift de versión: `AGENTS.md` y `STATUS.md` decían `1.0.0` para la skill `outbox-publish` mientras el frontmatter de `SKILL.md` (fuente de verdad) está en `1.1.0`. Se alinean las docs a `1.1.0`.

### Skills incluidas
- **`outbox-publish` `1.1.0`** — publicar/leer/actualizar/gestionar páginas en Outbox vía API. Soporta markdown publish, squash, export público, share/grants, 40 tools. Ejerce contract del worker ≥ 1.0 (descubrir en runtime con `GET /api/capabilities`, no hardcodear).
