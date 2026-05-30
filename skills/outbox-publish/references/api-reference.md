# Outbox API — referencia tecnica (cliente agente)

Referencia de los endpoints relevantes para un **agente cliente** que publica,
lee, actualiza y gestiona paginas con una API key `outbox_*`. Derivada del backend
real (`out-box/worker/src/handlers` + `worker/src/lib`). Incluye Fase 3A (B1–B15).
Fecha: 2026-05-30.

- **Base API**: `https://api.out-box.dev`
- **Auth**: `Authorization: Bearer outbox_xxxxx` (API key long-lived, en
  `~/.outboxrc` o `OUTBOX_API_KEY`) en todo endpoint autenticado.
- **HTML publico** se sirve desde la zona `https://out-box.dev/<user>/<slug>`
  (**SIN `/u/`** — el `/u/...` legacy 301-redirige al canonico).
- No incluye endpoints solo-browser (OAuth, billing, admin invites/waitlist) ni
  huerfanos sin uso de cliente. Solo lo accionable por un agente con key.

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
| 400 | `invalid_scope_format` | scope con formato no `verb:user[:mod]` |
| 413 | (size) | HTML > 5MB, data > 64KB, bloque > 50KB, upload > 10MB |
| 429 | `rate_limited` | quota excedida; trae `retryAfter` |

---

## Auto-descubrimiento

### GET /api/capabilities
**Publico** (sin auth). Describe que soporta el back para que clientes (CLI, MCP,
skill, rust, front) se autoconfiguren sin hardcodear. `cache-control: public,
max-age=300`. Forma versionada con `version` (forward-compat — tolera campos nuevos).

Devuelve, entre otros: `apiBase`/`siteBase`, `verbs`, `scopeFormat`,
`scopeDefaults` (human/agent/claim), `visibility` (values, default `private`, ttl,
`inheritFolderVisibility`), `contentMeta` (`modelRequired: true`, limites),
`uploads`, `templates.brandPresets` (los 6) + `count`, `tiers`, `publishLimits`,
`endpoints`, y `features` (uploads, exportJson, ttlVisibility, feedPrefixVersion,
dailyDocs, versioning, grants, shareTokens, folderScopedKeys, deviceFlowClaim,
quotaAtomicDO; `comments: false`).

---

## Contenido / publicacion

### POST /publish
Publica una pagina HTML clasica. **Scope** `publish:u` + quota. HTML max **5MB**.

Body:
```jsonc
{
  "html": "<!doctype html>...",        // requerido, <=5MB
  "slug": "mi-slug",                   // opcional; default nanoid(8). [A-Za-z0-9_-], <=6 niveles, <=200 chars
  "title": "Titulo",                   // opcional
  "tags": ["a", "b"],                  // opcional
  "visibility": "private",             // opcional: private(DEFAULT) | unlisted | public
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
- `model` faltante → `400 missing_model`. `user`/`owner` en body se ignoran.

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
Respuesta: igual a `/publish`.

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

### GET /api/u/&lt;user&gt;/&lt;slug&gt;/export?format=json|html
**B9** — export machine-readable. **Scope** `publish:u` (folder-aware), cross-user → `403`.
- `format=json` (default): `{ user, slug, title, tags, visibility, version, model,
  summary, description, contentType, meta, createdAt, updatedAt, contenido }`
  (`contenido` = HTML crudo persistido).
- `format=html`: el HTML crudo (`text/html`).
- `tar.gz` diferido. Para content-templates devuelve el HTML renderizado.

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

### GET /api/u/&lt;user&gt;/_uploads/&lt;hash&gt;.&lt;ext&gt;
Sirve el binario. **Publico** (sin auth; el hash es capability token). Inmutable
(cache 1 ano). No pasa por el pipeline de visibility.

---

## Versiones

### GET /api/u/&lt;user&gt;/&lt;slug&gt;/versions
Lista versiones. **requireAuth**. Cross-user → `403`.

### POST /api/u/&lt;user&gt;/&lt;slug&gt;/rollback
Vuelve a una version. **Scope** `publish:u`. Parametro en **body** (no query):
```json
{ "to": 2 }
```

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
  "model": "...", "summary": "...", "contentType": "..."  // ContentMeta manifest-level (1er append)
}
```
Respuesta: `{ blockId (blk_*), totalBlocks, url, version }`.
Error `409 conflict_with_static_post` si el slug ya es un HTML estatico.

### GET /api/u/&lt;user&gt;/&lt;slug&gt;/blocks?date=YYYY-MM-DD
Lista los bloques de un dia. **Scope** `list:u`. `date` opcional (default hoy UTC).

### GET /api/u/&lt;user&gt;/&lt;slug&gt;/dailies?days=N
Historial de dias del daily. **Scope** `list:u`. Solo existe la forma **con slug**.

### DELETE /api/u/&lt;user&gt;/&lt;slug&gt;/blocks/&lt;blockId&gt;
Borra un bloque (`blockId` con prefijo `blk_`). **Scope** `delete:u`.

---

## Listado y busqueda

### GET /api/list
Lista paginas del owner. **Scope** `list:u`. Query: `?tag=`, `?limit=`, `?depth=`
(arbol de folders con hijos), `?shared=1` (incluye recursos compartidos).

### GET /api/u/&lt;user&gt;/search?q=&lt;query&gt;
Busca por metadata (title/slug/tags, no fulltext). Publico (el owner ve sus
private si va autenticado). `?limit` opcional.

### GET /api/folders y /api/folders/&lt;prefix&gt;
Lista folders. **Scope** `list:u` (GET raiz) / `requireAuth` (GET por prefix).
`?depth` opt-in para arbol.

### PUT /api/folders/&lt;prefix&gt;
Setea metadata/visibility de un folder. **Scope** `folder:u` o `template:u`
(folder-aware). Emite `PUT` (aunque algun cliente lo llame "patch"). No es
retroactivo: solo afecta publishes nuevos que opten por heredar.

---

## Brand preset / template per-user

Los **6 brand presets**: `paper | minimal | corporate | dark | brutalist | editorial`.

### PUT /api/me/style
**B3** — cambia el brand preset preferido (`stylePreference`) SIN re-aplicar el HTML.
**Scope** `template:u`.
```json
{ "stylePreference": "dark" }
```
Uno de los 6 IDs. Fuera de eso → `400 invalid_stylePreference`. Respuesta:
`{ ok, stylePreference }`. El valor se expone siempre en `GET /api/me`.

### GET /api/template
Devuelve el template HTML del owner. **Scope** `template:u`.

### PUT /api/template
Setea el template. **Scope** `template:u`. **Content-Type `text/html`**, body = HTML.
Debe contener `{{content}}` (soporta `{{title}}`, `{{date}}`, `{{author}}`). Max **1MB**.

### DELETE /api/template
Borra el template. **Scope** `template:u`.

### POST /api/template/from-catalog
Instala un template del catalogo. **Scope** `template:u`.
```json
{ "templateId": "dark" }
```

### GET /api/templates/catalog  ·  GET /api/templates
Catalogo de templates disponibles. **Publico** (sin auth).

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
Link: `https://out-box.dev/<user>/<slug>?share=<token>`. Token de folder cascade a
descendientes.

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
  "permissions": ["view"],             // v1: solo "view"
  "expiresInDays": 30,                 // opcional (default 30; null = permanente)
  "message": "..."                     // opcional (<=500 chars)
}
```

#### GET /api/grants  ·  GET /api/grants?incoming=1
Lista grants emitidos (owner) o recibidos (`?incoming=1`). **requireAuth**.

#### DELETE /api/grants/&lt;id&gt;
Revoca un grant (solo owner). **requireAuth**. `id` = 16 hex.

---

## API keys

### GET /api/keys
Lista las keys propias (sin plaintext). **requireAuth**.

### POST /api/keys
Crea una key con scopes explicitos. **Scope** `genkey:u`. Los scopes pedidos deben
ser subset de los del principal (sino `403 scope_escalation`). Formato invalido →
`400 invalid_scope_format`. Devuelve el plaintext una sola vez.

### POST /api/keys/agent
Atajo para emitir una **agent key folder-scoped** (delegacion / blast radius
acotado). **Scope** `genkey:u`.
```jsonc
{
  "label": "agente-x",                 // requerido, 1-60 chars
  "folder": "briefings",               // opcional → key folder-scoped (todos los verbs al folder)
  "days": 30,                          // 0 = nunca expira (warning_no_expiry); max 365; default 30
  "verbs": ["publish", "list"]         // subset de publish,list,delete,folder,share,template,upload; default ["publish"]
}
```
Respuesta incluye `expiresAt`, `folder`, `days`, y `warning_no_expiry` si `days:0`.

### POST /api/keys/rotate
Rotacion atomica (genera nueva, revoca vieja). **Scope** `genkey:u`. Con auth de
sesion requiere `keyId` en el body.

### POST /admin/revoke
Revoca una key. **Scope** `admin:self`. **Path sin prefijo `/api`** (intencional).
```json
{ "keyId": "<id>" }
```

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
Identidad del principal. **requireAuth**. Devuelve `user`, `keyId`, `type`
(`human`/`agent`), `scopes[]`, `rateLimits`, `tier`, `tierLimits`, y
`stylePreference` (uno de los 6 IDs, null si nunca eligio).

### GET /api/me/usage
Consumo vs limites del tier. **requireAuth**. `?refresh=true` fuerza recalculo
(cache 300s). `tier` ∈ `free | pro | pro_plus | team`.

Limites por tier (fuente: `lib/tier-limits.ts`):

| Tier | publish/hora | publish/dia | storageGB | agentKeysMax | dailyDocsMax |
|---|---|---|---|---|---|
| free | 5 | 10 | 0.1 | 1 | 0 |
| pro | 10 | 100 | 5 | ~unlimited (999) | 1 |
| pro_plus | 30 | 500 | 25 | ~unlimited (999) | 5 |
| team | 30 | 500 | 25 | ~unlimited (999) | 999 |

### GET /api/audit
Eventos de auditoria del owner. **Scope** `audit:self`. Ventana 7 dias, cursor
`before` + `limit`. El campo de accion se expone como `kind` (alias externo de
`action`); filtrable con `?kind=publish,delete`.

---

## Borrar

### DELETE /api/u/&lt;user&gt;/&lt;slug&gt;
Borra una pagina. **Scope** `delete:u`. Cross-user → `403`. No recuperable via API.
