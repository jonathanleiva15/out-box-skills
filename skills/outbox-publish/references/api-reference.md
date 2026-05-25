# Outbox API Reference

**Base URL:** `https://api.out-box.dev`

**Última actualización:** 2026-05-20 (post Fase 1+2 + Sprint K1) — validado contra `worker/src/handlers/` real.

Casi todos los endpoints requieren:
```
Authorization: Bearer <OUTBOX_KEY>
```

Excepciones públicas (no requieren auth): `/health`, `/u/*` (HTML respeta visibility), `/og/*`, `/api/design-system*`, `/api/waitlist`, `/api/signup`, `/api/agents/registry`.

CORS whitelist: `https://out-box.dev`, `https://*.out-box.dev`, `http://localhost:3000`, `http://localhost:8787`. Otros orígenes reciben `Access-Control-Allow-Origin: https://out-box.dev` (no reflection).

---

## Public (sin auth)

### `GET /health`

Health check.

**200:**
```json
{ "status": "ok", "version": "0.0.1" }
```

### `GET /u/:user`

Auto-index HTML del namespace. Respeta visibility:
- Sin auth → solo posts `public`/`unlisted`
- Con `Authorization: Bearer <key>` del owner → incluye `private`

Si el user tiene `<user>/index.html` en R2, se sirve **EN VEZ** del auto-index (override custom).

**Content-Type:** `text/html; charset=utf-8`

### `GET /u/:user/:slug`

Sirve el HTML de un post. Respeta visibility:
- `public` → cualquiera con la URL
- `unlisted` → cualquiera con la URL exacta (no aparece en auto-index)
- `private` → solo owner con Bearer key, o con `?share=<token>` válido

**Slugs jerárquicos**: `notes/2026-05-20`, `proyectos/cliente/v2` son válidos (hasta 5 niveles).

**Headers de response:**
- `cache-control: public, max-age=0, must-revalidate, s-maxage=0` (visibility public, desde K1)
- `cache-control: private, max-age=0, no-store` (visibility private/unlisted)
- `x-outbox-user`, `x-outbox-slug`, `x-outbox-visibility` (debug)

### `GET /u/:user/feed.xml`

Atom feed con posts `public` del user.

**Content-Type:** `application/atom+xml`

### `GET /og/:user/:slug.png`

OG card SVG del post (generada on-the-fly).

**Content-Type:** `image/svg+xml`

### `GET /api/design-system` y `GET /api/design-system.css`

Design system público de Outbox (paleta paper, fonts Newsreader+Geist+JetBrains, componentes).

- `/api/design-system` → JSON
- `/api/design-system.css` → CSS con variables, consumible directamente

### `POST /api/waitlist`

Capturar email para waitlist (Fase 1).

**Request:**
```json
{
  "email": "user@example.com",
  "name": "Persona Real",
  "useCase": "Quiero archivar reportes de Claude"
}
```

**Validaciones:**
- `email`: regex simple, max 200 chars
- `name`: 2-80 chars
- `useCase`: 0-500 chars (opcional)
- Rate limit: 3 submits/hora por IP (`cf-connecting-ip`)
- Dedupe silencioso: si el email ya existe → 200 OK sin reescribir

**200:**
```json
{ "ok": true, "queued": true }
```

**Errores:** `400 invalid_email|invalid_name|invalid_useCase`, `429 rate_limited`.

### `POST /api/signup`

Crear user nuevo consumiendo un invite code.

**Request:**
```json
{
  "username": "joni-prueba",
  "inviteCode": "ULEeGw1U5bhHuKvr"
}
```

**Validaciones:**
- `username`: regex `^[a-z0-9-]{2,32}$`, no en lista reservada (admin, api, app, auth, etc.)
- `inviteCode`: debe existir en KV `OUTBOX_USAGE` con key `invite:<code>`. Se consume (delete) al usar.

**200:**
```json
{
  "ok": true,
  "user": "joni-prueba",
  "plaintext": "outbox_PdiJcXKPRM...",
  "keyId": "893d0642",
  "scopes": ["publish:joni-prueba", "delete:joni-prueba:own", "list:joni-prueba", ...],
  "warning": "Save this key NOW — it will never be shown again.",
  "nextSteps": {
    "cli": "pcpub login → paste outbox_xxxx",
    "library": "https://out-box.dev/u/joni-prueba"
  }
}
```

**Errores:** `400 invalid_username|username_reserved|invalid_invite`, `403 invite_not_found_or_used`, `409 username_taken`.

### `GET /api/agents/registry`

Lista agents marcados `discoverable: true` en `_agents.json` de todos los users (Sprint 16).

**Query params opcionales:**
- `tag` — filtrar por tag
- `sort` — `publishCount` | `recent` (default)

**200:**
```json
{
  "count": 3,
  "agents": [
    {
      "id": "briefing-daily",
      "fromUser": "joni",
      "label": "Briefing matutino",
      "description": "Lee mails y arma briefing con Claude",
      "tags": ["briefing", "daily"],
      "publishCount": 187,
      "instantiable": true,
      "recipe": { "inputs": [...] }
    }
  ]
}
```

---

## Publishing

### `POST /publish`

Publica un HTML al namespace del principal. **El namespace se deriva server-side de la API key — nunca del body.**

**Request:**
```json
{
  "html": "<html>...</html>",
  "title": "Opcional",
  "slug": "custom-slug-opcional",
  "tags": ["tag1", "tag2"],
  "visibility": "private",
  "notifySlack": "#channel-name",
  "branding": "full",
  "skipTemplate": false
}
```

**Campos:**

| Campo | Tipo | Default | Notas |
|---|---|---|---|
| `html` | string | requerido | HTML completo o fragment. Max 5 MB. |
| `title` | string | opcional | Para `<title>` y OG card |
| `slug` | string | auto (8 chars) | Regex `[A-Za-z0-9_-/]{1,64}` con jerarquía permitida hasta 5 niveles |
| `tags` | string[] | `[]` | Max 10 tags |
| `visibility` | enum | `private` | `private` / `unlisted` / `public` |
| `notifySlack` | string | — | Canal Slack con `#` para postear el link (si el user tiene `slackWebhook` configurado) |
| `branding` | enum | `full` | `full` aplica template del user. `none` deja HTML tal cual. (`vars` está en el type union pero sin lógica especial — se comporta como `full`.) |
| `skipTemplate` | boolean | `false` | Equivalente a `branding: 'none'` |
| `ttl` | string | — | ⚠️ Está en el type pero NO implementado. `expiresAt` se hardcodea a `null`. No usar. |
| `model` | string | — | **Fase 4.** Modelo IA que generó el contenido. Max 64 chars, regex `^[a-z0-9_\-./:]+$/i`. |
| `contentType` | string | — | **Fase 4.** Tipo de contenido. Max 40 chars, regex `^[a-z0-9_-]+$/i`. Sugeridos: `briefing`, `report`, `notes`, `post`, `mockup`, `data-viz`, `summary`, `other`. |
| `summary` | string | — | **Fase 4.** Resumen breve, max 280 chars. Aparece en RSS `<description>`, search +4 si matchea. |
| `description` | string | — | **Fase 4.** Descripción larga, max 2000 chars. |
| `meta` | `Record<string, string\|number\|boolean>` | — | **Fase 4.** Escape hatch. Max 10 keys. Key regex `^[a-zA-Z][a-zA-Z0-9_]{0,39}$`. String values max 500 chars. Total serializado max 4KB. |

**Notas:**
- **`user` / `owner` en el body se ignoran silenciosamente.** El namespace = el `principal.user` derivado de la key.
- Re-publish al mismo slug → crea versión nueva automáticamente (Sprint 11). Las anteriores quedan en `<user>/<slug>.v<N>.html`.

**200:**
```json
{
  "url": "https://out-box.dev/u/joni/abc12345",
  "slug": "abc12345",
  "version": 1,
  "visibility": "private",
  "expiresAt": null,
  "ogImage": "https://out-box.dev/og/joni/abc12345.png",
  "quotaRemaining": { "perHour": 19, "perDay": 99 }
}
```

**Errores:**
- `400 invalid_json` — body no es JSON parseable
- `400 missing_html` — falta el campo html
- `400 invalid_slug` — slug no matchea regex
- `400 invalid_visibility` — visibility no es enum válido
- `403 forbidden missingScope=publish:<user>` — key sin scope
- `403 slug_not_allowed` — slug fuera del `slugWhitelist` de la key
- `403 slug_not_under_allowed_folder` — key folder-scoped y slug fuera del folder (Sprint 1)
- `413 html_too_large` — HTML > 5 MB
- `429 rate_limited` — quota excedida (con `retryAfter` segundos)
- `401 missing_auth | invalid_key | key_revoked | key_expired`

### `POST /api/publish-from-template`

Publish con renderización server-side a partir de un **content template** y data JSON estructurada. Para agentes que NO saben generar HTML (Custom GPTs, Zapier, n8n).

Mismo scope (`publish:<user>`) y quota counting que `/publish`. El HTML rendered se PERSISTE igual (sin re-rendering on read).

**Body:**
```json
{
  "template": "status-report",
  "slug": "clientes/solera/2026-05-24",
  "title": "Status semanal Solera",
  "data": { /* schema según template — ver tabla abajo */ },
  "visibility": "unlisted",
  "tags": ["status"]
}
```

Folder-scope (Sprint 1) y visibility-inheritance (Sprint 2) aplican igual que `/publish`.

**Templates v1 (`GET /api/templates` lista los disponibles + schemas):**

#### `status-report`
PM que comparte progreso con cliente.
```ts
{
  client: string,       // requerido
  date: string,         // requerido (ISO yyyy-mm-dd recomendado)
  period?: string,      // opcional, ej. "semana del 20-24 mayo"
  highlights: string[], // requerido (puede ser vacío [])
  blockers: string[],   // requerido (puede ser vacío [])
  nextSteps: string,    // requerido
  risks?: string[],     // opcional
}
```

#### `daily-briefing`
Briefing del día para gerentes.
```ts
{
  date: string,                                            // requerido
  summary: string,                                         // requerido (lead del briefing)
  priorities: string[],                                    // requerido
  meetings?: Array<{ time, title, with? }>,                // opcional
  metrics?: Array<{ name, value, delta? }>,                // opcional, value puede ser string|number
}
```

#### `repo-diff`
Diff de repo en un período para devs.
```ts
{
  repo: string,                                                            // requerido
  period: string,                                                          // requerido
  files: Array<{ path: string, additions: number, deletions: number, summary?: string }>, // requerido
  notableChanges?: string[],                                               // opcional
}
```

#### `kpis-snapshot`
Snapshot de métricas con commentary.
```ts
{
  period: string,                                                                          // requerido
  metrics: Array<{ name: string, value: string|number, deltaVsPrev?: string, target?: string|number }>, // requerido
  commentary?: string,                                                                     // opcional
}
```

#### `custom`
Escape hatch para devs — `data.html` raw, wrappeado con `_template.html` del user. **NO sanitiza** — el caller es responsable de que el HTML sea seguro.
```ts
{ html: string }
```

**Errores:**
- `400 invalid_template` — template id no existe en la galería.
- `400 missing_field` con `field: "<name>"` — falta campo requerido.
- `400 invalid_field` con `field: "<name>"` y `message` — campo presente pero con tipo equivocado.
- `400 invalid_visibility` — visibility no es enum válido.
- `403 slug_not_under_allowed_folder` — folder-scoped key, slug fuera del folder.
- `413 data_too_large` — `data` excede 64 KB.
- `429 rate_limited` — quota excedida.
- `401` heredados del middleware (mismas variantes que `/publish`).

### `GET /api/templates`

Listado público de content templates (galería). No requiere auth.

**200:**
```json
{
  "templates": [
    {
      "id": "status-report",
      "description": "Status report para PMs que comparten progreso con clientes.",
      "requiredFields": ["client", "date", "highlights", "blockers", "nextSteps"],
      "optionalFields": { "period": "string", "risks": "string[]" }
    },
    // ...resto
  ]
}
```

---

## Reading

### `GET /api/me`

Info del principal autenticado.

**200:**
```json
{
  "user": "joni",
  "keyId": "2013ac9a",
  "type": "human",
  "scopes": ["publish:joni", "delete:joni:own", "list:joni", "template:joni", "genkey:joni", "admin:self"],
  "rateLimits": { "perHour": 20, "perDay": 100 },
  "slugWhitelist": null
}
```

### `GET /api/me/usage`

Devuelve el uso real del user autenticado: publishes (hora/día/mes), storage (bytes/MB/pct), posts (total + breakdown por visibility), keys activas, dailies activos. **Fase 4.**

**Query params:**
- `refresh` — `true` para forzar recompute y saltear el cache de 5min. Default `false`.

**Cache:** TTL 300s en KV `OUTBOX_EPHEMERAL` key `usage_cache:<user>`. Aceptamos staleness post-write — para invalidar antes de los 5min usar `?refresh=true`.

**Auth:** Bearer (cualquier scope — el user del response es siempre el principal).

**200:**
```json
{
  "user": "joni",
  "tier": "pro",
  "limits": {
    "publishPerHour": 60,
    "publishPerDay": 500,
    "storageGB": 5,
    "agentKeysMax": 10,
    "dailyDocsMax": 1
  },
  "usage": {
    "publishes": {
      "hour":  { "used": 3,  "limit": 60,  "pct": 5,  "resetInSeconds": 2150 },
      "day":   { "used": 42, "limit": 500, "pct": 8,  "resetInSeconds": 38450 },
      "month": { "used": 312 }
    },
    "storage": {
      "usedBytes": 1288490188,
      "usedMB": 1228.8,
      "limitMB": 5120,
      "pct": 24,
      "truncated": false
    },
    "posts": {
      "total": 187,
      "byVisibility": { "private": 90, "unlisted": 50, "public": 47 }
    },
    "keys": { "active": 5, "max": 10 },
    "dailies": { "active": 1, "max": 1 }
  },
  "billing": {
    "subscriptionStatus": "active",
    "currentPeriodEnd": "2026-08-21T00:00:00.000Z",
    "billingCycle": "monthly"
  },
  "computedAt": "2026-05-24T12:34:56.789Z",
  "cached": false
}
```

**Notas:**
- `storage.truncated: true` → el list de R2 cortó por cap de 5 páginas (5000 objects). El valor `usedBytes` es un mínimo. UX del CLI muestra "(truncated)" cuando esto pasa.
- `usage.publishes.month.used` es informativo — no se usa como gate de quota (solo hora/día).
- Para anti-enum de billing, los campos `billing.*` son `null` si el user no tiene suscripción activa.
- `cached: true` en response indica que vino del cache; `computedAt` refleja cuándo se computó originalmente.

**Errores:**
- `401 missing_auth | invalid_key | key_revoked | key_expired`

---

### `GET /api/list`

Lista posts del user. **Solo del namespace de la key — cross-user no permitido.**

**Query params:**
- `tag` — filtrar por tag exacto
- `limit` — default 50, max 200, validado con `Number.isSafeInteger`
- `prefix` — filtrar por carpeta (`notes/`, `briefings/`, etc.)

**200:**
```json
{
  "user": "joni",
  "count": 12,
  "truncated": false,
  "posts": [
    {
      "slug": "notes/hoy",
      "title": "Notas 2026-05-20",
      "tags": ["daily"],
      "visibility": "private",
      "createdAt": "2026-05-20T14:00:00.000Z",
      "updatedAt": "2026-05-20T16:30:00.000Z",
      "contentSize": 4120,
      "version": 3,
      "url": "https://out-box.dev/u/joni/notes/hoy"
    }
  ]
}
```

### `GET /api/u/:user/manifest`

Stats + listado del namespace (público, scope determina qué se devuelve).

**Query opcional:** `Authorization: Bearer <key>` → si es del owner, incluye private.

**200:**
```json
{
  "user": "joni",
  "scope": "owner" | "public",
  "count": 12,
  "lastUpdated": "2026-05-20T16:30:00.000Z",
  "posts": [
    { "slug": "...", "title": "...", "tags": [...], "visibility": "public", ... }
  ]
}
```

### `GET /api/u/:user/search?q=<query>`

Busca en title (+10), slug (+5), tags (+3). Scoring ranked.

**Query params:**
- `q` (requerido) — query string, max 200 chars

**200:**
```json
{
  "user": "joni",
  "query": "briefing",
  "count": 3,
  "scope": "owner" | "public",
  "results": [
    {
      "slug": "briefing/hoy",
      "title": "Briefing matutino",
      "tags": ["briefing"],
      "visibility": "private",
      "url": "https://out-box.dev/u/joni/briefing/hoy",
      "score": 13
    }
  ]
}
```

### `GET /api/u/:user/recent?since=<ISO>`

Change feed JSON (Sprint 10). Posts modificados desde el timestamp.

**Query params:**
- `since` (opcional) — ISO timestamp; sin él devuelve los más recientes

**200:**
```json
{
  "user": "joni",
  "since": "2026-05-19T00:00:00.000Z",
  "count": 5,
  "scope": "owner" | "public",
  "posts": [...]
}
```

---

## Updating

### `PUT /api/u/:user/:slug/visibility`

Cambia visibility de un post existente. Solo el owner.

**Request:**
```json
{ "visibility": "public" }
```

**200:**
```json
{
  "ok": true,
  "slug": "notes/hoy",
  "visibility": "public",
  "previousVisibility": "private"
}
```

### `DELETE /api/u/:user/:slug`

Borra un post (TODAS las versiones — irreversible).

- Cross-user → 403
- Requiere scope `delete:<user>:own`

**200:**
```json
{ "ok": true, "deleted": "notes/hoy" }
```

---

## Versioning (Sprint 11)

### `GET /api/u/:user/:slug/versions`

Lista las versiones de un post.

**200:**
```json
{
  "slug": "notes/hoy",
  "currentVersion": 3,
  "versions": [
    { "version": 1, "createdAt": "...", "size": 1240, "keyId": "abc12345" },
    { "version": 2, "createdAt": "...", "size": 2810, "keyId": "abc12345" },
    { "version": 3, "createdAt": "...", "size": 4120, "keyId": "abc12345" }
  ]
}
```

### `POST /api/u/:user/:slug/rollback?to=<N>`

Vuelve a una versión anterior (crea una versión nueva con el contenido de la N).

**200:**
```json
{
  "ok": true,
  "slug": "notes/hoy",
  "rolledBackTo": 1,
  "newVersion": 4
}
```

### `GET /api/u/:user/:slug/diff?from=<X>&to=<Y>`

Diff entre 2 versiones (formato unified diff).

**200:**
```json
{
  "from": 1,
  "to": 3,
  "diff": "--- v1\n+++ v3\n@@ ... @@\n..."
}
```

---

## Comments (Sprint 1.10)

### `GET /api/u/:user/:slug/comments`

Lista comments de un post.

**Auth:** opcional (visible si el post lo es)

**200:**
```json
{
  "slug": "notes/hoy",
  "count": 3,
  "comments": [
    {
      "id": "abc123",
      "author": "ariel",
      "authorType": "human" | "agent",
      "body": "Comentario...",
      "createdAt": "..."
    }
  ]
}
```

### `POST /api/u/:user/:slug/comments`

Postea un comment. Requiere Bearer key.

**Request:**
```json
{ "body": "Mi comentario sobre este post" }
```

---

## Folders (Sprint 1.8)

### `GET /api/folders/:prefix`

Metadata de una carpeta (prefijo de slug). Ej: `notes/` o `briefings/`.

**200:**
```json
{
  "prefix": "notes",
  "owner": "joni",
  "title": "Mis notas",
  "description": "Notes diarias",
  "visibility": "private",
  "createdAt": "...",
  "updatedAt": "..."
}
```

### `PUT /api/folders/:prefix`

Crea o actualiza la metadata de una carpeta.

**Request:**
```json
{
  "title": "Mis notas",
  "description": "Notes diarias",
  "visibility": "private"
}
```

Visibility de carpeta **hereda al post**: post `public` dentro de carpeta `private` queda `private`.

---

## Share Tokens (Sprint 1.9)

### `POST /api/share`

Emite un share token para acceder a un post privado vía URL.

**Request:**
```json
{
  "resourceType": "post",
  "slug": "notes/hoy",
  "ttlSeconds": 86400
}
```

**200:**
```json
{
  "token": "abc12345xyz...",
  "expiresAt": "2026-05-21T16:00:00.000Z",
  "url": "https://out-box.dev/u/joni/notes/hoy?share=abc12345xyz..."
}
```

### `GET /api/share/:token`

Verifica un token. Útil para integraciones.

---

## Template (Sprint 3)

### `GET /api/template`

Devuelve el template del user.

- Sin template: `200 { "template": null, "hasTemplate": false }`
- Con template: `200 <template HTML>` con content-type `text/html`

### `PUT /api/template`

Setea el template. Body es el HTML directo (no JSON). Debe incluir `{{content}}`.

Placeholders disponibles: `{{content}}`, `{{title}}`, `{{date}}`, `{{author}}`.

**200:** `{ "ok": true, "size": 444 }`

### `DELETE /api/template`

Borra el template.

---

## Keys (Sprint 1b + K1)

### `GET /api/keys`

Lista las keys del user (sin plaintext).

**200:**
```json
{
  "user": "joni",
  "count": 2,
  "keys": [
    {
      "keyId": "abc12345",
      "label": "briefing-bot",
      "type": "agent",
      "scopes": ["publish:joni"],
      "createdAt": "...",
      "lastUsedAt": "...",
      "expiresAt": null,
      "revokedAt": null
    }
  ]
}
```

### `POST /api/keys`

Emite una nueva key.

**Request:**
```json
{
  "label": "briefing-bot",
  "type": "agent",
  "scopes": ["publish:joni"],
  "slugWhitelist": ["today", "briefing/today"],
  "rateLimits": { "perHour": 5, "perDay": 50 },
  "expiresAt": "2027-01-01T00:00:00.000Z"
}
```

**Validaciones de seguridad:**
- Scopes: cada uno debe matchear regex `^(publish|delete|list|template|genkey|admin):[a-z0-9_-]+(?::[a-z0-9_/-]+)?$`. El segundo segmento (folder/modifier) acepta `/` para sintaxis `f/<folder>` (Sprint 1).
- **No privilege escalation, sí narrowing.** Updated 2026-05-24 con `canGrantScope()`: un user puede emitir keys con scopes que son **subset semántico** de los suyos:
  - Exact match: siempre OK.
  - Broad → folder: si tenés `publish:joni`, podés emitir keys con `publish:joni:f/<cualquier-folder>` (narrowing).
  - Folder → sub-folder: si tenés `publish:joni:f/clientes`, podés emitir keys con `publish:joni:f/clientes/solera` (prefix).
  - Lateral (folder paralelo) o escalation (a broad, a otro user, a otro verb): siempre rechazado.
- Folder path en scopes: rechazado si tiene `..`, `//`, leading/trailing `/`, o segmentos vacíos.
- `expiresAt` validado: strings vacíos o malformados → key expirada (no bypassea)

**200 (PLAINTEXT SOLO UNA VEZ):**
```json
{
  "plaintext": "outbox_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "keyId": "abc12345",
  "label": "briefing-bot",
  "type": "agent",
  "scopes": ["publish:joni"],
  "rateLimits": { "perHour": 5, "perDay": 50 },
  "warning": "Save this key NOW — it will never be shown again."
}
```

### `POST /api/keys/agent`

Shortcut ergonómico para emitir agent keys (Sprint 4 add-on · 2026-05-24). Equivalente a `POST /api/keys` con `type: 'agent'` + auto-cálculo de scopes folder + expiresAt + rateLimits.

**Request:**
```json
{
  "label": "morning-briefing-bot",
  "folder": "briefings",
  "days": 30,
  "verbs": ["publish"]
}
```

- `label`: requerido, 1-60 chars, regex `[\w\s.:_-]+`.
- `folder`: opcional. Si presente, scope será folder-restricted (`publish:joni:f/briefings`). Sin folder → scope broad (`publish:joni`) — válido sólo si el caller tiene broad.
- `days`: opcional, default 30, range `[0, 365]`. `0` = nunca expira (con warning en la response).
- `verbs`: opcional, default `["publish"]`. Subset de `["publish", "list", "delete"]`. **`genkey` y `admin` NO se permiten** (defense in depth — agent keys no escalan privilegios).

**Auto-defaults aplicados:**
- `type: "agent"`
- `scopes: verbs.map(v => folder ? `${v}:joni:f/${folder}` : `${v}:joni`)`
- `expiresAt: now + days * 86_400_000` (o `null` si `days=0`)
- `rateLimits: { perHour: 5, perDay: 50 }`

**Auth:** requiere scope `genkey:<user>`. Mismo privilege escalation check que `POST /api/keys` — `canGrantScope` con narrowing (broad → folder, ancestor → sub-folder).

**200 (PLAINTEXT SOLO UNA VEZ):**
```json
{
  "plaintext": "outbox_xxxx...",
  "keyId": "abc12345",
  "label": "morning-briefing-bot",
  "type": "agent",
  "scopes": ["publish:joni:f/briefings"],
  "rateLimits": { "perHour": 5, "perDay": 50 },
  "expiresAt": "2026-06-23T00:00:00.000Z",
  "folder": "briefings",
  "days": 30,
  "warning": "Save this key NOW — it will never be shown again."
}
```

Si `days=0`, response incluye además `warning_no_expiry`.

**Errores:**
- `400 missing_label` / `invalid_label`
- `400 invalid_folder` (path traversal, segmento inválido)
- `400 invalid_days` (no integer, fuera de `[0, 365]`)
- `400 invalid_verbs` (no array, vacío, o contiene verb no permitido como `genkey`)
- `403 scope_escalation` con `hint` legible (suele ser: caller folder-restricted intentando broad, o folder paralelo)
- `401` standard middleware
- `403 forbidden missingScope: genkey:<user>`

**CLI:** `pcpub keys gen-agent --label X --folder Y --days N [--verbs publish,list]` (con `--yes` salta prompts).

### `POST /admin/revoke`

Revoca una key del user (solo el dueño).

**Request:**
```json
{ "keyId": "abc12345" }
```

(El `keyId` es el SHA-256 truncado a 8 chars — lo ves en `GET /api/keys` y `GET /api/me`.)

**200:**
```json
{ "ok": true, "keyId": "abc12345", "revokedAt": "..." }
```

---

## Agents (Sprint 16)

### `GET /api/u/:user/agents`

Manifest público de agentes del user (los marcados `discoverable: true`).

**200:**
```json
{
  "user": "joni",
  "count": 2,
  "agents": [
    {
      "id": "briefing-daily",
      "label": "Briefing matutino",
      "discoverable": true,
      "instantiable": true,
      "recipe": { ... }
    }
  ]
}
```

### `POST /api/agents/instantiate`

Clonar un agente discoverable de otro user a tu namespace.

**Request:**
```json
{
  "fromUser": "joni",
  "agentId": "briefing-daily",
  "inputs": {
    "emailAccount": "ariel@procontacto.com",
    "slackChannel": "#ariel-briefings"
  }
}
```

**200:**
```json
{
  "ok": true,
  "instantiatedAs": "briefing-daily",
  "agentKey": "outbox_xxx",
  "schedule": "0 7 * * *",
  "runtimeUrl": "https://github.com/joni/briefing-agent",
  "warning": "Save the agent key NOW."
}
```

**Aislamiento estructural mantenido:** Joni NO ve los outputs de Ariel ni viceversa.

---

## Schedules (Sprint 15)

### `GET /api/schedules`

Lista los schedules del user.

**200:**
```json
{
  "user": "joni",
  "count": 1,
  "schedules": [
    {
      "id": "sched-abc123",
      "label": "briefing-matutino",
      "cronExpression": "0 7 * * *",
      "timezone": "America/Argentina/Buenos_Aires",
      "action": { "type": "webhook", "url": "..." },
      "agentKeyId": "agent-key-abc",
      "lastRunAt": "...",
      "lastRunStatus": "ok",
      "consecutiveFailures": 0,
      "active": true
    }
  ]
}
```

### `POST /api/schedules`

Crea un schedule nuevo.

**Request:**
```json
{
  "label": "briefing-matutino",
  "cronExpression": "0 7 * * *",
  "timezone": "America/Argentina/Buenos_Aires",
  "action": {
    "type": "webhook",
    "url": "https://my-agent.com/run",
    "method": "POST",
    "headers": { "X-Secret": "..." }
  },
  "agentKeyId": "agent-key-abc"
}
```

### `DELETE /api/schedules/:id`

Borra un schedule.

---

## Admin (scope `admin:self` — actualmente solo Joni)

### `GET /api/admin/waitlist`

Lista entries de waitlist (paginado por cursor del KV).

**Query params:**
- `limit` — default 50, max 200
- `cursor` — opaque, devuelto por la página anterior

**200:**
```json
{
  "items": [
    {
      "email": "user@example.com",
      "name": "Persona Real",
      "useCase": "...",
      "createdAt": "...",
      "ip": "1.2.3.4"
    }
  ],
  "cursor": "next-opaque-or-null"
}
```

### `POST /api/admin/invites`

Crea un invite code para un email.

**Request:**
```json
{
  "email": "user@example.com",
  "note": "Approved from waitlist 2026-05-20"
}
```

**200:**
```json
{
  "ok": true,
  "code": "K7p2-vL9mNqXr8",
  "link": "https://out-box.dev/signup/K7p2-vL9mNqXr8",
  "email": "user@example.com",
  "createdAt": "..."
}
```

### `GET /api/admin/invites`

Lista invites NO usados (los usados se borran en `POST /api/signup`).

**200:**
```json
{
  "items": [
    {
      "code": "K7p2-vL9mNqXr8",
      "email": "user@example.com",
      "note": "...",
      "createdAt": "...",
      "createdBy": "joni",
      "link": "https://out-box.dev/signup/K7p2-vL9mNqXr8"
    }
  ],
  "cursor": null
}
```

### `DELETE /api/admin/invites/:code`

Revoca un invite no usado.

**200:** `{ "ok": true, "revoked": "K7p2-vL9mNqXr8" }`
**404:** si el code no existe o ya fue consumido

---

## Deprecated

### `GET /me`

**DEPRECATED desde 2026-05-20.** El panel HTML legacy ahora hace `302 → https://out-box.dev/login`. Bookmarks viejos siguen funcionando — se redirigen al frontend unificado.

---

## Claim flow (Sprint A5)

Browser handoff para conectar agentes IA sin pegar credenciales por chat.

### POST /api/auth/claim/start

Inicia el flow. Público (sin auth).

**Request body (opcional):**
```json
{ "agentLabel": "Claude en Cowork" }
```

**Response 200:**
```json
{
  "claim_token": "clm_a7f9k2bxq8x...",
  "claim_url": "https://out-box.dev/claim/clm_a7f9k2bxq8x...",
  "expires_in": 600
}
```

**Rate limit:** 10 starts por IP por hora → 429.

### GET /api/auth/claim/:token/status

Polling público. El agente lo llama cada 2-3s hasta `claimed` o timeout.

**Response pending:** `200 { "status": "pending" }`

**Response claimed (UNA SOLA VEZ):**
```json
{
  "status": "claimed",
  "api_key": "outbox_xxx...",
  "user": "joni",
  "keyId": "abc12345"
}
```

**Response consumed:** `410 { "status": "consumed" }` — segundo polling después del primer claimed.

**Response expired:** `410 { "status": "expired" }` — TTL del KV vencido.

### POST /api/auth/claim/:token/confirm

Confirmación desde el browser. Requiere cookie de sesión activa + CSRF header.

**Headers:**
- `Cookie: outbox_session=<sid>`
- `X-Requested-With: XMLHttpRequest`

**Request body:**
```json
{
  "ttl": "24h",
  "label": "Claude en Cowork",
  "scopes": ["publish", "list", "template"]
}
```

`ttl` valores válidos: `"24h"` | `"90d"` | `"permanent"`.

`scopes` default: `["publish", "list", "template"]`. Valores válidos: `publish`, `list`, `template`, `delete`, `keys`.

**Response 200:** `{ "ok": true, "keyId": "abc12345" }`

**Response 401:** sin sesión.
**Response 403:** `csrf_required`.
**Response 400:** `invalid_ttl` o `invalid_scopes`.
**Response 409:** claim ya consumido o expired.

---

## Templates catalog (Sprint A5)

### GET /api/templates/catalog

Catálogo público de templates predefinidos.

**Response:**
```json
{
  "templates": [
    {
      "id": "paper",
      "name": "Paper",
      "description": "Newsreader serif, fondo crema, oxide red accents.",
      "tags": ["editorial", "default", "serif"],
      "previewUrl": "https://api.out-box.dev/api/templates/paper/preview"
    }
  ]
}
```

Templates disponibles: `paper`, `minimal`, `corporate`, `dark`, `brutalist`, `editorial`.

### GET /api/templates/:id/preview

Sirve el HTML del template (para usar en iframe sandbox).

**Content-Type:** `text/html`

### POST /api/template/from-catalog

Copia un template del catálogo al `_template.html` del user autenticado.

**Auth:** Bearer (scope `template:<user>`)

**Request:**
```json
{ "templateId": "paper" }
```

**Response 200:** `{ "ok": true, "templateId": "paper" }`

Side effect: actualiza `UserRecord.onboardingState.templateChosen`.

**Response 400:** `invalid_templateId`.
**Response 404:** `template_not_found`.

---

## Rate limits

**Free tier (default):**
- Publish: 20/hora, 100/día
- Storage: 100 MB
- Agent keys max: 3
- Bandwidth: 10 GB/mes
- OG cards: 50/día

**Headers en 429:**
- `retry-after: <seconds>`

**Body en 429:**
```json
{
  "error": "rate_limited",
  "scope": "rate_limited_hour" | "rate_limited_day",
  "retryAfter": 3600,
  "used": { "hour": 20, "day": 47 },
  "limits": { "perHour": 20, "perDay": 100 }
}
```

---

## Auth errors estándar

| Error | Status | Significado |
|---|---|---|
| `missing_auth` | 401 | No Authorization header o no Bearer |
| `invalid_key` | 401 | Hash no encontrado en KV |
| `key_revoked` | 401 | Key fue revocada |
| `key_expired` | 401 | Key venció |
| `forbidden` | 403 | Key existe pero sin scope necesario (`missingScope`) |
| `not_yours` | 403 | Intentando operar sobre namespace ajeno |
| `slug_not_allowed` | 403 | Slug fuera del whitelist de la key |
| `rate_limited` | 429 | Quota excedida |

---

## Reglas inviolables de seguridad

1. **El campo `user` jamás viene del cliente.** Server-side desde `principal.user`. Body ignorado silenciosamente.
2. **`requireScope` antes de cada write.**
3. **`requireQuota` antes de cada write** (incremento ANTES del write a R2, reduce race).
4. **Audit log de cada write** (R2 `_audit/YYYY-MM.jsonl`). Si falla, `console.error` (no silenciar).
5. **Keys nunca en plaintext en KV.** Solo SHA-256. Plaintext se devuelve UNA SOLA VEZ.
6. **Scope format whitelisted.** Regex `^(publish|delete|list|template|genkey|admin)(:[a-z0-9_-]+){1,2}$`.
7. **No privilege escalation.** Un user solo emite keys con scopes que él tiene.
8. **`expiresAt` validado.** Strings vacíos → expirada, no bypassea.
9. **Sin secrets en código.** `wrangler secret put` (prod) o `.dev.vars` (local, gitignored).
10. **Plaintext keys NUNCA por chat.** Para emitir keys usar `node worker/scripts/emit-key.mjs <user>` (admin) o `pcpub keys-rotate` (user).

---

## Path layout en R2

```
<user>/<slug>.html              ← versión current servida
<user>/<slug>.meta.json         ← metadata del current
<user>/<slug>.v<N>.html         ← versiones acumuladas
<user>/<slug>._versions.json    ← índice de versiones
<user>/_template.html           ← template personal (opcional)
<user>/_agents.json             ← manifest público de agentes
<user>/index.html               ← override custom del auto-index
<user>/_design-override.json    ← override de CSS vars (experimental)
_audit/YYYY-MM.jsonl            ← audit log global append-only
```

---

## Endpoint summary table

| # | Method | Path | Auth | Sprint |
|---|---|---|---|---|
| 1 | GET | `/health` | — | 0 |
| 2 | GET | `/u/:user` | opcional | 1.6 |
| 3 | GET | `/u/:user/:slug` | opcional | 1a |
| 4 | GET | `/u/:user/feed.xml` | — | 10 |
| 5 | GET | `/og/:user/:slug.png` | — | 4 |
| 6 | GET | `/api/design-system[.css]` | — | 9 |
| 7 | POST | `/api/waitlist` | — | **DEPRECADO** (410 Gone) |
| 8 | POST | `/api/signup` | — | **DEPRECADO** (410 Gone) |
| 9 | GET | `/api/agents/registry` | — | 16 |
| 10 | POST | `/publish` | Bearer | 1a + Sprint 1/2 (folder enforcement + visibility inherit) |
| **10b** | **POST** | **`/api/publish-from-template`** | **Bearer** | **Sprint 3 post-layers** |
| **10c** | **GET** | **`/api/templates`** | **—** | **Sprint 3 post-layers (galería content templates)** |
| 11 | GET | `/api/me` | Bearer | 2 |
| 11b | GET | `/api/me/usage` | Bearer | Fase 4 |
| 12 | GET | `/api/list` | Bearer | 2 + Sprint 1 (folder filter silencioso) |
| 13 | GET | `/api/u/:u/manifest` | opcional | 13 |
| 14 | GET | `/api/u/:u/search` | opcional | 13 |
| 15 | GET | `/api/u/:u/recent` | opcional | 10 |
| 16 | DELETE | `/api/u/:u/:slug` | Bearer | 2 + Sprint 1 (folder enforcement) |
| 17 | PUT | `/api/u/:u/:slug/visibility` | Bearer | 1.7 |
| 18 | GET/POST | `/api/u/:u/:slug/versions\|rollback\|diff` | Bearer | 11 |
| 19 | GET/POST | `/api/u/:u/:slug/comments` | opcional | 1.10 |
| 20 | GET/PUT/DELETE | `/api/folders/:prefix` | Bearer | 1.8 + Sprint 2 (visibility source) |
| 21 | POST/GET | `/api/share[/:token]` | Bearer | 1.9 |
| 22 | GET/PUT/DELETE | `/api/template` | Bearer | 3 |
| 23 | GET/POST | `/api/keys` | Bearer | 2 + Sprint 1 (scopesDisplay parseado en GET) |
| **23b** | **POST** | **`/api/keys/agent`** | **Bearer** | **Sprint 4 add-on (shortcut agent key efímera)** |
| 23c | POST | `/api/keys/rotate` | Bearer/Cookie | Sprint K1 |
| 24 | POST | `/admin/revoke` | Bearer | 4.5 |
| 25 | GET/POST/DELETE | `/api/schedules[/:id]` | Bearer | 15 |
| 26 | GET | `/api/u/:u/agents` | opcional | 16 |
| 27 | POST | `/api/agents/instantiate` | Bearer | 16 |
| 28 | GET | `/api/admin/waitlist` | Bearer (`admin:self`) | Fase 1 (legacy) |
| 29 | GET/POST/DELETE | `/api/admin/invites[/:code]` | Bearer (`admin:self`) | Fase 1 (legacy) |
| 30 | GET | `/me` | — | 14 → **DEPRECATED** (302 → `/login`) |
| 31 | GET | `/api/templates/catalog` | — | A5 (chrome `_template.html`) |
| 32 | GET | `/api/templates/:id/preview` | — | A5 |
| 33 | POST | `/api/template/from-catalog` | Bearer | A5 (setea `_template.html` per-user) |
| 34 | POST | `/api/auth/claim/start` | — | A5 (browser handoff) |
| 35 | GET | `/api/auth/claim/:token/status` | — | A5 (polling) |
| 36 | POST | `/api/auth/claim/:token/confirm` | Cookie | A5 (browser confirm) |
| 37 | POST | `/api/auth/email/signup\|login\|reset-request\|reset-confirm` | — | A1 |
| 38 | GET | `/api/auth/{google,github}/{start,callback}` | — | A1 |
| 39 | GET | `/api/auth/email/verify` | — | A1 |
| 40 | POST | `/api/auth/logout` | Cookie | A1 |
| 41 | POST | `/api/auth/pick-username` | Cookie | A1 |
| 42 | POST | `/api/u/:u/:slug/append` | Bearer | A4 (daily docs) |
| 43 | GET | `/api/u/:u/:slug/blocks` | Bearer | A4 |
| 44 | DELETE | `/api/u/:u/:slug/blocks/:id` | Bearer | A4 |
| 45 | GET | `/api/u/:u/dailies` | Bearer | A4 |

Total: **~40 endpoints en producción** (sumando variantes por método). El "23 endpoints" del título original estaba desactualizado — desde la primera versión sumamos Sprints A1 (auth), A4 (daily docs), A5 (claim flow + catalog), K1 (rotate), Sprints 1-3 post-layers (folder-scoped, visibility-inherit, content templates) y Sprint 4 add-on (agent shortcut).
