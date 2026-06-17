# STATUS.md — out-box-skills

## Estado actual

- Skill **`outbox-publish` 1.2.0** — publicada e instalable via skills.sh
  (`npx skills add jonathanleiva15/out-box-skills`).
- Contenido coherente con `capabilities.clients.skill` del back (`out-box`): la skill
  es el mirror de la documentacion de cliente de la API REST de Outbox.
- Manifest `skills.sh.json` declara el grouping "Outbox" → `outbox-publish`.

## Archivos

- `skills/outbox-publish/SKILL.md` — instrucciones operativas (auth, scopes,
  ContentMeta con `model` obligatorio, visibility default private, flujos).
- `skills/outbox-publish/README.md` — descripcion + install canonico.
- `skills/outbox-publish/references/api-reference.md` — referencia endpoint por endpoint.

## Pendientes

- Mantener el limite de HTML del `/publish` referenciado por tier (free 10MB, pago
  hasta 25MB) y apuntando a `/api/capabilities.publishLimits` / `tierLimits.htmlMaxBytes`
  en lugar de un valor plano. Re-sincronizar si el back cambia los tiers.
- Re-sincronizar `dailyDocsMax` y demas limites de tier si cambian en `lib/tier-limits.ts`
  del back.
- Verificar que el nombre del paquete MCP referenciado siga siendo `@out-box/mcp`.
