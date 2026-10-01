# STATUS.md — out-box-skills

> El estado del ecosistema completo (9 repos, entorno de pre-lanzamiento, bugs abiertos, drift) vive en
> `../STATUS.md` (dashboard maestro de `Outboxmain\`, creado 2026-07-18). Acá solo lo local.
>
> **Pre-lanzamiento:** Outbox nunca salió a producción. Aparte del entorno de pre-lanzamiento
> que responde en `out-box.dev`, lo publicado del ecosistema es este repo en GitHub (`main` en 1.5.1, último push 2026-08-05) y `@out-box/cli` en npm
> (hasta 0.8.0).

## Estado actual

- Skill **`outbox-publish` 1.7.0** (local, 2026-09-30; GitHub `main` sigue en 1.5.1
  hasta que se publique) — instalable via skills.sh
  (`npx skills add jonathanleiva15/out-box-skills`). Repo `package.json` 0.4.0.
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
- Siguen sin documentar: password por pagina, reacciones, vistas/stats, passphrase de
  share, registry de agentes (solo el step-up de `instantiate`) y la gestion de uploads
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

- Publicar el repo y subir `capabilities.clients.skill.latest` (worker, hoy `1.5.1`) a
  `1.7.0` en el mismo release, para que `outbox skill update` detecte el bump.
- **Drift a vigilar** (codigo del worker sin deployar; re-sincronizar si cambia):
  - ~~`secretScan.appliesTo` = `['dailyAppend']`~~: el critico cableo publish y
    publish-from-template y actualizo la skill (regla 5, `content.md`, `api-reference.md`).
  - ~~`Idempotency-Key` en append y comentarios~~: el worker ya los envuelve (pasada 4) y la
    skill lo refleja condicionado a `features.idempotencyEndpoints` (`SKILL.md`, loop
    central; `content.md` con `dailyAppend`/`comment`; `api-reference.md` en el append).
  - `features.idempotency` esta en `true` por coordinacion entre unidades: si vuelve a
    `false`, la skill ya condiciona el replay a ese flag.
  - MCP remoto y plugin: cuando `clients.mcpRemote.available` pase a `true`, quitar el
    "proximamente" de `SKILL.md` (regla 10), `sharing-and-keys.md` y `README.md`. Si el
    remoto renombra o cura tools, revisar las menciones de tools en `comments.md`,
    `page-data.md` y la tabla de toolsets.
  - Uploads manage (`GET /api/uploads`, `DELETE /api/uploads/:hash.:ext`,
    `POST /api/uploads/gc`): ya montadas (`features.uploadsManage: true`); falta
    documentarlas en la skill. El DELETE y el GC con `apply` exigen `delete:<user>` amplio.
- Precio del tier `unlimited`: decision humana pendiente. La skill ya no lo hardcodea
  (remite a `/pricing`); no volver a poner un monto.
- Re-sincronizar `dailyDocsMax` y demas limites de tier si cambian en `lib/tier-limits.ts`
  (la tabla de `api-reference.md` usa los caps actuales; caps por tier = decision pendiente).
- Verificar que el nombre del paquete MCP referenciado siga siendo `@out-box/mcp`.
