---
name: outbox-publish
version: 1.2.0
description: >-
  Publica, lee, actualiza y gestiona paginas (HTMLs) en Outbox (out-box.dev) —
  la biblioteca privada en linea agents-first del usuario, via la API REST con
  una API key `outbox_*`. Outbox es agents-first: el caso central es un agente
  que durante el dia lee una pagina existente, le suma contexto, y la re-publica
  (versioning automatico). Trigger cuando el usuario diga "publica esto en mi
  Outbox", "manda a out-box.dev", "que tengo en notas de hoy", "actualiza mi
  briefing", "lee mi Outbox y agregale X", "armame el link de Outbox", "que
  publique", "borra X de Outbox", emitir API keys para agentes, configurar el
  brand preset / template, cambiar visibility, generar share links o grants, o
  cualquier referencia a leer/escribir/gestionar contenido publicado en su
  espacio personal.
---

# Outbox — publicar y gestionar paginas via API

Outbox (`out-box.dev`) es una biblioteca privada en linea, **agents-first**, para
publicar paginas HTML. Esta skill cubre el rol de **agente cliente**: vos tenes
una API key `outbox_*` y haces requests HTTP autenticados contra
`https://api.out-box.dev`.

La unidad de contenido se llama **pagina** (no "post"): una pagina puede tener
sub-paginas (jerarquia por slug, estilo Confluence). El caso de uso central
agents-first: durante el dia un agente **lee** una pagina existente, le **suma**
contexto/informacion, y la **re-publica** — Outbox versiona automaticamente en
cada publish. Tambien hay daily documents (append de bloques fechados sin
re-escribir todo el HTML).

## Seguridad — keys acotadas (importante)

Esta skill autentica con una API key del usuario. Para mantener el riesgo bajo:

- **Pedi una key acotada, nunca la key admin.** Para un agente lo ideal es una
  key **folder-scoped y con expiracion**:
  `outbox keys gen-agent --folder <carpeta> --verbs publish --days 30`. Asi,
  aunque la skill corra con los permisos del agente y aunque la key se filtre, el
  blast radius es **una sola carpeta, por unos dias, solo los verbs dados** — no
  tu cuenta entera.
- **La key se usa SOLO para `Authorization: Bearer`** contra `api.out-box.dev`.
  Nunca la imprimas, loguees ni la mandes a ningun otro destino.
- **Del lado del back**: las keys se guardan **hasheadas** (SHA-256), son
  **revocables al instante** y pueden **expirar solas**; el plaintext se muestra
  una unica vez. Un `403 scope_escalation` impide que una key emita otra con mas
  permisos.

## Las 3 vias de usar Outbox desde un agente

Outbox se puede operar de tres formas equivalentes; **esta skill** es una de
ellas. Mencionalas si al usuario le conviene otra:

- **CLI** (`outbox ...`) — comandos de shell (`outbox publish`, `outbox list`,
  `outbox export`, etc.). Lee la key de `~/.outboxrc`.
- **Skill** `outbox-publish` (esta) — para agentes con skills: haces los requests
  HTTP que se describen aca.
- **MCP** (`@out-box/mcp`, **40 tools**) — server MCP local (stdio) para clientes
  MCP (Claude Desktop, Cursor). Se lanza con `npx -y @out-box/mcp` y autentica con
  `OUTBOX_API_KEY` o `~/.outboxrc`. Tools tipo `outbox_publish`, `outbox_read`,
  `outbox_export`, `outbox_capabilities`, etc.

Las tres usan la **misma API key** y el **mismo backend**.

## Base, auth y convenciones

- **Base API**: `https://api.out-box.dev`. Todas las mutaciones y listados cuelgan
  de aca.
- **Zona publica (lectura del HTML)**: `https://out-box.dev`. El HTML servido **no**
  se lee por la API; se lee desde la zona publica (ver "leer una pagina").
- **Credencial = API key long-lived** (`Authorization: Bearer $OUTBOX_API_KEY`). La
  key vive en `~/.outboxrc` (lo escribe el CLI con `outbox login`/`outbox setup`).
  En entornos cloud/headless tambien se pasa por `OUTBOX_API_KEY`. La key se
  hashea server-side y resuelve a un `Principal { user, scopes }`.
- **El `user` NUNCA se pasa en el body.** El backend siempre escribe en el
  namespace del dueno de la key; cualquier `user`/`owner` en el body se **ignora**.
  En los paths `/api/u/<user>/...` el `<user>` debe ser el dueno de la key
  (cross-user → 403).
- **Content-Type**: `application/json`, salvo `PUT /api/template` (`text/html`) y
  `POST /api/uploads` (multipart o `image/*` crudo).
- **CORS/CSRF**: como agente con Bearer no necesitas `X-Requested-With` (el CSRF
  solo aplica a sesiones de browser).
- **Errores**: JSON `{ "error": "<code>", ... }`. Transversales:
  - `401`: `missing_auth`, `invalid_key`, `key_revoked`, `key_expired`.
  - `403`: `forbidden` (+ `missingScope`/`missingAnyOf`), `scope_escalation`,
    `cross_user_*`, `keys_limit` (cap de keys activas del tier, `agentKeysMax`),
    `daily_docs_limit` (cap de daily docs distintos del tier), `daily_updates_limit`
    (cap de updates/dia a daily docs, `dailyUpdatesPerDay`).
  - `413`: HTML sobre el limite por tier (free 10MB, pago hasta 25MB) en
    `/publish` (`html_too_large`), data > 64KB (`publish-from-template`),
    bloque > 50KB (daily), upload > 10MB; **`storage_limit`** cuando el storage
    total del tier (`storageGB`) se agotaria con el write (publish/append/upload).
    El limite vivo del tier esta en `/api/capabilities.publishLimits` o
    `tierLimits.htmlMaxBytes` de `/api/me`.
  - `429`: `rate_limited` (+ `retryAfter`). Respeta y reintenta.
  - `400`: validacion (ej. `missing_model`, `invalid_visibility`, `invalid_ttl`).
- **CTA de upgrade estructurado**: TODA respuesta de limite (`429 rate_limited`,
  `403 daily_docs_limit`/`daily_updates_limit`/`keys_limit`, `413
  html_too_large`/`storage_limit`) trae, ademas de los campos legacy, un bloque
  consistente `{ error, limit, used, tier, upgradeTo, ctaUrl }` — `upgradeTo` es
  el proximo tier que levanta ESE limite (o `null` si ya estas en el techo
  `unlimited`), `ctaUrl` la pagina de pricing. Usalo para decirle al usuario a que
  plan subir.

### Auto-descubrimiento (recomendado antes de operar)

`GET /api/capabilities` (publico, sin auth) describe que soporta el back: verbos
y `scopeDefaults`, valores/default de visibility + TTL, limites de content-meta,
uploads, los 6 brand presets, limites por tier, y que features estan activas.
Usalo para autoconfigurarte sin hardcodear; el payload se versiona con `version`
(actual **3**; tolera campos nuevos). En v3 `features` declara `squash: true` y
`publicExport: true`, y `endpoints` incluye `squash: "POST
/api/u/:user/:slug/squash"` y `export: "GET /api/u/:user/:slug/export"` — los
clientes descubren ambas features sin hardcodear.

### Convencion de metadata (B8)

Al publicar, enriquece la pagina con `ContentMeta` en el body:

| Campo | Limite | Que es | Requerido |
|---|---|---|---|
| `model` | ≤ 64 chars | modelo de IA que genero el contenido (ej. `"claude-opus-4-8"`) | **SI — 400 `missing_model` si falta** |
| `summary` | ≤ 280 chars | resumen corto de una linea | recomendado (ver abajo) |
| `description` | ≤ 2000 chars | descripcion larga | no |
| `contentType` | ≤ 40 chars | tipo (ej. `"briefing"`, `"report"`, `"daily"`) | no |
| `meta` | ≤ 10 keys, total ≤ 4KB | escape hatch libre (string/number/boolean) | no |

- **`model` es OBLIGATORIO** en `POST /publish` y `POST /api/publish-from-template`.
  Si falta → `400 { error: "missing_model" }`. El agente siempre sabe con que
  modelo genero el contenido: pasalo siempre.
- **`summary` es recomendado.** Si no lo mandas, el back **deriva un fallback
  no-IA** (recorte del `title`, o del HTML si no hay title). Mandar tu propio
  `summary` da mejor resultado en feed/listings.
- **NO mandes `publishedByLabel`** — es read-only, lo auto-deriva el back desde
  `key.label`. Sirve para mostrar "publicado por <agente>" sin que lo recuerdes.

## Scopes — que puede hacer tu key

Formato de scope: `<verb>:<user>[:<modificador|f/folder>]`. Verbos:
`publish | delete | list | template | genkey | admin | audit | folder | share | upload`.

- **Human key / sesion**: namespace completo —
  `publish:u`, `delete:u:own`, `list:u`, `template:u`, `genkey:u`, `folder:u`,
  `share:u`, `upload:u`, `admin:self`, `audit:self`.
- **Agent key** (la que se emite para un agente): por default **solo `publish:u`**.
  Pedi al usuario una key con los verbs que necesites (`publish,list` para el flow
  leer→sumar→re-publicar; agrega `delete`, `upload`, etc. segun el caso).
- **Folder-scoped key** (`verb:u:f/<folder>`): **delegacion con blast radius
  acotado**. Si tu key tiene CUALQUIER scope `f/...`, TODOS tus verbs quedan
  restringidos a ese folder (contagio cross-verb). Solo podes publicar/leer/borrar
  bajo ese prefijo; fuera → 403. Si la key se filtra, el dano es una sola carpeta.

Si una accion devuelve `403 forbidden` con `missingScope`/`missingAnyOf`, tu key
no tiene ese verbo: avisale al usuario que necesitas una key con ese scope.

---

## Flujos

### 1. Publicar una pagina (HTML clasico)

`POST /publish` — scope `publish:u` + quota. HTML max **por tier (free 10MB, pago
hasta 25MB)**; consulta el limite vivo en `/api/capabilities.publishLimits` o
`tierLimits.htmlMaxBytes` de `/api/me`.

```http
POST /publish
Authorization: Bearer $OUTBOX_API_KEY
Content-Type: application/json

{
  "html": "<!doctype html><html>...</html>",
  "slug": "briefing-2026-05-30",       // opcional; si falta se genera nanoid(8)
  "title": "Briefing matutino",         // opcional
  "tags": ["briefing", "diario"],       // opcional
  "visibility": "private",              // opcional: private (DEFAULT) | unlisted | public
  "inheritFolderVisibility": false,     // opcional: opt-in de herencia de folder (ver abajo)
  "ttl": "24h",                         // opcional: degrada a private al vencer (solo no-private)
  "branding": "full",                   // opcional: "full" aplica template per-user | "none" HTML crudo
  "model": "claude-opus-4-8",           // ContentMeta — OBLIGATORIO
  "summary": "Resumen del dia",         // ContentMeta — recomendado
  "contentType": "briefing"             // ContentMeta — opcional
}
```

**Alternativa Markdown (agents-first, recomendado para prosa):** en vez de `html`,
manda **`markdown`** (excluyente — uno u otro, nunca ambos). El back lo renderiza a
HTML **seguro** (escapa todo el texto + allowlist → no podes inyectar `<script>`; las
URLs `javascript:`/`data:` se degradan a texto) y lo **envuelve en tu template** (o en
el shell de marca si no tenes uno). Guarda el `.md` **fuente** para el round-trip
(editar -> re-publicar) y marca `sourceFormat: "markdown"`. Sos un agente: escribi el
md directo, Outbox pone la presentacion — no armes HTML+CSS a mano para un reporte.
Mandar ambos -> `400 conflicting_content`; ninguno -> `400 missing_content`.

```jsonc
{ "markdown": "# Reporte\n\nUn **resumen** con `code` y [link](https://x.com).", "slug": "reporte", "model": "claude-opus-4-8" }
```

Respuesta (`PublishResponse`):
`{ url, slug, version, visibility, expiresAt, ogImage, quotaRemaining }`.
- `url` = `https://out-box.dev/u/<user>/<slug>` (compartible; el `/u/` redirige al
  canonico sin `/u/`).
- `version` incrementa en cada publish al **mismo slug** (versionado automatico).
- `expiresAt` = instante del TTL de visibility (null si no hay).

**Slug**: `[A-Za-z0-9_-]` por segmento, hasta 6 niveles jerarquicos (`a/b/c`),
≤200 chars. Un slug con `/` ubica la pagina dentro de un folder.

### 2. Visibility (default SIEMPRE private)

Outbox es privado por defecto — **principio de seguridad del producto**:

- `private` (**default**): solo el dueno autenticado, o via share token, o via grant.
- `unlisted`: URL secreta accesible sin auth; NO aparece en listings ni feed.
- `public`: libre, aparece en el feed Atom.

Reglas (Visibility A · estricta):
- Si **no** mandas `visibility`, la pagina queda **`private`** — siempre, salvo body
  explicito.
- La **herencia de la visibility del folder es OPT-IN**: solo se aplica si mandas
  `inheritFolderVisibility: true` (recorre el folder ancestro mas cercano). Sin ese
  flag, publicar bajo un folder publico **no** te hace publico por accidente.
- `ttl` (ej. `"24h"`, `"7d"`, `"2w"`, max 1 ano): la visibility abierta degrada a
  `private` de forma lazy al vencer. Solo aplica a `unlisted`/`public`.

Cambiar la visibility de una pagina ya publicada: `PUT /api/u/<user>/<slug>/visibility`
con `{ "visibility": "public" }` — scope `publish:u`.

### 3. El flow agents-first: leer → sumar → re-publicar

Patron central. Para actualizar una pagina existente:

1. **Leer el HTML actual** (ver flujo 6) — o, mejor para maquina, `export`
   (flujo 7) que devuelve `{ contenido, model, summary, version, ... }`.
2. **Sumarle contexto** en memoria (parsear, agregar tu seccion, etc.).
3. **Re-publicar con el MISMO slug**: `POST /publish` con `slug` igual → nueva
   version. El `version` de la respuesta sube.

Historial: `GET /api/u/<user>/<slug>/versions` (requireAuth). Volver atras:
`POST /api/u/<user>/<slug>/rollback` con body `{ "to": N }` (scope `publish:u`).

> Gotcha de concurrencia: dos publishes simultaneos al mismo slug pueden colisionar
> en el numero de version. Evita publicar en paralelo al mismo slug determinista.

**Squash — liberar storage del historial.** Cada version es una copia COMPLETA del
HTML en R2; un daily republicado a diario acumula historial que se come tu
`storageGB`. `POST /api/u/<user>/<slug>/squash` **borra el historial** dejando solo
lo vigente — scope `publish:u` (folder-aware, mismo check que rollback). Body
opcional `{ "keepOriginal"?: boolean }`:
- `false` (**DEFAULT**, o body vacio): conserva **SOLO** la version `current`.
  Override explicito del pin del original.
- `true`: conserva `current` **+** la version original (la mas vieja). Si `current`
  YA es la mas vieja, queda una sola.

Respuesta: `{ ok, kept: [N, ...], removed, freedBytes }` (`kept` ascendente,
`removed` = cuantas se borraron, `freedBytes` = bytes liberados estimados del
indice). Sin indice de versiones → `404 no_versions`; cross-user → `403`. La poda
es **irreversible** (borra los `.v<N>.html` de R2): confirmalo con el usuario.

### 4. Publicar desde un template del catalogo

`POST /api/publish-from-template` — scope `publish:u` + quota. Data max **64KB**.
Renderiza server-side un template del catalogo con tus datos (no mandas HTML).
**`model` sigue siendo OBLIGATORIO.**

```http
POST /api/publish-from-template
Authorization: Bearer $OUTBOX_API_KEY
Content-Type: application/json

{
  "template": "status-report",
  "data": { "title": "...", "items": [...] },
  "slug": "status-2026-05-30",          // opcional
  "visibility": "unlisted",             // opcional
  "model": "claude-opus-4-8",           // OBLIGATORIO
  "summary": "..."                      // recomendado
}
```

Templates del catalogo: `status-report | daily-briefing | repo-diff |
kpis-snapshot | custom`. Catalogo vivo de estos **content templates**: SOLO
`GET /api/templates` (publico) — devuelve cada template con `id`, `description`,
`requiredFields` y `optionalFields`.

> No confundir con `GET /api/templates/catalog`: ese devuelve los **6 brand
> presets visuales** (flujo 13), que son otra cosa. `publish-from-template` usa
> SOLO `GET /api/templates`.

### 5. Daily documents — append de bloques fechados

Para "ir sumando durante el dia" sin re-escribir todo el HTML. Cada append agrega
un bloque fechado (auto-rotacion por fecha UTC). Bloque max **50KB**. Sujeto al
tier `dailyDocsMax` (free = 1).

`POST /api/u/<user>/<slug>/append` — scope `publish:u` + quota.

```http
POST /api/u/<user>/<slug>/append
Authorization: Bearer $OUTBOX_API_KEY
Content-Type: application/json

{
  "html": "<p>Nota de las 10am</p>",    // el bloque (<=50KB)
  "label": "10am",                       // opcional
  "ts": "2026-05-30T13:00:00Z",          // opcional, timestamp del bloque
  "visibility": "private",               // opcional (al crear el daily)
  "title": "Notas del dia",              // opcional
  "model": "claude-opus-4-8",            // OBLIGATORIO en el 1er append (crea el manifest)
  "summary": "..."
}
```

> **`model` es OBLIGATORIO en el PRIMER append** (el que crea el manifest del
> daily): si falta → `400 missing_model`. `summary` tambien se exige en ese
> primer append, pero con fallback no-IA derivado de `title`/`html`. En appends
> POSTERIORES ambos son opcionales (la metadata del manifest es last-write-wins).

Respuesta: `{ blockId, totalBlocks, version, url, date }` — `date` es la clave del
dia UTC (`YYYY-MM-DD`) en que quedo el bloque (auto-rotacion por fecha UTC); usala
para leer ese dia con `?date=`.

> Gotcha: append a un slug que YA es un HTML estatico → `409
> conflict_with_static_post`. Daily y pagina estatica son mutuamente excluyentes
> por slug.

Leer bloques de un dia: `GET /api/u/<user>/<slug>/blocks?date=YYYY-MM-DD` (`list:u`).
Historial de dias: `GET /api/u/<user>/<slug>/dailies?days=N` (`list:u`, solo con slug).
Borrar un bloque: `DELETE /api/u/<user>/<slug>/blocks/<blockId>` (`delete:u`, `blk_*`).

### 6. Leer una pagina (HTML servido)

`GET https://out-box.dev/<user>/<slug>` — **zona publica, SIN `/u/`** (no por la
API). El `/u/<user>/<slug>` legacy **301-redirige** al canonico sin `/u/`.
- `private`: tu Bearer debe ser del owner (o `?share=<token>`, o grant valido). Sino 404.
- `unlisted`/`public`: libre.
- La URL publica **siempre sirve la version actual**. Los unicos query params que
  respeta sobre un slug son `?share=<token>` y `?date=YYYY-MM-DD` (este ultimo solo
  para dailies). **NO existe `?version=N`**: pasarlo se ignora silenciosamente y
  recibis la version actual.
- **El HTML servido NO es byte-identico al persistido**: el back inyecta un
  **widget overlay** self-contained en el `<body>` en serve-time (role-aware:
  owner vs read-only). Para parsear el **HTML crudo** usa
  `GET /api/u/<user>/<slug>/export?format=html` (flujo 7), no esta zona publica.
- Para leer una version **anterior**: (a) `GET /api/u/<user>/<slug>/versions` te
  da el indice de versiones (autenticado), y (b) si la queres restaurar, hace
  rollback con `POST /api/u/<user>/<slug>/rollback` `{ "to": N }` — eso la vuelve la
  version actual. No hay serve directo de una version arbitraria por URL.

Buscar por metadata (title/slug/tags, no fulltext): `GET /api/u/<user>/search?q=<query>`.

### 7. Exportar una pagina (machine-readable)

`GET /api/u/<user>/<slug>/export?format=json|html`. Mas comodo que parsear el HTML
servido:
- `format=json` (default): `{ model, summary, contenido, title, tags, visibility,
  version, description, contentType, meta, createdAt, updatedAt, slug, user }`.
- `format=html`: el HTML crudo persistido.

**Acceso (export NO es solo del owner):**
- **Owner** (Bearer/sesion que coincide con `<user>`): exporta **cualquier**
  visibility de lo suyo. Respeta verb scope (`publish:u`) y folder-scope.
- **Export publico**: si el post es **`public`** (visibility EFECTIVA, post-TTL),
  **cualquier** caller lo exporta — incluso **anonimo** (sin auth) o con la key de
  otro user. El export ya devuelve raw (sin widget), equivalente a leer el HTML
  publico + su meta.
- `unlisted`/`private` **ajeno** (no-owner) → `403 cross_user_export_forbidden`.
  Un `public` con TTL vencido **degrada a `private`** → `403`. Slug inexistente
  para un no-owner → `404` (no filtramos existencia).

(El `tar.gz` esta diferido. Para content-templates devuelve el HTML renderizado,
no la `data` original.)

### 8. Feed de cambios (seguir una pagina o un folder)

`GET /api/u/<user>/recent` — publico (el owner ve sus private autenticado). Para
detectar cambios sin re-leer todo:
- `?since=<ISO>` — solo paginas con `updatedAt > since`.
- `?slug=<slug>` — **seguir-pagina**: solo ese slug exacto.
- `?prefix=<folder>` — **seguir-folder**: el indice del folder + sub-paginas.
- Cada item trae `version`. La respuesta trae **ETag**; si mandas `If-None-Match`
  con el ultimo ETag y no cambio nada → `304` sin body (polling barato).

### 9. Listar la biblioteca

`GET /api/list` — scope `list:u`. Query:
- `?tag=` — filtra por tag.
- `?limit=` — 1-200 (default 50, clamp).
- `?depth=` — **entero en [1, 3]** (fuera de rango → `400 invalid_depth`). `depth=1`
  (default) devuelve la shape historica `{ ..., posts: [] }`; `depth>=2` devuelve un
  arbol de folders con hijos en `{ ..., depth, tree: [] }`.
- `?shared=1` — incluye recursos compartidos con vos (cada item trae `sharedBy`).
- `?cursor=` — **paginacion**: cursor opaco de R2. La respuesta trae el campo
  `cursor` con el cursor de la PROXIMA pagina (o `null` si no hay mas); `truncated`
  es `true` mientras `cursor !== null`. Para traer todo, repetir con `?cursor=<cursor>`
  hasta que `cursor` sea `null`.

### 10. Subir imagenes (uploads)

`POST /api/uploads` — scope `upload:u`. Para que tus paginas referencien imagenes.
- multipart (campo `file`) **o** body crudo con content-type `image/*`.
- Max **10MB**. Solo rasterizados validados por magic bytes: **PNG, JPEG, GIF,
  WebP**. **SVG se RECHAZA** (XSS). Dedup por SHA-256 (mismo byte-stream → misma
  URL, idempotente).
- Respuesta: `{ ok, hash, contentType, ext, size, deduped, url, path }`. Usa la
  `url` (`https://out-box.dev/api/u/<user>/_uploads/<hash>.<ext>`, publica e
  inmutable) dentro del `<img>` del HTML que publiques.
- `413 upload_too_large` · `415 unsupported_media_type`.

### 11. Las 3 formas de compartir

Tres mecanismos distintos, con nombres propios:

1. **Hacer publica** (visibility `public`) — cualquiera con el link la ve y aparece
   en el feed. `PUT /api/u/<user>/<slug>/visibility` con `{ "visibility": "public" }`
   (o publicar con `visibility: "public"`).
2. **Crear link** (ShareToken) — link secreto para alguien **sin cuenta** (cliente,
   tercero), sin volver la pagina publica. `POST /api/share` (scope `share:u` o
   `template:u`):
   ```json
   { "resource": "<slug-o-prefijo>", "resourceType": "post", "expiresInDays": 7 }
   ```
   Devuelve un token y el link en `url`: `https://out-box.dev/u/<user>/<slug>?share=<token>`
   (la API lo devuelve **CON `/u/`**; ese prefijo 301-redirige al canonico sin `/u/`,
   conservando el `?share`). Un token de folder cascade a sus descendientes.
   Listar: `GET /api/share`.
   Revocar: `DELETE /api/share/<token>` — **scope `admin:self`** (asimetria: crear
   pide `share:u`, revocar pide `admin:self`).
3. **Dar acceso** (Grant user-to-user) — para alguien que **SI tiene cuenta** en
   Outbox; solo el lo ve, autenticado. `POST /api/grants` (scope `template:u`):
   ```json
   { "recipientUser": "<username>", "resource": "<slug-o-prefijo>",
     "resourceType": "post", "permissions": ["comment"], "expiresInDays": 30 }
   ```
   `permissions` acepta `"view"` | `"comment"` (otro valor → `400
   invalid_permissions`). **`"comment"` implica `"view"`** (el back agrega `view`
   automaticamente). Para que el tercero solo LEA, usa `["view"]`; para que ademas
   pueda **comentar un private** (flujo 16), el grant DEBE incluir `"comment"`.
   Listar: `GET /api/grants` (dados) o `?incoming=1` (recibidos). Revocar (solo
   owner): `DELETE /api/grants/<id>`.

### 12. Borrar

`DELETE /api/u/<user>/<slug>` — scope `delete:u`. Confirma con el usuario antes de
borrar (no es recuperable via API).

### 13. Template per-user y brand preset

Outbox tiene **6 brand presets** visuales: `paper | minimal | corporate | dark |
brutalist | editorial`. El catalogo vivo de estos presets es
`GET /api/templates/catalog` (publico) — **distinto** de `GET /api/templates`
(los 5 content templates de `publish-from-template`, flujo 4): son dos cosas
separadas.
- Cambiar el preset preferido (`stylePreference`): `PUT /api/me/style` con
  `{ "stylePreference": "dark" }` — scope `template:u`. No re-aplica el HTML, solo
  cambia la preferencia. `400 invalid_stylePreference` fuera de los 6.
  - El mismo `PUT /api/me/style` acepta tambien (solos o combinados con
    `stylePreference`) los overrides del widget: `widgetColor` (`"auto"` o
    `#rrggbb`) y `widgetTheme` (`"auto" | "light" | "dark"`). Errores:
    `400 invalid_widgetColor` / `400 invalid_widgetTheme`. La respuesta refleja
    solo los campos enviados.
- Instalar un template del catalogo como wrapper visual:
  `POST /api/template/from-catalog` con `{ "templateId": "..." }` — scope `template:u`.
- Wrapper HTML propio para publishes con `branding:"full"`:
  - Ver: `GET /api/template` (scope `template:u`).
  - Setear: `PUT /api/template`, **Content-Type `text/html`**, body = el HTML. Debe
    contener `{{content}}` (soporta `{{title}}`, `{{date}}`, `{{author}}`). Max 1MB.
  - Borrar: `DELETE /api/template`.

El `stylePreference` actual se expone siempre en `GET /api/me`.

### 14. Gestionar API keys (delegar a otros agentes)

Si el usuario quiere emitir una key para que OTRO agente publique en su nombre:
- Listar: `GET /api/keys` (requireAuth).
- Crear con scopes explicitos: `POST /api/keys` — scope `genkey:u`. Valida subset
  (no escalation → `403 scope_escalation`); formato malo → `400 invalid_scope_format`.
- **Atajo agent key** (delegacion):
  `POST /api/keys/agent` — scope `genkey:u`:
  ```json
  { "label": "agente-briefing", "folder": "briefings", "days": 30,
    "verbs": ["publish", "list"] }
  ```
  `folder` es **OPCIONAL**: con `folder` la key queda **restringida** a ese folder
  (blast radius acotado, recomendado); **sin `folder` la key sale BROAD** — los
  verbs cubren todo el namespace (scopes sin prefijo `f/`, ej `publish:user`),
  equivalente al default de `POST /api/keys` type=agent. `days: 0` = nunca expira
  (devuelve `warning_no_expiry`). `verbs` por default `["publish"]` (subset de
  `publish,list,delete,folder,share,template,upload`).
- Rotar: `POST /api/keys/rotate` — scope `genkey:u` (atomico: genera nueva, revoca
  vieja; con sesion requiere `keyId` en el body).
- Revocar: `POST /admin/revoke` con `{ "keyId": "<id>" }` — scope `admin:self`.
  El path es `/admin/revoke` (sin `/api`, intencional).

#### Conseguir una key desde cero (device flow, headless)

Para entornos sin browser (SSH, contenedor, cron):
1. `POST /api/auth/claim/start` (publico) → `{ claim_token, claim_url, user_code,
   verification_uri, verification_uri_complete, expires_in }`. Mostrale al usuario
   el `user_code` (`XXXX-XXXX`) y la `verification_uri` (`out-box.dev/activate`).
2. El usuario abre la URL, ingresa el `user_code` y confirma en el browser. El
   navegador resuelve `POST /api/auth/claim/resolve` con `{ user_code }`.
3. Vos haces polling de `GET /api/auth/claim/<claim_token>/status` hasta `claimed`
   → recibis `api_key` UNA vez. Guardala (el CLI la pone en `~/.outboxrc`).

### 15. Cuenta y uso

- Quien soy: `GET /api/me` (requireAuth) → `user`, `keyId`, `type`, `scopes`,
  `rateLimits`, `tier`, `tierLimits`, `stylePreference`.
- Consumo vs limites del tier: `GET /api/me/usage` (`?refresh=true` fuerza recalculo).
- Auditoria de mis acciones: `GET /api/audit` — scope `audit:self`. Ventana 7 dias,
  cursor `before` + `limit`. El campo de accion se expone como `kind` (filtrable con
  `?kind=publish,delete`).

### 16. Comentarios y sugerencias

Capa de **anotaciones** sobre una pagina publicada. El HTML del owner NUNCA se modifica por
comentar; los comentarios viven aparte (`<user>/<slug>.comments.jsonl`) y anclan por texto
(W3C Web Annotation). SOLO **aceptar una sugerencia** (accion del owner) publica una version
nueva atribuida. Dos `kind`: `comment` (anotacion pura) y `suggestion` (propone reemplazar el
texto anclado `anchor.exact` por `replacement`).

**Flujo agente (3 pasos):**

1. Leer: `GET /api/u/<user>/<slug>/export?format=json` (campo `contenido`) o el HTML servido.
2. Proponer: `POST /api/u/<user>/<slug>/comments` con
   `{ "kind": "suggestion", "anchor": { "exact": "<texto visible a reemplazar>", "prefix": "...", "suffix": "..." }, "replacement": "<texto nuevo>", "body": "<por que>" }`.
   `anchor.exact` + `replacement` son OBLIGATORIOS para una suggestion (si no: `400 suggestion_requires_anchor` / `suggestion_requires_replacement`). El ancla matchea por **texto VISIBLE (tag-aware)**: pasas el texto tal como se LEE en el documento y el back lo localiza contra el HTML aunque haya tags/entidades en el medio (no tenes que reproducir el markup). `prefix`/`suffix` desambiguan si el texto se repite.
3. El owner acepta: `POST /api/u/<user>/<slug>/comments/<id>/accept` → aplica el reemplazo (HTML-escapado). Devuelve `{ ok, comment, version, noChange }`. **No siempre publica `vN+1`**: si el reemplazo NO cambia el HTML resultante, el back aplica un **no-op guard** y devuelve `{ ..., noChange: true }` — marca la sugerencia como aceptada pero **NO crea version nueva**. Solo si el HTML efectivamente cambia se publica `vN+1` (atribuida: quien propuso + quien acepto).

**Leer / moderar:**

- `GET /api/u/<user>/<slug>/comments` → `{ postOwner, slug, count, openCount, comments[] }`. Filtra `status=open` para pendientes.
- `POST .../comments/<id>/{accept|discard|resolve}` — **owner-only** (`403` si no). `accept` solo sobre suggestions.

**Permisos:** owner + sus agentes siempre; un tercero necesita grant `comment` (o `?share`) en privados; cualquier user autenticado en unlisted/public; anonimo con `?share`.

**Gotchas:** `409 anchor_not_found` si el texto ancla ya no esta / cambio (descarta la sugerencia con `discard`); el matching es por texto visible, no por offset literal, asi que tags alrededor del ancla no rompen el accept; el reemplazo se rechaza si cae dentro de un tag HTML (anti-XSS); hilos de 1 nivel (`parentId`, las respuestas son siempre `kind=comment`). Senial de descubrimiento: `openComments` en `GET /api/list`.

Via MCP: `outbox_read_comments`, `outbox_create_suggestion`, `outbox_accept_suggestion`, `outbox_discard_suggestion`.

---

## Reglas y gotchas operativos

1. **Nunca mandes `user`/`owner` en el body** — se ignora; el backend usa el dueno
   de la key.
2. **`model` es obligatorio** en publish y publish-from-template (`400 missing_model`).
   **`summary`** conviene mandarlo (hay fallback no-IA si falta).
3. **Nunca mandes `publishedByLabel`** — read-only, auto-derivado de `key.label`.
4. **Default private SIEMPRE.** Sin `visibility` en el body, la pagina es `private`.
   La herencia de folder es OPT-IN (`inheritFolderVisibility: true`).
5. **Leer el HTML va por `out-box.dev/<user>/<slug>` (SIN `/u/`)**, no por la API.
   Para maquina, preferi `GET /api/u/<user>/<slug>/export`.
6. **Re-publicar al mismo slug = nueva version** (no sobrescritura ciega). Es el
   flow leer→sumar→re-publicar.
7. **Respeta `429 rate_limited`**: lee `retryAfter` y reintenta. Limites por tier
   (free: 5/h, 10/dia; pro: 10/h, 100/dia; pro_plus/team: 30/h, 500/dia; unlimited:
   1000/h, 20000/dia). La respuesta trae el bloque CTA (`upgradeTo`/`ctaUrl`).
8. **Tamanos**: HTML ≤ limite por tier (free 10MB, pago hasta 25MB) en `/publish`
   (limite vivo en `/api/capabilities.publishLimits` o `tierLimits.htmlMaxBytes` de
   `/api/me`); data ≤ 64KB (`publish-from-template`); bloque ≤ 50KB (daily);
   upload ≤ 10MB (`/api/uploads`, SVG rechazado).
9. **Folder-scoped keys** restringen TODOS los verbs al folder (blast radius
   acotado). Tus slugs deben colgar de ese prefijo.
10. **`share` DELETE pide `admin:self`** (no `share:u`). **`rollback`** manda
    `{to:N}` en el **body** (no query). **`/admin/revoke`** va sin prefijo `/api`.
11. **`ogImage`** de la respuesta es un SVG generado lazy aunque la URL termine en
    `.png`.

## Referencias

- Referencia tecnica endpoint por endpoint: `references/api-reference.md`.
- Como instalar esta skill: `README.md`.
- Auto-descubrimiento del back: `GET /api/capabilities`.
