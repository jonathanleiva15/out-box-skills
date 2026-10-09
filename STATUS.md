# STATUS.md — out-box-skills

> El estado del ecosistema completo (9 repos, entorno de pre-lanzamiento, bugs abiertos, drift) vive en
> `../STATUS.md` (dashboard maestro de `Outboxmain\`, creado 2026-07-18). Acá solo lo local.
>
> **En produccion** desde 2026-10-09 (out-box.dev abierto). `@out-box/mcp` 0.3.1 en npm y el
> MCP remoto en `mcp.out-box.dev`. `main` de este repo en 1.9.0 hasta que se mergeen los PRs
> de 1.10.0 y 1.11.0.

## Estado actual

- Skill **`outbox-publish` 1.11.0** (2026-10-09: toda la skill en ingles, MCP y remoto publicados, aperturas y Team por Contact us; 1.10.0: `references/offering.md`, que ofrecer y cuando; 2026-10-01: Empresas v3 en `references/teams.md`; 1.7.0 local, 2026-09-30; GitHub `main` en 1.9.0) — instalable via skills.sh
  (`npx skills add jonathanleiva15/out-box-skills`). Repo `package.json` 0.5.0.
- 1.7.0 (ronda 3, 2026-09-30): la skill queda alineada con el worker de la ronda 3:
  `409 version_conflict` con `currentVersion`/`currentEtag` e `If-Match` opaco,
  `Idempotency-Key` real (replay, `idempotency_key_reused`, `idempotency_in_progress`),
  `401 step_up_required` + `mfaCode`, export con fuente `markdown`, `created`/`inherited`/
  `changed` en el publish, rollback que no re-expone, `trust` y politica de comentarios,
  `warnings.secrets` / `rejectOnSecrets`, capa de datos y vigia de render
  (`references/page-data.md`), MCP remoto y plugin como "proximamente" y toolsets del MCP.
  Detalle en `CHANGELOG.md` [0.4.0].
- Ronda 4 (2026-10-01, gate, sin subir version): daily con `createOnly`, `applyAttributes` e
  `ignoredAttributes`, `PUT /visibility` sobre un daily (`restrictedDates`) y `requestId` en los
  errores. `npm test`: 37 pass.
- 1.6.0 (mesa 2026-09-29): progressive disclosure, lectura canonica por `/export`,
  herencia de metadata, politica anti prompt injection, reintentos, borrador.
- `npm test` corre `test/skill.test.mjs` (regresiones de la doc, sin dependencias). Desde la
  pasada 3 (2026-09-30) lo corre el CI (`.github/workflows/ci.yml`) en cada push a `main` y
  cada PR: skills.sh distribuye desde `main`, asi que es el gate antes de llegar a usuarios.
  El tamano de `SKILL.md` no se anota aca (se desactualiza): el test fija el presupuesto
  (<= 260 lineas / 18 KB); `wc -lc skills/outbox-publish/SKILL.md` da el actual.
- `references/api-reference.md` tiene un Indice al principio y headings con la ruta en
  markdown plano (`<user>` entre backticks, sin `&lt;`): la skill manda a buscar la seccion
  del endpoint con grep en vez de leer el archivo entero (el test lo fija).
- Siguen sin documentar: password por pagina, reacciones, registry de agentes (solo el step-up de `instantiate`) y la gestion de uploads
  (`GET /api/uploads`, `DELETE /api/uploads/:hash.:ext`, `POST /api/uploads/gc`): el critico
  de la ronda 3 monto las rutas (`features.uploadsManage: true`), asi que ya se pueden
  documentar.
- Manifest `skills.sh.json` declara el grouping "Outbox" → `outbox-publish`.

## Archivos

- `skills/outbox-publish/SKILL.md` — instrucciones operativas (auth, scopes,
  ContentMeta con `model` obligatorio, visibility default private, flujos).
- `skills/outbox-publish/README.md` — descripcion + install canonico.
- `skills/outbox-publish/references/api-reference.md` — referencia endpoint por endpoint.
- `skills/outbox-publish/references/page-data.md` — capa de datos de una pagina y vigia de render (nuevo en 1.7.0).

## Pendientes

- Al mergear a `main`, subir `capabilities.clients.skill.latest` en el worker (hoy `1.9.0`)
  a la version mergeada (1.10.0 o 1.11.0), para que `outbox skill update` detecte el bump.
- **Drift a vigilar** (codigo del worker sin deployar; re-sincronizar si cambia):
  - ~~`secretScan.appliesTo` = `['dailyAppend']`~~: el critico cableo publish y
    publish-from-template y actualizo la skill (regla 5, `content.md`, `api-reference.md`).
  - ~~`Idempotency-Key` en append y comentarios~~: el worker ya los envuelve (pasada 4) y la
    skill lo refleja condicionado a `features.idempotencyEndpoints` (`SKILL.md`, loop
    central; `content.md` con `dailyAppend`/`comment`; `api-reference.md` en el append).
  - `features.idempotency` esta en `true` por coordinacion entre unidades: si vuelve a
    `false`, la skill ya condiciona el replay a ese flag.
  - ~~MCP remoto: quitar el "proximamente"~~ (1.11.0). Falta el plugin: cuando
    `out-box-plugin` sea publico y tenga marketplace, sacarle el "coming soon" en `SKILL.md`
    (regla 10), `sharing-and-keys.md` y `README.md`. Si el remoto renombra o cura tools,
    revisar las menciones de tools en `comments.md`, `page-data.md` y `sharing-and-keys.md`.
  - Uploads manage (`GET /api/uploads`, `DELETE /api/uploads/:hash.:ext`,
    `POST /api/uploads/gc`): ya montadas (`features.uploadsManage: true`); falta
    documentarlas en la skill. El DELETE y el GC con `apply` exigen `delete:<user>` amplio.
- Precio del tier `unlimited`: decision humana pendiente. La skill ya no lo hardcodea
  (remite a `/pricing`); no volver a poner un monto.
- Re-sincronizar `dailyDocsMax` y demas limites de tier si cambian en `lib/tier-limits.ts`
  (la tabla de `api-reference.md` usa los caps actuales; caps por tier = decision pendiente).
- Verificar que el nombre del paquete MCP referenciado siga siendo `@out-box/mcp`.
