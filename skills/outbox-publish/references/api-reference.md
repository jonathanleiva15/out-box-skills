# Outbox API — referencia tecnica (cliente agente)

Referencia de los endpoints relevantes para un **agente cliente** que publica,
lee, actualiza y gestiona paginas con una API key `outbox_*`. Derivada del backend
real (`out-box/worker/src/handlers` + `worker/src/lib`). Incluye Fase 3A (B1–B15) y
Teams v2 (membership, delegacion de keys, acceso, transfer/delete, plantilla y dominio
del org, billing del org). Fecha: 2026-06-21.

- **Base API**: `https://api.out-box.dev`
- **Auth**: `Authorization: Bearer $OUTBOX_API_KEY` (API key long-lived del
  usuario, leida de `~/.outboxrc` o de la env var `OUTBOX_API_KEY`; nunca se
  hardcodea ni se loguea) en todo endpoint autenticado.
- **HTML publico** se sirve desde la zona `https://out-box.dev/<user>/<slug>`
  (**SIN `/u/`** — el `/u/...` legacy 301-redirige al canonico).
- No incluye endpoints solo-browser (OAuth, billing **personal**, admin
  invites/waitlist) ni huerfanos sin uso de cliente. Solo lo accionable por un agente
  con key. (El billing **del org** SÍ se documenta en "Teams / Orgs", como early access.)

## Convenciones globales

- El `user` del path `/api/u/<user>/...` debe ser el dueno de la key. Cross-user → `403`.
- El `user`/`owner` en el body se ignora; el path R2 sale del `Principal`.
- `publishedByLabel` es read-only (auto-derivado de `key.label`). No enviarlo.
- `model` es OBLIGATORIO en publish/publish-from-template (`400 missing_model`).
- Errores: JSON `{ "error": "<code>" }` (+ campos extra segun caso).

### Codigos de error transversales

| Status | `error` | Cuando |
|---|---|---|
| 401 | `missing_auth` | falta header `Authorization` o `Bearer ` |
| 401 | `invalid_key` | key no existe en KV |
| 401 | `key_revoked` | key revocada (`revokedAt`) |
| 401 | `key_expired` | key expirada |
| 403 | `forbidden` | falta scope; trae `missingScope` o `missingAnyOf` |
| 403 | `scope_escalation` | al crear key se pidio un scope fuera del subset |
| 403 | `cross_user_*` | el `<user>` del path no es el dueno de la key |
| 400 | `missing_model` | falta `model` en publish/publish-from-template |
| 400 | `invalid_visibility` | `visibility` presente pero invalida |
| 400 | `invalid_ttl` | `ttl` con formato/rango invalido |
| 400 | `invalid_scope_format` | scope con formato no `verb:user[:mod\|f/folder]` (incluye folder invalido tras `f/`: vacio, `..`, `//`) |
| 403 | `unknown_user` | el owner de la key no resuelve a un `UserRecord` (flujo de quota en publish/append) |
| 413 | `html_too_large` | HTML sobre el limite por tier (free 10MB, pago hasta 25MB) en `/publish` |
| 413 | `data_too_large` · `block_too_large` · `upload_too_large` | data > 64KB (publish-from-template), bloque > 50KB (daily append), upload > 10MB |
| 413 | `storage_limit` | el storage TOTAL del tier (`storageGB`) se agotaria con el write; gate best-effort antes de cada write a R2 (publish, daily append, upload). Trae `message` + el bloque CTA |
| 403 | `keys_limit` | el user alcanzo `agentKeysMax` keys activas de su tier al crear una key (`POST /api/keys`, `POST /api/keys/agent`). Trae `message` + el bloque CTA |
| 403 | `daily_docs_limit` | slug nuevo para el dia y se supera `dailyDocsMax` (o tier con limit 0). Trae `message`, `active[]` + el bloque CTA |
| 403 | `daily_updates_limit` | el daily ya alcanzo `dailyUpdatesPerDay` appends/updates en el dia. Trae `message` + el bloque CTA |
| 429 | `rate_limited` | quota excedida; body `{ error, scope, retryAfter, used, limits }` + el bloque CTA + header HTTP `retry-after` |

#### Shape comun de las respuestas de limite (CTA de upgrade)

Todas las respuestas de limite (`429 rate_limited`, `403
daily_docs_limit`/`daily_updates_limit`/`keys_limit`, `413
html_too_large`/`storage_limit`) incluyen — **ademas** de los campos legacy de cada
gate (`error`, `message`, `retryAfter`, `used`, `limits`, `active`, ...) — un bloque
TIPADO consistente que el cliente puede renderizar como "subi a `<tier>`" sin parsear
strings:

```jsonc
{
  "error": "storage_limit",     // discrimina el gate (= el codigo de la tabla)
  "limit": 107374182,           // tope numerico del tier ACTUAL para esa dimension
  "used": 104857600,            // valor actual consumido (publishes / keys / bytes / ...)
  "tier": "free",               // tier actual del user
  "upgradeTo": "pro",           // proximo tier que LEVANTA este limite (null si ya en el techo)
  "ctaUrl": "https://out-box.dev/pricing",  // null si no hay upgrade posible
  "message": "..."              // legacy: copy human-readable del gate
}
```

El contrato es **ADITIVO**: los campos legacy se preservan tal cual (clientes viejos
los siguen leyendo). `upgradeTo`/`ctaUrl` quedan `null` cuando el user ya esta en el
tier que es techo para esa dimension (`unlimited`). Nota: `rate_limited` manda `used`
como objeto `{ hour, day }` (shape legacy), pisando el `number` del bloque CTA.

---

## Auto-descubrimiento

### GET /api/capabilities
**Publico** (sin auth). Describe que soporta el back para que clientes (CLI, MCP,
skill, rust, front) se autoconfiguren sin hardcodear. `cache-control: public,
max-age=300`. Forma versionada con `version` (actual **3**; forward-compat — tolera
campos nuevos).

Devuelve, entre otros: `apiBase`/`siteBase`, `verbs`, `scopeFormat`,
`scopeDefaults` (human/agent/claim), `visibility` (values, default `private`, ttl,
`inheritFolderVisibility`), `contentMeta` (`modelRequired: true`, limites),
`uploads`, `templates.brandPresets` (los 6) + `count`, `tiers` (incluye el tier
`unlimited` y el campo `dailyUpdatesPerDay`), `publishLimits`, `endpoints`, y
`features`.

- **`endpoints`** incluye `export: "GET /api/u/:user/:slug/export"` y
  `squash: "POST /api/u/:user/:slug/squash"` (ademas de publish,
  publishFromTemplate, list, me, recent, uploads, capabilities).
- **`features`** declara: uploads, exportJson, exportTarGz (`false`, diferido),
  ttlVisibility, feedPrefixVersion, dailyDocs, versioning, grants, shareTokens,
  folderScopedKeys, deviceFlowClaim, quotaAtomicDO, comments, suggestions,
  accessView, widget, **`squash: true`** (poda de historial menos current),
  **`publicExport: true`** (export de posts publicos por no-owners, auth opcional) y
  **`markdown: true`** (publish acepta `markdown`, se renderiza a HTML seguro).
- **`publishFormats`**: `["html", "markdown"]` — formatos de fuente aceptados por
  `POST /publish` (excluyentes). El post expone `sourceFormat` en su meta.

---

## Contenido / publicacion

### POST /publish
Publica una pagina con `html` crudo **O** `markdown`. **Scope** `publish:u` + quota.
Peso max **por tier** (free 10MB, pago hasta 25MB); limite vivo en
`/api/capabilities.publishLimits` o `tierLimits.htmlMaxBytes` de `/api/me`.

**Dos formatos de fuente (excluyentes — manda UNO):**
- `html`: HTML crudo, se sirve **tal cual** (vos controlas el documento completo).
- `markdown` (agents-first): el back lo renderiza a **HTML seguro** (escapa todo el
  texto + allowlist de tags → imposible inyectar `<script>`; URLs `javascript:`/`data:`
  se degradan a texto) y lo **envuelve en tu template** (o en el shell de marca si no
  tenes uno). Guarda el `.md` **fuente** para el round-trip (`export` lo devuelve) y
  marca `meta.sourceFormat: "markdown"`. Es el camino natural del agente: escribis md,
  Outbox pone la presentacion.

Mandar AMBOS → `400 conflicting_content`. No mandar NINGUNO → `400 missing_content`.

Body:
```jsonc
{
  "html": "<!doctype html>...",        // requerido SI no mandas markdown; <= limite por tier
  "markdown": "# Titulo\n\nTexto...",  // alternativa a html (excluyente): se renderiza + envuelve en template/marca
  "slug": "mi-slug",                   // opcional; default nanoid(8). [A-Za-z0-9_-]{1,64} por segmento, <=6 niveles, <=200 chars totales
  "title": "Titulo",                   // opcional
  "tags": ["a", "b"],                  // opcional
  "visibility": "private",             // opcional: private(DEFAULT) | unlisted | public
  "owner": "procontacto",              // opcional (Teams F1): publica bajo el namespace de un ORG. omitido = namespace propio. canonico, sino 400 invalid_owner. requiere ser miembro (sesion) o company key del org
  "inheritFolderVisibility": false,    // opcional (B2): opt-in herencia de folder. default false
  "ttl": "24h",                        // opcional (B10): <int><s|m|h|d|w>, max 1 ano. degrada a private (solo no-private)
  "branding": "full",                  // opcional: "full" aplica template per-user | "none" HTML crudo
  "skipTemplate": false,               // opcional: equivalente a branding "none"
  "notifySlack": "#joni",              // opcional: canal Slack a notificar (si configurado)
  // ContentMeta:
  "model": "claude-opus-4-8",          // OBLIGATORIO (400 missing_model si falta)
  "summary": "<=280 chars",            // recomendado; fallback no-IA si falta
  "description": "<=2000 chars",
  "contentType": "<=40 chars",
  "meta": { "k": "v" }                 // <=10 keys, total <=4KB
}
```
Respuesta `200` (`PublishResponse`):
```jsonc
{
  "url": "https://out-box.dev/u/<user>/<slug>",
  "slug": "<slug>",
  "version": 3,                        // sube en cada publish al mismo slug
  "visibility": "private",
  "expiresAt": null,                   // B10: instante del TTL de visibility (null si no hay)
  "ogImage": "https://out-box.dev/og/<user>/<slug>.png",  // SVG lazy
  "quotaRemaining": { "perHour": 9, "perDay": 99 }
}
```
Notas:
- Re-publicar al **mismo slug** crea una nueva version (`appendVersion`), no borra.
- **Visibility default = `private`** salvo body explicito. La herencia del folder
  solo aplica con `inheritFolderVisibility: true` (recorre el ancestro mas cercano).
- `model` faltante → `400 missing_model`. `user` en body se ignora siempre.
- **Teams F1 — `owner`**: si mandas `owner` con el handle de un ORG, la pagina se
  publica bajo el namespace del org (no el tuyo). Requiere autorizacion: o sos
  **miembro** del org (sesion humana) o usas una **company key** del org. Una agent
  key personal NO escala a un org ajeno. Sin `owner` (o `owner` == tu user) =
  comportamiento historico, cero cambios. Handle no-canonico → `400 invalid_owner`;
  sin permiso bajo el namespace → `403`. Quota/tier/limites de tamaño son los del
  **namespace destino** (el org tiene su propio tier). Para una company key el
  "publish-as-team" es automatico: su namespace propio YA es el del org, no mandes
  `owner`.

Errores de `/publish`:

| Status | `error` | Cuando |
|---|---|---|
| 400 | `invalid_json` | el body no es JSON valido |
| 400 | `missing_content` | no viene ni `html` ni `markdown` (ambos vacios/ausentes) |
| 400 | `conflicting_content` | vienen `html` Y `markdown` a la vez (excluyentes) |
| 400 | `invalid_slug` | slug fuera de `[A-Za-z0-9_-]{1,64}` por segmento / >6 niveles / >200 chars |
| 400 | `missing_model` | falta `model` |
| 413 | `html_too_large` | HTML sobre el limite por tier |
| 413 | `storage_limit` | el storage TOTAL del tier (`storageGB`) se agotaria con el write; trae `message` + el bloque CTA |
| 403 | `unknown_user` | el owner de la key no resuelve a un usuario |
| 429 | `rate_limited` | quota excedida |

**Errores de ContentMeta** (aplican a `/publish`, `/api/publish-from-template` y al 1er append de un daily; todos `400`):

| `error` | Cuando |
|---|---|
| `missing_model` | falta `model` |
| `model_too_long` | `model` > 64 chars |
| `invalid_model` | `model` no matchea `[a-z0-9_-./:]` (case-insensitive) |
| `summary_too_long` | `summary` > 280 chars |
| `description_too_long` | `description` > 2000 chars |
| `contentType_too_long` | `contentType` > 40 chars |
| `invalid_contentType` | `contentType` no matchea `[a-z0-9_-]` |
| `invalid_type` | un campo de ContentMeta tiene tipo errado |
| `meta_too_many_keys` | `meta` con > 10 keys |
| `meta_invalid_key` | key no empieza con letra o > 40 chars (identifier-style) |
| `meta_value_too_long` | un valor string de `meta` > 500 chars |
| `meta_invalid_value` | valor de `meta` no es string/number/boolean |
| `content_meta_too_large` | ContentMeta serializada > 4KB |

### POST /api/publish-from-template
Renderiza un template del catalogo server-side. **Scope** `publish:u` + quota.
Data max **64KB**. Mismas reglas de ContentMeta que `/publish` (`model` obligatorio).

Body:
```jsonc
{
  "template": "status-report",         // status-report|daily-briefing|repo-diff|kpis-snapshot|custom
  "data": { /* datos del template, <=64KB */ },
  "slug": "...",                       // opcional
  "visibility": "unlisted",            // opcional (default private)
  "inheritFolderVisibility": false,    // opcional
  "ttl": "7d",                         // opcional
  "model": "...",                      // OBLIGATORIO
  "summary": "...", "contentType": "..."
}
```
`slug` opcional: mismo patron que `/publish` (`[A-Za-z0-9_-]{1,64}` por segmento, <=6 niveles, <=200 chars). `inheritFolderVisibility` y `ttl` tambien aplican (igual que `/publish`).

Respuesta: igual a `/publish`. Errores:

| Status | `error` | Cuando |
|---|---|---|
| 413 | `data_too_large` | `data` serializada > 64KB |
| 400 | `invalid_template` | `template` no es uno de los 5 content-templates |
| 400 | `missing_field` / `invalid_field` | campo requerido del template ausente / invalido (trae `field`) |
| 400 | `invalid_slug` | slug fuera del patron |
| 400 | `missing_model` | falta `model` (+ resto de errores de ContentMeta) |

### GET https://out-box.dev/&lt;user&gt;/&lt;slug&gt;
Lee el HTML servido (zona publica, **SIN `/u/`**; el `/u/...` 301-redirige). Visibility:
- `private`: requiere Bearer del owner, o `?share=<token>`, o grant valido. Sino `404`.
- `unlisted`/`public`: libre.
- **Siempre sirve la version actual.** El handler (`serve.ts`) NO lee ningun query
  param `version`: **`?version=N` no existe** y se ignora en silencio (recibis la
  version actual). Para una version anterior: `GET /api/u/<user>/<slug>/versions`
  (indice) + `POST .../rollback` `{ "to": N }` (restaurar) — ver seccion Versiones.
- `?date=YYYY-MM-DD` en un slug daily: sirve los bloques de ese dia.
- `?share=<token>`: acceso a una pagina private via share token.

El HTML servido por la zona publica lleva inyectado un **widget overlay** self-contained
(rol-aware owner vs read-only) al final del `<body>`: **no es byte-identico al persistido**.
Para el HTML crudo usar `GET /api/u/<user>/<slug>/export?format=html`.

### GET /api/u/&lt;user&gt;/&lt;slug&gt;/export?format=json|html
**B9** — export machine-readable. **Auth OPCIONAL** (ya NO es owner-only).
- `format=json` (default): `{ user, slug, title, tags, visibility, version, model,
  summary, description, contentType, sourceFormat, meta, createdAt, updatedAt, contenido }`
  (`contenido` = HTML crudo persistido; `sourceFormat` = `"markdown"` o `"html"` segun
  como se publico — si es markdown, el `.md` fuente esta en R2 para re-publicar).
- `format=html`: el HTML crudo (`text/html`).
- `tar.gz` diferido. Para content-templates devuelve el HTML renderizado.

**Acceso:**
- **Owner** (auth Bearer/sesion que coincide con `<user>`): exporta **cualquier**
  visibility de lo suyo. Exige verb scope `publish:u` (folder-aware) — folder-scoped
  fuera de su folder → `403 slug_not_under_allowed_folder` (con `message`).
- **Export publico** (no-owner): si la visibility **EFECTIVA** (post-degradacion
  TTL) es `public`, **cualquier** caller lo exporta — incluso **sin auth** o con la
  key de otro user (el export ya devuelve raw, equivalente a leer el HTML publico).
- `unlisted`/`private` de **otro** user → `403 cross_user_export_forbidden`. Un
  `public` con TTL vencido degrada a `private` → `403`.
- `404 not_found` si falta el `.html`/`.meta.json` (un no-owner sobre slug
  inexistente recibe `404`, no filtramos existencia). `500 corrupt_meta` si el meta
  no parsea. `400 invalid_format` si `format` no es `json`/`html`. `400
  invalid_user`/`invalid_slug`.

---

## Uploads (binarios)

### POST /api/uploads
**B7** — sube una imagen al namespace para referenciarla desde el HTML.
**Scope** `upload:u`. Max **10MB**.
- Acepta multipart/form-data (campo `file`) **o** body crudo con content-type `image/*`.
- Solo rasterizados validados por magic bytes: **PNG, JPEG, GIF, WebP**. **SVG
  rechazado** (`415 unsupported_media_type`). Dedup por SHA-256 (idempotente).
- Respuesta `201` (nuevo) / `200` (deduped):
  ```jsonc
  { "ok": true, "hash": "<sha256>", "contentType": "image/png", "ext": "png",
    "size": 12345, "deduped": false,
    "url": "https://out-box.dev/api/u/<user>/_uploads/<hash>.png",
    "path": "/api/u/<user>/_uploads/<hash>.png" }
  ```
- `413 upload_too_large` · `415 unsupported_media_type`.
- `400 empty_upload` (body de 0 bytes) · `400 missing_file_field` (multipart sin campo `file`) · `400 invalid_multipart` (multipart malformado).
- **Scope** `upload:u` es folder-aware: una key folder-scoped `upload:u:f/<folder>` tambien pasa el check del verb (igual que publish/delete/list).

### GET /api/u/&lt;user&gt;/_uploads/&lt;hash&gt;.&lt;ext&gt;
Sirve el binario. **Publico** (sin auth; el hash es capability token). Inmutable
(cache 1 ano). No pasa por el pipeline de visibility.

---

## Versiones

### GET /api/u/&lt;user&gt;/&lt;slug&gt;/versions
Lista versiones. **requireAuth**. Cross-user → `403`. Sin indice → `404 no_versions`.

### GET /api/u/&lt;user&gt;/&lt;slug&gt;/diff?from=N&to=M
Diff entre dos versiones. **requireAuth**. Cross-user → `403`. `from`/`to` deben ser
safe-int `>= 1`, sino `400 invalid_versions` (plural). Version inexistente →
`404 version_not_found`. Respuesta: `{ slug, from, to, added, removed, preview }`.

### POST /api/u/&lt;user&gt;/&lt;slug&gt;/rollback
Vuelve a una version. **Scope** `publish:u` (**folder-aware**: una key folder-scoped
solo puede hacer rollback de slugs bajo su folder, sino `403 slug_not_under_allowed_folder`
con `allowedFolders`). Parametro en **body** (no query):
```json
{ "to": 2 }
```
Errores: `400 invalid_version` (singular; `to` ausente/no-int/<1), `400 invalid_json`
(body no parsea), `400 invalid_slug`, `404 version_not_found`, `403 cross_user_forbidden`.
Exito: `{ ok: true, current }`. (Nota: `diff` usa `invalid_versions` plural, rollback
`invalid_version` singular.)

### POST /api/u/&lt;user&gt;/&lt;slug&gt;/squash
Poda el historial de versiones para **liberar storage**: borra de R2 los
`<slug>.v<N>.html` que ya no se conservan y reescribe el `.versions.json`. Cada
version es una copia COMPLETA del HTML; un slug muy editado (ej. un daily
republicado a diario) crece sin techo en historial — squash recorta a lo vigente.
**Scope** `publish:u` (**folder-aware**, mismo check que rollback: folder-scoped
fuera de su folder → `403 slug_not_under_allowed_folder` con `allowedFolders`).
Cross-user → `403 cross_user_forbidden`.

Body opcional (tolera body vacio / no-JSON → `keepOriginal: false`):
```jsonc
{ "keepOriginal": false }   // false (DEFAULT): conserva SOLO la version current
                            // true: conserva current + la version original (la mas vieja)
```
- `keepOriginal: false` (default) hace un override **explicito** del pin del
  original que respeta la poda automatica del publish — el owner pidio liberar todo
  el historial salvo lo vigente. La version `current` NUNCA se borra (es la que se
  sirve como `<slug>.html`).
- `keepOriginal: true`: conserva `current` + el original; si `current` YA es el
  original, queda una sola version.

Exito `200`: `{ ok: true, kept: [N, ...], removed, freedBytes }` — `kept` son los
numeros de version conservados (ascendente), `removed` cuantos `.v<N>.html` se
borraron, `freedBytes` la suma de `contentSize` de las borradas (estimado del
indice, no re-lee R2; `0` si no se borro nada). Sin indice de versiones →
`404 no_versions`. La poda es **irreversible**.

---

## Visibility

### PUT /api/u/&lt;user&gt;/&lt;slug&gt;/visibility
Cambia la visibility de una pagina. **Scope** `publish:u` (folder-aware). Cross-user → `403`.
```json
{ "visibility": "public" }
```
Valores: `private | unlisted | public`. Invalida → `400 invalid_visibility`.
Respuesta: `{ ok, slug, visibility, previousVisibility }`.

---

## Feed de cambios

### GET /api/u/&lt;user&gt;/recent
**B11** — feed JSON de cambios. **Publico** (el owner ve sus private autenticado).
- `?since=<ISO>` — solo paginas con `updatedAt > since`.
- `?slug=<slug>` — seguir-pagina (slug exacto). Gana sobre `prefix`.
- `?prefix=<folder>` — seguir-folder (indice del folder + sub-paginas).
- Cada item trae `version`, `url` (`https://out-box.dev/<user>/<slug>`), y
  ContentMeta. La respuesta trae **ETag** debil; si mandas `If-None-Match` igual
  → `304` sin body.

---

## Daily documents

### POST /api/u/&lt;user&gt;/&lt;slug&gt;/append
Agrega un bloque fechado a un daily. **Scope** `publish:u` + quota + tier
`dailyDocsMax`. Bloque max **50KB**.
```jsonc
{
  "html": "<p>bloque</p>",             // requerido, <=50KB
  "label": "10am",                     // opcional
  "ts": "2026-05-30T13:00:00Z",        // opcional, timestamp del bloque
  "visibility": "private",             // opcional (al crear el daily)
  "title": "...",                      // opcional
  "project": "Outbox",                 // opcional, <=64 chars (manifest-level, agrupa en el indice)
  "model": "...", "summary": "...", "contentType": "..."  // ContentMeta manifest-level (1er append)
}
```

**Atribucion por bloque (server-side, NUNCA del body)**: cada bloque guarda
`authorLabel` (etiqueta de la key que appendo) + `authorKind` (`agent` | `human`,
el tipo de la key). Varias keys con etiquetas distintas → varios contribuidores en
el mismo daily. El manifest tambien acumula `preview` (texto plano del ultimo bloque,
para la card del indice).
Respuesta: `{ blockId (blk_*), totalBlocks, version, url, date }` — `date` es la
clave del dia UTC (`YYYY-MM-DD`) en que cayo el bloque (la rotacion es por fecha UTC).
El `url` es la forma canonica `https://out-box.dev/<user>/<slug>` (**SIN `/u/`**, a
diferencia del `url` de `/publish` que viene con `/u/`).

**ContentMeta en el primer append**: `model` es OBLIGATORIO en el PRIMER append (crea
el manifest) → `400 missing_model`; `summary` requerido pero con fallback no-IA derivado
de `title`/`html`. En appends posteriores ambos son opcionales (last-write-wins, no se
borran si faltan).

Errores:

| Status | `error` | Cuando |
|---|---|---|
| 409 | `conflict_with_static_post` | el slug ya es un HTML estatico |
| 403 | `daily_docs_limit` | slug nuevo para el dia y se supera `dailyDocsMax` (o tier con limit 0); trae `{ message, active[] }` + el bloque CTA |
| 403 | `daily_updates_limit` | el daily ya alcanzo `dailyUpdatesPerDay` appends/updates en el dia (se enforce en CADA append, no solo el 1ro); trae `message` + el bloque CTA |
| 413 | `storage_limit` | el storage TOTAL del tier (`storageGB`) se agotaria con el bloque; trae `message` + el bloque CTA |
| 400 | `invalid_body` | body no parsea |
| 400 | `invalid_html` | `html` no-string o vacio |
| 413 | `block_too_large` | bloque > 50KB (trae `maxBytes`) |
| 400 | `invalid_ts` / `invalid_label` (label >64) / `invalid_visibility` / `invalid_title` (title >200) | campo invalido |
| 400 | `invalid_project` | `project` no-string o > 64 chars |
| 400 | `missing_model` | falta `model` en el 1er append (+ resto de errores de ContentMeta) |

### GET /api/u/&lt;user&gt;/&lt;slug&gt;/blocks?date=YYYY-MM-DD
Devuelve el **manifest completo** del daily (NO un array crudo de blocks), con el
**`html` de cada bloque inlineado**. **Scope** `list:u`. `date` opcional; sin `?date`
→ el **dia mas reciente** con bloques (no solo hoy UTC). Respuesta (`DailyManifest`):
```jsonc
{ "user", "slug", "date", "blocks": [{ "id", "ts", "size", "label?", "html",
    "authorLabel?", "authorKind?" }], "createdAt", "updatedAt", "version",
  "visibility", "title?", "project?", "preview?", "model?", "summary?",
  "description?", "contentType?", "meta?", "publishedByLabel?", "publishedByKind?" }
```
No existe → `404 daily_not_found` (con `{ user, slug, date }`); `?date` invalido → `400 invalid_date`.

### GET /api/dailies
**Indice global** de TODOS tus daily docs (el `user` sale del auth, NO del path —
no lleva slug). **Scope** `list:u` sobre tu propio user. Una entrada por slug (su
fecha mas reciente), enriquecida. Respuesta:
```jsonc
{ "user", "dailies": [{
    "slug", "date", "title?", "blockCount", "visibility", "updatedAt",
    "activeToday",                 // la fecha mas reciente es hoy (UTC) → documento vivo
    "contributors": [{ "label", "kind" }],   // dedup por etiqueta de key
    "project?", "preview?" }] }
```
Util para listar/agrupar por proyecto o filtrar los activos hoy. Sin dailies → `{ user, dailies: [] }`.

### GET /api/u/&lt;user&gt;/&lt;slug&gt;/dailies?days=N
Historial de dias del daily (liviano, sin blocks). **Scope** `list:u`. Solo existe la
forma **con slug**. `days` default 7, se clampa a max 90; `days < 1` → `400 invalid_days`.
Respuesta: `{ user, slug, dailies: [{ date, blockCount, updatedAt, version }] }`.

### DELETE /api/u/&lt;user&gt;/&lt;slug&gt;/blocks/&lt;blockId&gt;
Borra un bloque (`blockId` con prefijo `blk_`). **Scope** `delete:u`. Respuesta:
`{ remainingBlocks, version }`. Errores: `404 daily_not_found`, `404 block_not_found`,
`400 invalid_date`, `400 invalid_path`.

---

## Listado y busqueda

### GET /api/list
Lista paginas del owner. **Scope** `list:u`. Query:
- `?tag=` — filtra por tag · `?limit=` — 1-200 (default 50).
- `?depth=` — entero en **[1, 3]** (fuera de rango → `400 invalid_depth`). `depth=1`
  (default): shape `{ ..., posts: [] }`. `depth>=2`: `{ ..., depth, tree: [] }`.
- `?shared=1` — recursos compartidos con el caller (cada item trae `sharedBy`).
- `?cursor=` — cursor opaco de R2 para paginar.

Respuesta (depth=1): `{ user, count, truncated, cursor, posts }`. **`cursor`** es el
cursor de la proxima pagina o `null` si no hay mas; `truncated = (cursor !== null)`.
Para traer todo, repetir con `?cursor=<cursor>` hasta `cursor: null`.

La paginacion por `cursor` aplica **solo al listado propio**. En `?shared=1` la
respuesta es `{ user, shared:true, count, truncated, posts }` (**sin `cursor`**;
`truncated` siempre `false` en v1).

Cada item de `posts[]` incluye (ademas de `slug`, `url`, `title`, `tags`, etc.):
- `publishedByLabel` (string, opcional): label del key que publico la ultima version. Ausente en posts pre-2026-05-27.
- `publishedByKind` (`"agent"` | `"human"`, opcional): tipo del principal que publico. Para posts legacy se deriva de `publishedByLabel` (`"browser-session"` ⇒ human, otro label ⇒ agent, sin label ⇒ ausente).
- `openComments` (number): cantidad de comentarios top-level con `status: "open"` (excluye resueltos/descartados y respuestas).

### GET /api/u/&lt;user&gt;/search?q=&lt;query&gt;
Busca por metadata (title/slug/tags, no fulltext). Publico (el owner ve sus
private si va autenticado). Devuelve hasta **50 resultados** (tope fijo, no
configurable), ordenados por score descendente. El unico query param leido es `q`.
- `q` > 200 chars → `400 query_too_long`.
- `q` vacio → `{ user, query: "", count: 0, results: [] }` (`200`, no error).

### GET /api/u/&lt;user&gt;/manifest
Lista completa de paginas del namespace (publico, owner-aware), complemento de
search/recent. Respuesta: `{ user, scope, count, lastUpdated, posts[] }` donde cada
post incluye `contentSize`.

### GET /api/folders y /api/folders/&lt;prefix&gt;
Lista folders. **Scope** `list:u` (GET raiz) / `requireAuth` (GET por prefix).
`?depth` opt-in para arbol (rango `[1,3]`, fuera → `400 invalid_depth`).
- GET raiz → `{ folders: [{ slug, count, visibility|null, declaredByKey? }] }` (con
  `?depth>=2` agrega `{ depth, tree }`).
- GET por prefix → la `FolderMetadata` directa, o `404 not_found`. Prefix con formato
  invalido → `400 invalid_prefix`.

### PUT /api/folders/&lt;prefix&gt;
Setea metadata/visibility de un folder. **Scope** `folder:u` o `template:u`
(folder-aware). Emite `PUT` (aunque algun cliente lo llame "patch"). No es
retroactivo: solo afecta publishes nuevos que opten por heredar.
```jsonc
{
  "visibility": "public",   // REQUERIDO: private|unlisted|public. Ausente/invalida → 400 invalid_visibility
  "title": "...",           // opcional (tipo invalido → 400 invalid_title)
  "description": "..."      // opcional (tipo invalido → 400 invalid_description)
}
```
Respuesta: `{ ok: true, meta: { prefix, owner, title?, description?, visibility, createdAt, updatedAt } }`.

### DELETE /api/folders/&lt;prefix&gt;
Borra solo la **metadata** del folder (el `_folder.json`); los posts hijos permanecen.
**Scope** `folder:u` o `template:u` (folder-aware, mismo check que PUT). Respuesta:
`{ ok: true, deleted: "<prefix>" }`.

---

## Brand preset / template per-user

Los **6 brand presets**: `paper | minimal | corporate | dark | brutalist | editorial`.

### PUT /api/me/style
**B3** — cambia el brand preset preferido (`stylePreference`) SIN re-aplicar el HTML.
**Scope** `template:u`. Acepta TRES campos combinables (solos o juntos):
```jsonc
{
  "stylePreference": "dark",   // uno de los 6 IDs → 400 invalid_stylePreference
  "widgetColor": "#1a73e8",    // 'auto' | #rrggbb → 400 invalid_widgetColor
  "widgetTheme": "dark"        // 'auto' | 'light' | 'dark' → 400 invalid_widgetTheme
}
```
Si no vino NINGUN campo valido → `400 invalid_stylePreference`. Si el user no existe →
`404 user_not_found`. La respuesta **refleja solo los campos enviados**:
`{ ok, stylePreference?, widgetColor?, widgetTheme? }`. `stylePreference` se expone
siempre en `GET /api/me`.

### GET /api/template
Devuelve el template HTML del owner. **Scope** `template:u`.

### PUT /api/template
Setea el template. **Scope** `template:u`. **Content-Type `text/html`**, body = HTML.
Debe contener `{{content}}` (soporta `{{title}}`, `{{date}}`, `{{author}}`). Max **1MB**.

### DELETE /api/template
Borra el template. **Scope** `template:u`.

### POST /api/template/from-catalog
Instala un brand preset del catalogo. **Scope** `template:u`.
```json
{ "templateId": "dark" }
```
`templateId` debe ser uno de los **6 brand presets** (no un content-template) →
`400 invalid_templateId`. Si el preset no existe en R2 → `404 template_not_found`;
body no parsea → `400 invalid_json`. Respuesta: `{ ok: true, templateId }`. Ademas
actualiza `stylePreference` (equivale a aplicar el preset + persistir la preferencia).

### GET /api/templates/catalog  ·  GET /api/templates
**DOS catalogos DISTINTOS**, ambos **publicos** (sin auth):
- **GET /api/templates/catalog** → los **6 brand presets** visuales
  (`paper | minimal | corporate | dark | brutalist | editorial`).
- **GET /api/templates** → los **5 content templates** de `publish-from-template`
  (`status-report | daily-briefing | repo-diff | kpis-snapshot | custom`), cada uno con
  `id`, `description`, `requiredFields`, `optionalFields`. `publish-from-template` consume
  SOLO este catalogo (los content-templates NO viven en `/api/templates/catalog`).

---

## Compartir — las 3 formas

### 1. Hacer publica
`PUT /api/u/<user>/<slug>/visibility` con `{ "visibility": "public" }` (o publicar
con `visibility: "public"`). Aparece en el feed Atom.

### 2. Crear link (ShareToken)

#### POST /api/share
Link secreto para no-users (sin volver la pagina publica). **Scope** `share:u` o
`template:u` (folder-aware).
```jsonc
{
  "resource": "<slug-o-prefijo>",
  "resourceType": "post",              // "post" | "folder"
  "expiresInDays": 7                   // default 7; null = permanente; rango 1-365
}
```
Respuesta: `{ token, url, ... }`. El `url` se devuelve **CON `/u/`**:
`https://out-box.dev/u/<user>/<slug>?share=<token>` (ese prefijo 301-redirige al
canonico sin `/u/`, preservando el `?share`). Token de folder cascade a descendientes.

#### GET /api/share
Lista tokens propios. **requireAuth**.

#### DELETE /api/share/&lt;token&gt;
Revoca un token. **Scope `admin:self`** (asimetria con POST que pide `share:u`).

### 3. Dar acceso (Grant user-to-user)

#### POST /api/grants
Comparte con un user que tiene cuenta (solo el ve, autenticado). **Scope**
`template:u`. Valida ownership del recurso.
```jsonc
{
  "recipientUser": "<username>",
  "resource": "<slug-o-prefijo>",
  "resourceType": "post",              // "post" | "folder"
  "permissions": ["view"],             // "view" | "comment". "comment" implica "view"
  "expiresInDays": 30,                 // opcional (default 30; null = permanente)
  "message": "..."                     // opcional (<=500 chars)
}
```
`permissions` acepta `"view"` **o** `"comment"`: `comment` implica `view` (el back
agrega `view` automaticamente al set). Cualquier otro valor (ej. `edit`) →
`400 invalid_permissions`. **Load-bearing**: para que un tercero pueda **comentar** un
post `private` compartido (ver Comentarios), el grant DEBE incluir `["comment"]`, no `["view"]`.

#### GET /api/grants  ·  GET /api/grants?incoming=1
Lista grants emitidos (owner) o recibidos (`?incoming=1`). **requireAuth**.

#### DELETE /api/grants/&lt;id&gt;
Revoca un grant (solo owner). **requireAuth**. `id` = 16 hex.

### Auditar el acceso a una pagina

#### GET /api/u/&lt;user&gt;/&lt;slug&gt;/access
Vista inversa del **blast radius**: que/quien tiene acceso a una pagina. **Owner-only**
(cross-user → `403` "access view is owner-only"). Devuelve las keys cuyo scope cubre el
slug, los grants y los share tokens activos (filtra revocados/expirados), cada uno con su
endpoint de `revoke`:
```jsonc
{
  "user", "slug",
  "owner": { "user", "access": "full" },
  "keys": [ { ..., "revoke": { "method", "path" } } ],
  "grants": [ { ..., "revoke": { "method", "path" } } ],
  "shares": [ { ..., "revoke": { "method", "path" } } ],
  "counts": { "keys", "grants", "shares" }
}
```

---

## API keys

### GET /api/keys
Lista las keys propias (sin plaintext). **requireAuth**.

### POST /api/keys
Crea una key con scopes explicitos. **Scope** `genkey:u`. Los scopes pedidos deben
ser subset de los del principal (sino `403 scope_escalation`). Formato invalido →
`400 invalid_scope_format`. Si el user ya tiene `agentKeysMax` keys activas de su
tier → `403 keys_limit` (con `message` + el bloque CTA). Devuelve el plaintext una
sola vez.

### POST /api/keys/agent
Atajo para emitir una **agent key folder-scoped** (delegacion / blast radius
acotado). **Scope** `genkey:u`.
```jsonc
{
  "label": "agente-x",                 // requerido, 1-60 chars
  "folder": "briefings",               // OPCIONAL. con folder → key folder-scoped; sin folder → key BROAD (todo el namespace para los verbs dados)
  "days": 30,                          // 0 = nunca expira (warning_no_expiry); max 365; default 30
  "verbs": ["publish", "list"]         // subset de publish,list,delete,folder,share,template,upload; default ["publish"]
}
```
`folder` es opcional: sin `folder` la agent key sale **BROAD** (scopes sin prefijo `f/`,
ej. `publish:user`), equivalente al default de `POST /api/keys` type=agent; solo con
`folder` queda restringida. Mismo gate de cap que `POST /api/keys`: si el user ya
tiene `agentKeysMax` keys activas → `403 keys_limit` (con `message` + el bloque CTA).
Respuesta completa:
`{ plaintext, keyId, label, type, scopes, rateLimits, expiresAt, folder, days, warning, warning_no_expiry? }`
(`days` es `null` cuando nunca expira).

### POST /api/keys/rotate
Rotacion atomica (genera nueva, revoca vieja). **Scope** `genkey:u`. Con auth de
sesion requiere `keyId` en el body. Errores: `400 keyId_required_for_session_auth`,
`400 invalid_label`, `404 key_not_found`, `409 key_already_revoked`. Si el revoke de la
key vieja falla DESPUES del gen, devuelve `200` con la nueva key + `warning` y
`oldRevokedAt: null` (quedan 2 keys activas temporalmente).

### POST /admin/revoke
Revoca una key. **Scope** `admin:self`. **Path sin prefijo `/api`** (intencional).
```json
{ "keyId": "<id>" }
```

### POST /api/keys/revoke-bulk
Revoca VARIAS keys del owner en una sola request (bulk de `/admin/revoke`). **Scope**
`admin:self`. Body `{ "keyIds": ["<id>", ...] }` (shortKeyIds, máx 100 por request).
Solo revoca keys del propio user (defensa owner-only); deduplica. Respuesta:
`{ ok, revoked: [...], alreadyRevoked: [...], notFound: [...] }`. Errores: `400
missing_keyIds`, `400 too_many_keys`.

### Device flow (conseguir una key desde cero, headless)

#### POST /api/auth/claim/start
**Publico**. Inicia el handoff. Respuesta: `{ claim_token, claim_url, user_code,
verification_uri, verification_uri_complete, expires_in }`. RL 10/IP/h.

#### POST /api/auth/claim/resolve
**B1** — **Publico**, device flow. Body `{ user_code }` → `{ claim_token, status:
"pending", agentLabel? }`. RL **20/IP/h atomico**. NO otorga acceso (solo resuelve
el code al token). `400 invalid_user_code` · `404 unknown_code` · `410`
expirado/no-pending · `429`.

#### GET /api/auth/claim/&lt;token&gt;/status
**Publico**. Polling. Devuelve `{ status: "claimed", api_key, user, keyId }` UNA vez
(luego `410 consumed`). `pending` mientras el usuario no confirma.

---

## Cuenta, uso, auditoria

### GET /api/me
Identidad del principal. **requireAuth**. Devuelve siempre: `user`, `keyId`, `type`
(`human`/`agent`), `scopes[]`, `rateLimits`, `tier`, `tierLimits`, `stylePreference`
(uno de los 6 IDs, null si nunca eligio), `slugWhitelist`, `authSource`,
`subscriptionStatus`, `currentPeriodEnd`, `billingCycle` (estos 3 ultimos `null` hasta
billing). Con auth de sesion agrega ademas `email`/`name`/`avatarUrl`.

### GET /api/me/usage
Consumo vs limites del tier. **requireAuth**. `?refresh=true` fuerza recalculo
(cache 300s). `tier` ∈ `free | pro | pro_plus | team | unlimited`. Respuesta (`UsageResponse`):
```jsonc
{
  "user", "tier",
  "limits": { "publishPerHour", "publishPerDay", "storageGB", "agentKeysMax", "dailyDocsMax", "dailyUpdatesPerDay" },
  "usage": {
    "publishes": { "hour", "day" },
    "storage": { "usedBytes", "usedMB", "limitMB", "pct", "truncated" },
    "posts": { "total", "byVisibility" },
    "keys": { "active", "max" },
    "dailies": { "active", "max" }
  },
  "billing": { /* ... */ },
  "computedAt",
  "cached": false    // true cuando viene de cache (TTL 300s)
}
```

Limites por tier (fuente: `lib/tier-limits.ts`):

| Tier | publish/hora | publish/dia | storageGB | agentKeysMax | dailyDocsMax | dailyUpdatesPerDay |
|---|---|---|---|---|---|---|
| free | 5 | 10 | 0.1 | 1 | 1 | 20 |
| pro | 10 | 100 | 5 | ~unlimited (999) | 3 | 100 |
| pro_plus | 30 | 500 | 25 | ~unlimited (999) | 10 | 300 |
| team | 30 | 500 | 25 | ~unlimited (999) | 999 | 999 |
| unlimited ($50) | 1000 | 20000 | 100 | ~unlimited (999) | 999 | 9999 |

- **`dailyUpdatesPerDay`**: cap de appends/updates por dia a daily docs (DAU cap),
  enforce en CADA append → `403 daily_updates_limit` al superarlo.
- **`unlimited`** ($50, "full libre"): SIN caps de producto, pero con un techo de
  seguridad anti-bot/anti-runaway (numeros altisimos que un humano o agente sano
  nunca toca). Es el techo de la escalera de upgrade individual (`free → pro →
  pro_plus → unlimited`; `team` queda fuera de esa escalera). En `/api/me/usage`,
  `tier` ∈ `free | pro | pro_plus | team | unlimited`.

### GET /api/audit
Eventos de auditoria del owner. **Scope** `audit:self`. Ventana 7 dias. El campo de
accion se expone como `kind` (alias externo de `action`). Respuesta:
`{ user, count, hasMore, nextCursor, events[], windowScannedDays }`. Paginacion real
con `?before=<nextCursor>` (+ `?limit`, default 50 / max 200).

Filtros: `?kind=publish,delete` (CSV; kind invalido → `400 unknown_kind` con campo
`got`), `?since=<ISO>`, `?keyId=<8 hex>`, `?prefix=<folder>`, `?slug=<slug>`. Errores:
`400 invalid_limit` / `invalid_before` / `invalid_since` / `invalid_keyId` /
`invalid_prefix` / `invalid_slug`.

---

## Comentarios y sugerencias

Capa de **anotaciones** sobre una pagina publicada. El HTML del owner NUNCA se modifica por
comentar; los comentarios viven aparte (`<user>/<slug>.comments.jsonl`) y anclan por **texto
visible** (W3C Web Annotation, tag-aware). Dos `kind`: `comment` (anotacion pura) y `suggestion`
(propone reemplazar el texto anclado `anchor.exact` por `replacement`). SOLO **aceptar una
suggestion** (accion del owner) puede publicar una version nueva atribuida.

### GET /api/u/&lt;user&gt;/&lt;slug&gt;/comments
Lista los comentarios y sugerencias de una pagina. **Permisos de lectura**: owner + sus agentes
siempre; un tercero con grant `comment` (o `?share`) en privados; cualquier user autenticado en
`unlisted`/`public`; anonimo con `?share=<token>`.

Respuesta: `{ postOwner, slug, visibility, count, openCount, comments }`. Cada item de `comments[]`:
```jsonc
{
  "id": "<hex>",
  "kind": "comment" | "suggestion",
  "commenter": "<username>",
  "commenterType": "human" | "agent",
  "body": "<texto de la nota>",
  "anchor": { "exact": "<texto visible>", "prefix": "...", "suffix": "..." },
  "replacement": "<texto nuevo>",       // solo en suggestion
  "parentId": "<hex>",                  // solo en respuestas (hilo de 1 nivel)
  "status": "open" | "resolved" | "accepted" | "discarded",
  "createdAt": "<ISO>",
  "resultingVersion": 4                 // version publicada al aceptar (si hubo cambio)
}
```
Filtra `status=open` para pendientes.

### POST /api/u/&lt;user&gt;/&lt;slug&gt;/comments
Crea un comentario o una sugerencia. **Permisos de escritura**: owner + sus agentes; un tercero
necesita grant `comment` (o `?share`).
```jsonc
{
  "kind": "suggestion",                 // "comment" | "suggestion"
  "body": "<por que proponés el cambio>",   // OPCIONAL en suggestion (si hay replacement); OBLIGATORIO en comment (vacio → 400 missing_body)
  "anchor": {
    "exact": "<texto VISIBLE a reemplazar>",  // requerido en suggestion
    "prefix": "...", "suffix": "..."          // opcional, desambigua si se repite
  },
  "replacement": "<texto nuevo>",       // requerido en suggestion (se inserta HTML-escapado)
  "parentId": "<hex>"                   // opcional: respuesta a otro comentario (hilo 1 nivel)
}
```
- El ancla matchea por **texto visible (tag-aware)**: pasas el texto tal como se LEE; el back lo
  localiza contra el HTML aunque haya tags/entidades en el medio. No reproduzcas el markup.
- Suggestion sin ancla/replacement → `400 suggestion_requires_anchor` /
  `400 suggestion_requires_replacement`.
- **Limites del POST**: `429 rate_limited` (30 comentarios/min por identidad; trae
  `retryIn` + header `Retry-After`) · `429 too_many_comments` (tope 500 por post,
  incluye respuestas). Tamanos: `body` ≤4000 (`413 body_too_large`), `anchor.exact`
  ≤2000 (`413 anchor_too_large`), `replacement` ≤8000 (`413 replacement_too_large`).

### POST /api/u/&lt;user&gt;/&lt;slug&gt;/comments/&lt;id&gt;/accept
Acepta una **suggestion**: aplica el `replacement` (HTML-escapado) sobre el texto anclado.
**Owner-only** (`403` si no sos el owner). Solo sobre `suggestion` (sobre un `comment` →
`400 not_a_suggestion`).

Respuesta: `{ ok, comment, version, noChange }`.
- **No siempre publica `vN+1`.** Si el reemplazo cambia el HTML resultante → publica una version
  nueva atribuida (quien propuso + quien acepto) y `noChange` es `false`/ausente.
- **No-op guard:** si el reemplazo NO cambia el HTML resultante → devuelve `{ ..., noChange: true }`,
  marca la suggestion como `accepted` y **NO crea version nueva**.
- `409 anchor_not_found`: el texto ancla ya no esta / cambio (descarta la suggestion con `discard`).
- `409 comment_not_open`: la suggestion ya esta `accepted`/`discarded`/`resolved`.
- `404 post_html_not_found`: falta el `.html` del post.
- `400 not_top_level`: se intenta aceptar una **respuesta** (parentId) en vez de un comentario top-level.

### POST /api/u/&lt;user&gt;/&lt;slug&gt;/comments/&lt;id&gt;/discard  ·  /resolve
Modera un comentario o suggestion. **Owner-only** (`403` si no). `discard` lo marca `discarded`;
`resolve` lo marca `resolved`. Ninguno toca el HTML. Util para limpiar sugerencias obsoletas (ej.
tras un `409 anchor_not_found`). Errores: `409 comment_not_open` (ya cerrado),
`400 not_top_level` (es una respuesta), `404 comment_not_found`.

---

## Borrar

### DELETE /api/u/&lt;user&gt;/&lt;slug&gt;
Borra una pagina. **Scope** `delete:u`. Cross-user → `403`. No recuperable via API.

---

## Teams / Orgs (Teams v2)

Una **empresa** (org) es un `UserRecord{ type:'org', ownerUser }` que vive en el
**mismo keyspace de handles** que las personas (colision de handles gratis: el handle
de un org no puede chocar con el de una persona). Las paginas del org cuelgan de su
namespace igual que las de una persona: `out-box.dev/<handle>/<slug>`.

> **Estado del feature (v2).** Activos: membership, delegacion de keys (`canManageKeys`),
> mint/revoke de company keys, vistas de acceso (efectivo/inverso), transfer, delete,
> plantilla del org, verificacion de dominio por DNS TXT. **Diferido**: dominio propio
> (`POST .../domains` → `503 domain_unconfigured`, falta el binding KV). **Early access**:
> billing del org (checkout/portal pueden dar `503 team_early_access`/`billing_unconfigured`).
> **GAP**: los **grupos** (grp:/gm:) NO tienen endpoints REST — solo se LEEN via los
> `*/access`; no se crean/editan por API todavia.

**Errores transversales de teams** (ademas de los globales):

| Status | `error` | Cuando |
|---|---|---|
| 404 | `team_not_found` | el handle no resuelve a un org |
| 400 | `invalid_handle` | handle del path no canonico `[a-z0-9-]{2,32}` |
| 403 | `not_a_member` | el principal no es miembro del org |
| 403 | `not_owner` | la accion exige ser owner y el principal no lo es |
| 403 | `forbidden` | un miembro no-owner pide algo fuera de su alcance (acceso ajeno / proyecto que no toca) |
| 409 | `handle_taken` | el handle ya existe (persona/org/reservado) al crear |
| 400 | `invalid_role` | `role` distinto de `"member"` al agregar miembro |
| 400 | `cannot_add_org` | el `user` a agregar apunta a un org, no a una persona |
| 400 | `cannot_remove_owner` | se intenta quitar al `ownerUser` |
| 400 | `cannot_modify_owner` | se intenta setear `canManageKeys` sobre el owner |
| 404 | `target_not_member` | el destino de un transfer no es miembro del org |
| 403 | `cannot_manage_keys` | miembro sin `canManageKeys` intenta mintear/revocar company keys |
| 503 | `domain_unconfigured` | `POST .../domains` con el feature dominio-propio diferido (binding KV ausente) |
| 503 | `team_early_access` / `billing_unconfigured` | checkout del org con billing de orgs aun no habilitado |

**Modelo de 3 actores sobre un org:**
- **Humano → miembro** (membership con `grant`): el owner agrega personas; cada una
  publica bajo el namespace del org con su sesion (`body.owner` en `/publish`).
- **Agente → company key** folder-scoped (`KeyRecord.user = handle`): una key del org
  que publica bajo el namespace del org **sin** mandar `owner` (es automatico).
- **Cliente → share link / grant**: terceros sin cuenta via `?share=<token>`, o con
  cuenta via grant — los mismos mecanismos del flujo "Compartir", apuntando a recursos
  del namespace del org.

Todos los endpoints de teams son **requireAuth**. El `user` SALE del principal, NUNCA
del body/query. Mutaciones por sesion-browser exigen CSRF (Bearer no).

### POST /api/teams
Crea un org (el creador queda como **owner** = miembro 0). **Scope** `admin:self`
(solo una sesion humana con namespace propio; una company key jamas tiene `admin:self`).
```json
{ "handle": "procontacto", "name": "ProContacto" }
```
- `handle`: canonico `[a-z0-9-]{2,32}` (misma regla que username) — sino `400 invalid_handle`.
- `name`: opcional, ≤ 80 chars (`400 invalid_name`).
- Colision con persona/org/reservado → `409 handle_taken` (mismo keyspace).
- Cap de orgs por creador: **free = 1**, tier pago = 25 → `403 org_limit`.
- El creador no puede ser un org → `403 creator_not_user`.

Respuesta `201`: `{ handle, name, ownerUser, createdAt }` (`name` = `null` si no se dio).

### GET /api/teams
Lista los orgs de los que el principal es miembro (cualquier rol). **requireAuth**.
Respuesta: `{ teams: [{ handle, name, role, addedAt }] }` (`role` = `owner` | `member`).

### GET /api/teams/&lt;handle&gt;/members
Roster del org. **requireAuth** + el principal debe ser **miembro** (cualquier rol;
`403 not_a_member` si no). Org inexistente → `404 team_not_found`.
Respuesta: `{ handle, members: [{ user, role, addedAt, addedBy }] }`.

### POST /api/teams/&lt;handle&gt;/members
El **owner** agrega un miembro. **requireAuth** + actor-admin (sesion humana o
`admin:self`) + `isOwner` (`403 not_owner`).
```json
{ "user": "santy", "role": "member" }
```
- `user`: handle canonico de una **persona** existente (`400 invalid_user`,
  `404 user_not_found`, `400 cannot_add_org` si apunta a un org).
- `role`: solo acepta `"member"` (o ausente). Otro valor → `400 invalid_role`.
  (el unico owner es `ownerUser`; no se otorga `owner` por aca — para eso, transfer).
- Idempotente: si ya es miembro → `200` sin duplicar ni degradar su rol.

Respuesta: `{ ok: true, user, role }`.

### DELETE /api/teams/&lt;handle&gt;/members/&lt;user&gt;
El **owner** quita un miembro. **requireAuth** + actor-admin + `isOwner`.
- No se puede remover al `ownerUser` → `400 cannot_remove_owner`.
- Idempotente: `200` aunque ya no fuera miembro. Las **company keys del org NO se
  tocan** (son del org, no del ex-miembro).

Respuesta: `{ ok: true, removed: <user> }`.

### PATCH /api/teams/&lt;handle&gt;/members/&lt;user&gt;
**(v2)** El **owner** delega/quita a un miembro la capacidad de gestionar company keys
(`canManageKeys`). **requireAuth** + actor-admin + `isOwner`. Ortogonal al acceso por
proyecto (grupos): solo toca la capacidad de emitir/revocar keys, no escala acceso.
```json
{ "canManageKeys": true }
```
- `canManageKeys` debe ser boolean → `400 invalid_canManageKeys`.
- No se puede setear sobre el owner (siempre puede) → `400 cannot_modify_owner`.
- El target debe ser miembro → `404 not_a_member`.

Respuesta: `{ ok: true, user, canManageKeys }`.

### GET /api/teams/&lt;handle&gt;/members/&lt;user&gt;/access
**(v2)** Acceso **EFECTIVO** de una persona: grupos → proyectos → permisos.
**requireAuth** + el principal debe ser miembro. **Owner** ve el de cualquiera; un
miembro no-owner SOLO el suyo (`user == principal` o `403 forbidden`). El target debe
ser miembro (`404 not_a_member`). `user` no canonico → `400 invalid_user`.
```jsonc
{
  "handle", "user", "role",
  "groups": [{ "groupId", "name", "projects": [] }],
  "allAccess": true,          // true = acceso total (owner / miembro legacy sin grupos)
  "projects": [],             // lista concreta SOLO si !allAccess; vacia si total
  "canManageKeys": false
}
```

### GET /api/teams/&lt;handle&gt;/projects/&lt;prefix&gt;/access
**(v2)** Acceso **INVERSO** de un proyecto (folder prefix): qué grupos lo habilitan, qué
miembros lo tocan y qué company keys del org tienen scope sobre él. **requireAuth** + el
principal debe ser miembro. El **owner** siempre; un miembro no-owner solo si ese proyecto
cae en su acceso efectivo (`403 forbidden`). `prefix` no canonico → `400 invalid_project`.
```jsonc
{
  "handle", "project",
  "groups": [{ "groupId", "name", "projects": [], "members": [] }],
  "members": [],              // dedup, incluye al owner (ALL_ACCESS)
  "keys": [{ "keyId", "allAccess", "projects": [], "revoked" }]
}
```

> **GAP de grupos.** `groups[]`/`members[]` de estos dos endpoints se LEEN, pero los
> grupos (grp:/gm:) **NO tienen endpoints REST** para crear/editar/borrar todavia. Esa
> capa esta diferida; por ahora un grupo se administra internamente en el back.

### POST /api/teams/&lt;handle&gt;/keys
Mintea una **company key** (key del org). **requireAuth** + actor-admin. En v2 NO es
owner-only: la mintea el **owner** (scope full) **o** un **miembro con `canManageKeys`**
(scope ACOTADO a sus proyectos). Reusa el flujo de `POST /api/keys/agent` pero con
`KeyRecord.user = handle`:
```json
{ "label": "agente-org", "folder": "briefings", "days": 30, "verbs": ["publish", "list"] }
```
- Mismo body/shape que `POST /api/keys/agent` (ver "API keys"): `folder` opcional
  (con folder → blast radius acotado; sin folder → BROAD sobre el namespace del org),
  `days` (0 = nunca expira), `verbs` default `["publish"]`.
- Un miembro con `canManageKeys` mintea acotado: un scope pedido fuera de sus proyectos
  efectivos → `403 scope_escalation`. Un miembro sin grupo (org con grupos) no puede
  mintear nada.
- La key resultante: scopes `verb:<handle>[:f/...]`, indexada en `keys-by-user:<handle>`,
  cuenta contra `agentKeysMax` del **tier del org**.
- Una company key publica bajo el org **sin** mandar `body.owner` (su namespace propio
  ya es el del org). NO tiene `admin:self`: jamas puede mintear otras company keys ni
  administrar membership.

Errores: `403 cannot_manage_keys` (miembro sin la capacidad), `403 not_a_member`
(no-miembro), `403 scope_escalation` (scope fuera de sus proyectos).

Respuesta: igual que `POST /api/keys/agent`
(`{ plaintext, keyId, label, type, scopes, rateLimits, expiresAt, folder, days, ... }`).

### DELETE /api/teams/&lt;handle&gt;/keys/&lt;keyId&gt;
**(v2)** Revoca una company key del org. **requireAuth** + actor-admin. El **owner** revoca
CUALQUIER company key; un **miembro con `canManageKeys`** revoca SOLO las que él minteo
(`KeyRecord.mintedBy === principal`). `keyId` = el short id (8 hex) de la key, resuelto via
`keys-by-user:<handle>`.
- Miembro sin la capacidad → `403 cannot_manage_keys`; no-miembro → `403 not_a_member`.
- Miembro revocando una key ajena → `403 not_your_key`.
- Key inexistente bajo el org → `404 key_not_found`; ya revocada → `409 key_already_revoked`.
- El short id son 8 hex (colision teorica): si matchea >1 key del org → `409
  ambiguous_key_id` (desambiguá con un identificador mas largo).

Respuesta: `{ ok: true, keyId, revokedAt }`.

### POST /api/teams/&lt;handle&gt;/transfer
**(v2 · DANGER)** Transfiere ownership a OTRO miembro existente. **requireAuth** + CSRF
(sesion) + actor-admin + `isOwner`. El namespace sale del path; el body solo elige a QUIÉN.
```json
{ "toUser": "santy" }
```
- `toUser`: handle canonico (`400 invalid_to_user`), debe ser miembro existente
  (`404 target_not_member`), distinto del owner actual (`400 already_owner`).
- Efecto: el nuevo owner pasa a `owner`, el viejo owner queda como `member`.

Respuesta: `{ ok, handle, ownerUser, previousOwner, transferredAt }`.

### DELETE /api/teams/&lt;handle&gt;
**(v2 · DANGER)** Borra el org entero. **requireAuth** + CSRF + actor-admin + `isOwner`.
Confirmacion fuerte: el body `confirm` DEBE matchear el `handle` EXACTO del path.
```json
{ "confirm": "procontacto" }
```
- `confirm` != handle → `400 confirm_mismatch`.
- Limpieza: revoca todas las company keys (+ borra `keys-by-user:<handle>`), purga
  membership (tm:/ut:) + grupos (grp:/gm:), borra la plantilla del org, y borra el
  `UserRecord`-org (libera el handle).
- **El contenido R2 publicado bajo el org NO se borra** (decision conservadora: queda
  huerfano, servible por URL exacta; limpiarlo es un job aparte).

Respuesta: `{ ok, deleted, deletedAt, cleaned: { members, groups, keysRevoked }, contentR2: "kept" }`.

### GET · PUT · DELETE /api/teams/&lt;handle&gt;/template
**(v2)** Plantilla de marca compartida del org. Los miembros que publican bajo `<handle>`
HEREDAN esta plantilla (vive en R2 como `<handle>/_template.html`, mismo esquema per-user).
- **GET** (cualquier miembro): devuelve el HTML (`text/html`), o `{ template: null,
  hasTemplate: false }` si no hay.
- **PUT** (owner, CSRF + actor-admin): **Content-Type `text/html`**, body = el HTML wrapper.
  Debe contener `{{content}}` (`400 missing_content_placeholder`). Max 1MB
  (`413 template_too_large`); body vacio → `400 empty_template`. → `{ ok, size }`.
- **DELETE** (owner): → `{ ok, deleted: true }`.

### GET · POST /api/teams/&lt;handle&gt;/verify-domain[/start|/confirm]
**(v2)** Verificacion de control de un dominio por DNS TXT (badge "verificado"). Owner-only
para start/confirm (CSRF + actor-admin + `isOwner`); GET para cualquier miembro.

- **GET `/verify-domain`** → `{ handle, verified, verifiedDomain, verifiedVia, pending }`
  (`pending` = `{ domain, startedAt, recordName, recordType:"TXT", recordValue }` o `null`).
- **POST `/verify-domain/start`** `{ "domain": "empresa.com" }` → `{ ok, domain,
  record: { name, type:"TXT", value }, prefix }`. Token fresco en cada start.
  `400 invalid_domain` si el dominio no normaliza.
- **POST `/verify-domain/confirm`** (sin body) → resuelve el TXT via DNS-over-HTTPS. Match →
  `{ ok:true, verified:true, verifiedDomain, verifiedVia:"dns" }`. Aun sin propagar →
  `200 { ok:false, verified:false, error:"txt_not_found", record }`. Sin verificacion en
  curso → `409 no_pending_verification`; fallo de red/DoH → `502 dns_lookup_failed`.

### GET · POST · DELETE /api/teams/&lt;handle&gt;/domains[/&lt;domain&gt;]
**(v2 · ⚠️ DIFERIDO)** Mapea un dominio propio (`propuestas.empresa.com`) al namespace
del org. **`POST` hoy responde `503 domain_unconfigured`**: el binding KV de dominios NO
esta creado (config humana pendiente). NO lo ofrezcas como capacidad activa.

- **GET `/domains`** (cualquier miembro) → `{ handle, verifiedDomain, domains: [{ domain,
  addedBy, createdAt }] }`. Funciona aunque el alta este diferida.
- **POST `/domains`** `{ "domain" }` (owner): **`503 domain_unconfigured`** mientras el
  feature este diferido. Cuando se habilite exigirá un dominio **verificado** que CUBRA el
  pedido (`409 domain_not_verified` si el org no verifico nada; `403 domain_not_covered` si
  el dominio cae fuera del verificado), evita secuestro (`409 domain_taken`), `400
  invalid_domain`. → `201 { ok, handle, domain, external: { cname, note } }` (el cert TLS se
  aprovisiona aparte en Cloudflare).
- **DELETE `/domains/<domain>`** (owner): desmapea (`403 domain_not_yours` si es de otro
  org, idempotente). → `{ ok, removed }`.

### GET · POST /api/teams/&lt;handle&gt;/billing[/checkout|/portal]
**(v2 · ⚠️ EARLY ACCESS)** Billing del org: el `UserRecord`-org es la unidad facturable
(anti-sprawl), la subscripción NO se asocia a la persona que la inicio. El checkout/portal
pueden estar **inactivos** (early access).

- **GET `/billing`** (cualquier miembro) → `{ handle, tier, purchasedTier, active,
  subscriptionStatus, billingCycle, currentPeriodEnd, billingProvider, billingEnabled }`.
  `tier` = tier EFECTIVO (gate anti-sprawl aplicado); `billingEnabled` = si el billing de
  orgs esta habilitado en este entorno.
- **POST `/billing/checkout`** `{ "cycle": "monthly"|"annual" }` (owner, CSRF + actor-admin):
  → `{ checkoutUrl }`. `cycle` invalido → `400 invalid_cycle`. **`503 team_early_access`**
  si los variants TEAM + el flag aun no estan; **`503 billing_unconfigured`** si faltan
  credenciales/variant de Lemon Squeezy; `409 already_subscribed` si ya hay plan activo.
- **GET `/billing/portal`** (owner): → `{ portalUrl }` (gestionar/cancelar). Sin plan →
  `404 no_subscription`; sin credenciales → `503 billing_unconfigured`; fallo del proveedor
  → `502 billing_provider_error`.
