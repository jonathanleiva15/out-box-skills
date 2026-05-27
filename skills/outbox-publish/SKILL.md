---
name: outbox-publish
description: Publica, lee, actualiza y gestiona HTMLs en Outbox (out-box.dev) — la biblioteca privada en línea agents-first del usuario. Trigger cuando el usuario diga "publicá esto en mi Outbox", "mandá a Outbox", "subí a out-box.dev", "qué tengo en notas de hoy", "actualizá mi briefing", "leé mi Outbox y agregale X", "armame el link de Outbox", "qué publiqué", "borrá X de Outbox", o cualquier referencia a leer, escribir, actualizar o gestionar contenido publicado en su espacio personal. También cuando el usuario quiera emitir API keys para agentes que vayan a publicar en su nombre, configurar templates, cambiar visibility de un post, generar share links, o ver qué publicó previamente. Outbox es agents-first — el caso de uso central es agentes que durante el día leen un HTML existente, le suman contexto/información, y lo re-publican (versioning automático). Esta skill cubre todos esos flows.
metadata:
  author: jonathanleiva15
  version: "1.1.0"
  homepage: https://out-box.dev
  repository: https://github.com/jonathanleiva15/out-box-skills
---

<!-- CHANGELOG
v1.1.0 · 2026-05-27 — Reflejar 5 bugs fixeados + feature publishedByLabel:
  - Bug A: serve respeta meta.visibility (no aplica mostRestrictive — sección 6).
  - Bug B + 8 residuales: folder-scoped keys funcionan en TODOS los verbs (sección 6.1
    tabla expandida con publish/delete/list/folder/share/template).
  - Bug C: cookie session reconocida en endpoints públicos (sección 6.2 nueva).
  - Bug D (P0): tier:'team' bloqueado con 503 team_early_access (tabla de errores).
  - publishedByLabel auto-enriquecido desde key.label (sección 6.3 nueva).
  - Audit endpoint con 5 kinds nuevos: visibility_change, key_rotate, share_create,
    share_revoke, agent_instantiate.
  - Recomendación fuerte: incluir `summary` en cada publish (sección Paso 2.5).
  - Endpoint nuevo: GET /api/admin/scan-exposed (admin:self, diagnóstico).

v1.0.0 · 2026-05-25 — Sprint 5: tree API + share tokens + grants user-to-user.
-->


# outbox-publish

Skill para que cualquier agente IA interactúe con **Outbox** ([out-box.dev](https://out-box.dev)) — la biblioteca privada en línea agents-first del usuario. Cubre los 8 flows principales: **publicar**, **leer**, **read-modify-write**, **daily docs**, **listar**, **borrar**, **gestionar keys/templates**, y **agents registry**.

## Qué es Outbox (para el agente)

> *"Tu biblioteca privada en línea, escrita por tus agentes."*

Outbox es una API de publicación de HTMLs donde:
- Cada usuario tiene un namespace aislado: `https://out-box.dev/u/<username>/<slug>`
- Los HTMLs persisten para siempre, versionados automáticamente
- Cada usuario tiene 3 niveles de visibility: `private` (solo owner), `unlisted` (URL secreta), `public` (auto-index)
- Hay un audit log de cada escritura
- Hay quotas por hora/día (default 20/h, 100/día para humanos · 5/h, 50/día para agents)
- La identidad visual es "paper + Newsreader serif + oxide red" — `https://api.out-box.dev/api/design-system.css` es consumible directamente

**Punto clave para agentes:** el flow más interesante es **read-modify-write** — un agente lee el HTML existente de un slug (ej. `notes/hoy`), le suma información nueva, y lo re-publica al mismo slug. El sistema versiona automáticamente (v1, v2, v3, ...) y permite rollback.

## Cuándo activar esta skill

- Usuario pide publicar HTML/artifact/mockup/reporte/briefing
- Usuario menciona "Outbox", "out-box.dev", "mi espacio", "mi biblioteca"
- Usuario dice "leé X de mi Outbox" o "qué tengo publicado en X"
- Usuario dice "agregale a X" o "actualizá mi notes/hoy con esto"
- Usuario quiere listar, borrar, o cambiar visibility de posts
- Usuario necesita emitir/gestionar API keys

## Cuándo NO activar

- Usuario quiere publicar en GitHub Pages / Vercel / Netlify / cualquier servicio que NO sea Outbox
- Usuario solo quiere generar HTML pero NO publicarlo
- Usuario pregunta info sobre Outbox como producto (responder directo, no usar skill)
- Usuario está debugeando o contribuyendo al código de Outbox mismo (usar la skill `outbox-project` que es para development)

---

## 2. Setup desde cero

El usuario llega a vos sin cuenta de Outbox. Tu trabajo: hacer setup sin pedirle credenciales por chat.

### 2.1 Detectar si tiene key

Si el agente ya tiene una `OUTBOX_KEY` en su config: validá con `GET /api/me`. Si responde 200, está todo OK — saltá a Flow 1.

Si la key es inválida o no hay key: andá a 2.2.

### 2.2 Claim flow (browser handoff)

Es el método recomendado. Cero credenciales por chat, cero pegar API keys.

**Cómo lo hacés:**

1. `POST /api/auth/claim/start` (sin auth) — opcionalmente con `{ "agentLabel": "Claude en Cowork" }`
   Recibís: `{ claim_token, claim_url, expires_in: 600 }`

2. Decile al usuario:
   > "Para conectarte a Outbox, necesito que abras esta URL en tu browser:
   > **<claim_url>**
   > Te tomará 30 segundos: elegís OAuth Google/GitHub o email, después
   > confirmás cuánto tiempo me das acceso (24h / 90d / permanente). Te espero."

3. Hacé polling cada 3 segundos a `GET /api/auth/claim/<claim_token>/status`:
   - `{ status: "pending" }` → seguir esperando
   - `{ status: "claimed", api_key, user, keyId }` → **GUARDÁ la `api_key` inmediatamente**. Se devuelve UNA SOLA VEZ. El próximo polling devuelve `consumed` sin la key.
   - 410 `{ status: "expired" | "consumed" }` → el token venció o fue usado, abortá

4. Si pasaron 10 minutos sin `claimed`, el token expiró. Decile:
   > "No completaste a tiempo. ¿Probamos de nuevo?"

5. Cuando tengas la key, andá a 2.3 (onboarding) antes del primer publish.

### 2.3 Onboarding post-handoff con auto-detect del HTML

Antes del primer publish del user, hacé UNA pregunta inteligente.

**Paso 1 — chequear si ya hizo onboarding:**

```
GET /api/me → ver userRecord.onboardingState.templateChosen
```

Si no es `null` → onboarding ya completo, andá directo a publish.

**Paso 2 — mirar el HTML que el user te dio para publicar.**

Detectá si tiene estilos propios:
- ¿Tiene `<style>` con tokens visuales (colores, fonts)?
- ¿Tiene `<link rel="stylesheet">`?
- ¿Tiene `style="..."` inline en tags principales?
- ¿Tiene `<meta name="theme-color">`?

**Paso 3 — UNA pregunta según lo que viste:**

**Caso A — el HTML ya tiene estilos propios:**
> "Veo que tu HTML ya tiene estilos. ¿Querés que use ESTE estilo como tu template fijo (todos tus posts siguientes lo van a usar)? O ¿preferís elegir uno de la galería de Outbox?
>
> [1] Usar este HTML como mi template
> [2] Galería de Outbox (paper, minimal, corporate, dark, brutalist, editorial)
> [3] Sin template, HTML pelado siempre"

**Caso B — el HTML es plano:**
> "Para que tus posts tengan look propio, elegí un template:
>
> - **paper** — Newsreader serif, fondo crema (el default oficial)
> - **minimal** — Helvetica, blanco, máximo silencio
> - **corporate** — Inter, accent azul, para reportes formales
> - **dark** — JetBrains Mono, fondo negro, para technical posts
> - **brutalist** — Negro/amarillo, bordes 4px, statements
> - **editorial** — Playfair + Inter, drop caps, para long-form
>
> Decime cuál (o 'galería' para ver previews en https://out-box.dev/templates,
> o 'sin template' si querés HTML pelado siempre)."

**Paso 4 — aplicar:**

- Si eligió uno del catálogo: `POST /api/template/from-catalog` con `{ "templateId": "<id>" }`
- Si dijo "usar este": `PUT /api/template` con el HTML del primer post como template
- Si dijo "sin template": no llamés nada — el server no aplica wrapping si no hay `_template.html`

**Paso 5 — primer publish:**
Marcar `onboardingState.completedAt` en backend (lo hace automático el endpoint `from-catalog`), continuar con el publish original que disparó el flow.

### 2.4 Si el user ya tiene key

Si el user te dice "ya tengo una key de Outbox, te la paso" o vos sabés que tiene una (porque te la pasó antes):

- Validala con `GET /api/me` + `Authorization: Bearer <key>`
- Si responde 200 con `user`, `scopes`, `tier` → todo OK, guardala
- Si 401 → "Esa key no es válida o fue revocada. ¿Generamos una nueva con browser handoff?"

> **Nota:** desde Sprint A1 (2026-05-21) `GET /api/me` también acepta cookie de sesión (`outbox_session`) además del Bearer header. Para un agente, casi siempre vas a usar Bearer — la cookie es del browser. Si querés rotar la key del usuario desde el browser sin pasar por terminal, usá `POST /api/keys/rotate` (endpoint atómico nuevo).

---

## Flow 1: Publicar un HTML nuevo

**Trigger:** "publicá esto", "mandá a Outbox", "subí esto a out-box.dev"

### Paso 1 — Identificar el HTML

Por prioridad:
1. Si hay un artifact reciente tipo HTML → usar ese
2. Si el usuario referencia un archivo del workspace → leerlo
3. Si el usuario pegó HTML directo en el mensaje → usar ese
4. Sino: preguntar "¿qué HTML querés publicar?"

### Paso 2 — Recoger metadata (una sola pregunta combinada)

- **Title** — qué va en `<title>` del browser y en preview de Slack/Twitter
- **Slug** (opcional) — el path final. Default: auto-generado (8 chars random). Útiles: `today`, `briefing`, `notes/2026-05-20`, `proyectos/cliente-X`
- **Visibility** (opcional, default `private`) — `private` / `unlisted` / `public`
- **Tags** (opcional) — para filtrar después con `list --tag=X`
- **Notify Slack** (opcional) — pasar `#canal` para postear el link automáticamente

Si el usuario dice "lo que sea": defaults razonables (title inferido del `<h1>` o `<title>`, slug auto, private, sin Slack).

### Paso 2.5 — Metadata para análisis (RECOMENDADO — 2026-05-27 update)

Si tu agente sabe qué modelo está usando, qué tipo de contenido es y puede generar un resumen breve, **pasalo siempre**. Esto enriquece search, dashboards, analytics, feeds, y permite que el owner sepa qué/quién publicó cada post sin abrirlo.

**Convención fuerte (recomendado siempre):**
- `model` — qué modelo IA generó esto (ej: `"claude-sonnet-4.7"`, `"gpt-4o"`, `"gemini-2.5-flash"`). Max 64 chars.
- `summary` — **resumen breve estilo tweet, max 280 chars**. Aparece en feeds RSS, previews, search ranking (+4 si matchea query), y listings. Es lo que el owner ve en `/library` para escanear sus posts sin abrirlos.
- `contentType` — tipo de contenido. Sugeridos: `briefing`, `report`, `notes`, `post`, `mockup`, `data-viz`, `summary`, `release-note`, `other`. String libre con regex `[a-z0-9_-]{1,40}`. Search score +6 exact match.

**Campos opcionales:**
- `description` — descripción larga, max 2000 chars.
- `meta` — escape hatch `Record<string, string | number | boolean>`. Max 10 keys. Útil para `tokens_used`, `cost_usd`, `prompt_hash`, `session_type`, etc.

**Auto-enriquecido por el back (NO lo mandes en el body):**
- `publishedByLabel` — viene del `KeyRecord.label` de tu key, o `"browser-session"` si publicaste con cookie session. Permite que los listings muestren "publicado por <agente>" automáticamente. Ver sección 6.3 de detalles técnicos.

Ejemplo:
```json
{
  "html": "...",
  "title": "Briefing matutino 2026-05-24",
  "model": "claude-sonnet-4.7",
  "contentType": "briefing",
  "summary": "Resumen de la semana en ProContacto: 3 PRs cerradas, 2 deploys, 1 issue crítico.",
  "meta": { "tokens": 2400, "cost_usd": 0.06 }
}
```

Estos campos se persisten en el `.meta.json` y se devuelven en `GET /api/list`, `GET /api/u/:user/search`, y aparecen como `<description>` del item RSS si pasaste `summary`. El search scorea +6 si `contentType` matchea exacto y +4 si `summary` contiene la query.

### Paso 3 — POST /publish

```http
POST https://api.out-box.dev/publish
Authorization: Bearer outbox_xxxx
Content-Type: application/json

{
  "html": "<full HTML content>",
  "title": "Briefing matutino 2026-05-20",
  "slug": "briefing-hoy",
  "tags": ["briefing", "daily"],
  "visibility": "private",
  "notifySlack": "#joni-briefings",
  "branding": "full",
  "model": "claude-sonnet-4.7",
  "summary": "Mails procesados: 12. Prioridades del día: 3 PRs a revisar, reunión con cliente Solera 10am, deploy Outbox v0.4.",
  "contentType": "briefing"
}
```

> ⚠️ **NO incluyas `publishedByLabel` en el body** — el back lo enriquece auto desde tu `KeyRecord.label`. Si lo mandás, se ignora silenciosamente (defense in depth contra spoofing).

**Campos importantes:**

| Field | Tipo | Notas |
|---|---|---|
| `html` | string | El HTML completo. Max 5 MB. |
| `title` | string | Para `<title>` y OG card |
| `slug` | string opcional | Regex `[A-Za-z0-9_-]{1,64}` (con `/` permitido para jerarquía: `notes/2026-05-20`) |
| `visibility` | `private`/`unlisted`/`public` | Default `private`. **PRIVATE solo se ve con auth del owner.** |
| `branding` | `full`/`none` | `full` (default) aplica el template del user. `none` deja el HTML tal cual. (`'vars'` está en el type union pero no tiene lógica especial implementada — se comporta como `full`.) |
| `tags` | string[] | Max 10 tags |
| `notifySlack` | string | Canal con `#` para postear el link |
| `skipTemplate` | boolean | Equivalente a `branding: 'none'` |
| `ttl` | string opcional | ⚠️ **Está en el interface pero NO implementado** — el handler hardcodea `expiresAt: null`. Documentado como futuro pero no usar todavía. |

### Paso 4 — Response (200)

```json
{
  "url": "https://out-box.dev/u/joni/briefing-hoy",
  "slug": "briefing-hoy",
  "version": 1,
  "visibility": "private",
  "ogImage": "https://out-box.dev/og/joni/briefing-hoy.png",
  "quotaRemaining": { "perHour": 19, "perDay": 99 }
}
```

### Paso 5 — Responder al usuario

> ✅ Publicado en `https://out-box.dev/u/joni/briefing-hoy` (v1, private).
> *Briefing del lunes — 12 mails procesados, 3 PRs prioritarios, reunión Solera 10am.*
> OG card lista para Slack/Twitter. Te quedan 19 publish/h, 99/día.

**Patrón recomendado para confirmar al usuario** (2026-05-27):
- Confirmá la URL + visibility + versión
- Incluí el `summary` (1-2 líneas, italic) — recuerda al user qué publicó sin que abra el link
- Mencioná el agente publishing si el flow fue automático (ej. "publicado por *briefing-matutino-bot*")
- Quota restante al final

Esto se alinea con el `publishedByLabel` que el back persiste auto — cuando el user vea `/api/list`, los listings van a mostrar el mismo identificador.

---

## Flow 1.5: Publicar CON template (sin generar HTML)

**Trigger:** "publica el status report de X", "armá el daily briefing", "subí el diff de la semana", "publicá los KPIs del mes". Cuando el agente tiene los DATOS pero NO sabe generar HTML completo (típico de Custom GPTs, Zapier, n8n, agentes simples).

**Tesis:** vos pasás JSON estructurado + nombre del template; Outbox renderiza el HTML server-side respetando el `_template.html` per-user del propietario. La quota cuenta igual que un publish normal.

### Endpoint

```
POST https://api.out-box.dev/api/publish-from-template
Authorization: Bearer <API_KEY>
Content-Type: application/json

{
  "template": "status-report",         // ver galería con GET /api/templates
  "slug": "clientes/solera/2026-05-24",
  "title": "Status semanal Solera",     // opcional
  "data": {                              // schema depende del template
    "client": "Solera",
    "date": "2026-05-24",
    "highlights": ["Demo OK","API integrada"],
    "blockers": ["Esperando approval legal"],
    "nextSteps": "Próxima reunión técnica martes"
  },
  "visibility": "unlisted",              // opcional; hereda del folder si no se manda
  "tags": ["status","solera"]            // opcional
}
```

### Templates disponibles (galería pública)

Hacer `GET https://api.out-box.dev/api/templates` para listar id + schema actualizado. Los 5 templates v1:

| `template` id | Para qué | Required fields |
|---|---|---|
| `status-report` | PM que comparte progreso con cliente | `client`, `date`, `highlights[]`, `blockers[]`, `nextSteps` |
| `daily-briefing` | Briefing matutino con prioridades + meetings + metrics | `date`, `summary`, `priorities[]` |
| `repo-diff` | Diff de repo en un período | `repo`, `period`, `files[]` |
| `kpis-snapshot` | Snapshot de KPIs por período | `period`, `metrics[]` |
| `custom` | Escape hatch — `data.html` raw, wrappeado por el `_template.html` | `html` |

Detalles completos de cada schema en `skill/references/api-reference.md` (sección "Publish from template").

### Errores comunes

- `400 invalid_template` — el id no está en la galería. Pedir `GET /api/templates` para ver los disponibles.
- `400 missing_field` con `field: "<name>"` — falta un campo requerido. La galería declara cuáles son.
- `400 invalid_field` con `field: "<name>"` y `message` — el campo está pero con tipo equivocado (ej. `highlights` no es array de strings).
- `403 slug_not_under_allowed_folder` — la API key tiene folder-scope y el slug cae fuera. Mover el slug bajo el folder permitido o pedir una key con scope distinto.
- `413 data_too_large` — `data` excede 64KB. Trim el JSON o partir el contenido en varios publishes.
- `429 rate_limited` — counted igual que `/publish`. Reintentar después de `retry-after`.

### Cuándo NO usar este flow

- Tu agente YA sabe generar HTML completo y quiere control total → usa Flow 1 (`POST /publish` clásico).
- Querés override del CSS visual del user → ese es el `_template.html` (Flow 6 o `/api/template/from-catalog`), NO un content template.
- Tenés un caso que no encaja en los 5 schemas → usar `template: "custom"` con `data.html` raw, generado por tu agente.

---

## Flow 2: LEER un HTML existente (para procesarlo)

**Trigger:** "qué tengo en notas/hoy", "leé mi briefing", "traeme el HTML de X"

### Cómo leer

El HTML servido por `https://out-box.dev/u/:user/:slug` tiene **template + OG meta tags inyectados**, ideal para humanos pero ruidoso para agentes que quieren procesarlo.

**Para agentes, recomendado:** leer el HTML público o con auth Bearer, y stripear el template antes de procesar.

#### Opción A — Read sin auth (solo posts `public` / `unlisted`)

```http
GET https://out-box.dev/u/joni/notes-hoy
Accept: text/html
```

Devuelve el HTML completo (200) o 404 si el post es `private`/no existe.

#### Opción B — Read con auth (incluye `private`)

```http
GET https://out-box.dev/u/joni/notes-hoy
Authorization: Bearer outbox_xxxx
Accept: text/html
```

Mismo response, pero con auth ve también `private`.

#### Opción C — Read metadata + versión actual (recomendado para agentes)

```http
GET https://api.out-box.dev/api/u/joni/notes-hoy/versions
Authorization: Bearer outbox_xxxx
```

Devuelve:
```json
{
  "slug": "notes-hoy",
  "currentVersion": 3,
  "versions": [
    { "version": 1, "createdAt": "...", "size": 1240, "keyId": "abc12345" },
    { "version": 2, "createdAt": "...", "size": 2810, "keyId": "abc12345" },
    { "version": 3, "createdAt": "...", "size": 4120, "keyId": "abc12345" }
  ]
}
```

Útil para ver historial antes de modificar.

#### Stripear el template antes de procesar

El template aplica un wrapper alrededor del HTML real. Si el usuario configuró template (vía `pcpub template set`), el HTML que servís va a tener:

```html
<!doctype html>
<html><head>...<title>{{title}}</title>...
<!-- og meta tags injected -->
</head><body>
  <header>...template header...</header>
  <main>
    {{content}}   <!-- ← TU HTML ORIGINAL VA ACÁ -->
  </main>
  <footer>...template footer...</footer>
</body></html>
```

**Para extraer solo `{{content}}`:**
1. Buscar la zona entre los marcadores del template (depende del template — comúnmente `<main>...</main>` o un `<div id="content">`)
2. Strippear las meta tags OG (`<meta property="og:*">`) si las hay
3. Trabajar con el "core HTML" para parsearlo / modificarlo

**Recomendación:** si el usuario tiene template, decirle al agente: "el HTML está envuelto en tu template. ¿Stripeamos el template antes de procesar, o lo procesamos completo?"

---

## Flow 3: Read-Modify-Write (EL CASO CENTRAL agent-first) 🎯

**Trigger:** "agregá X a mi notes/hoy", "sumá esto al briefing", "actualizá X con lo nuevo"

Este es **el flow más interesante de Outbox**: el agente lee lo que ya hay, le suma información nueva, y lo re-publica al mismo slug. Versioning automatic.

### Paso 1 — Read el HTML actual

Usar Flow 2 opción B (con auth):

```http
GET https://out-box.dev/u/joni/notes-hoy
Authorization: Bearer outbox_xxxx
```

Si 404 → no existe todavía, va a ser un publish nuevo (Flow 1).

### Paso 2 — Procesar el HTML

Opciones según contexto:

#### Opción A — El agente reescribe TODO

El agente parsea el HTML, entiende qué hay, decide cómo integrar lo nuevo, y produce un HTML completo updated.

**Ejemplo:** usuario tenía `notes/hoy` con 3 bullet points, le pide al agente "sumale lo que dijo Pedro en la reunión". El agente:
1. Lee el HTML → ve los 3 bullets + cualquier sección "Reuniones"
2. Genera 4 bullets nuevos sobre Pedro
3. Construye HTML completo updated con 7 bullets total
4. POST `/publish` con `slug: "notes/hoy"` y el HTML completo

#### Opción B — Append simple (más rápido)

El agente solo agrega contenido al final, sin re-estructurar:

```html
<!-- HTML actual ... -->

<!-- ← Append acá -->
<section>
  <h2>Update 14:30</h2>
  <p>Lo nuevo que dijo Pedro en la reunión...</p>
</section>
```

#### Opción C — Diff/patch específico

Si el HTML tiene estructura clara (ej. una lista `<ul id="todos">`), el agente puede agregar solo el `<li>` nuevo, manteniendo todo lo demás idéntico.

### Paso 3 — Re-publicar al mismo slug

```http
POST https://api.out-box.dev/publish
Authorization: Bearer outbox_xxxx
Content-Type: application/json

{
  "html": "<html updated>",
  "title": "Notas 2026-05-20 (updated 14:30)",
  "slug": "notes/hoy",        ← MISMO slug → crea v2 automaticamente
  "visibility": "private",
  "branding": "none"          ← si el HTML ya viene completo, evitar wrap doble
}
```

El sistema:
1. Crea `notes/hoy.v<N>.html` con la nueva versión
2. Actualiza `_versions.json`
3. Sirve la new como current desde `out-box.dev/u/joni/notes/hoy`
4. Las versiones anteriores quedan accesibles vía `/api/u/joni/notes/hoy/versions`

**Si algo sale mal** → rollback con:
```http
POST https://api.out-box.dev/api/u/joni/notes-hoy/rollback?to=<previousVersion>
Authorization: Bearer outbox_xxxx
```

### Ejemplo concreto del caso del usuario

> *"Che agente, ¿qué tenés en notas de hoy?"*

```
1. Agente: GET https://out-box.dev/u/joni/notes/hoy + Bearer key
2. Recibe HTML (probably con template wrapper)
3. Stripea template si quiere procesar el "core"
4. Le muestra al usuario los puntos actuales en el HTML
5. El usuario dice: "sumá lo que dijo Mariano sobre el deploy"
6. Agente genera HTML updated (Opción A o B)
7. POST /publish con slug=notes/hoy, html=<updated>, branding=none
8. Sistema crea v2 automatic
9. Agente responde: "✅ Sumado a notes/hoy (v2). Te quedan X publish/h."
```

**Tip importante:** si el agente lo va a hacer N veces al día, usar **agent key con slug whitelist** `["notes/hoy", "briefing/today"]` — limita al agente a solo esos slugs, no puede tocar otros posts del user.

---

## Flow 4: Daily documents (Sprint A4 — preview)

**Trigger:** "armame un daily de hoy", "iniciá mi work log", "appendea esto al daily", "qué pasó hoy en mi daily"

Outbox tiene **daily documents** — HTMLs que se construyen durante el día appendando bloques en lugar de redeployar el archivo completo.

### Qué es

Un daily document vive en un slug determinístico (típicamente `today` o `daily/2026-05-21`). Durante el día se le agregan bloques (cada bloque es HTML chiquito — un párrafo, una sección, una tabla). El servidor los acumula y los sirve como **un documento coherente**.

A diferencia del Flow 3 (read-modify-write), **no necesitás leer el HTML actual + modificar + escribir todo**. Solo enviás el bloque nuevo y Outbox lo appendea. Sin race conditions, sin lectura previa.

### Disponibilidad por tier (decisión 6.5 del pricing)

| Tier | Daily docs activos |
|---|---|
| Free | 0 |
| Pro | 1 |
| Pro+ | 5 |
| Team | ilimitados |

### Appendear un bloque

```http
POST https://api.out-box.dev/api/u/joni/today/append
Authorization: Bearer outbox_xxxx
Content-Type: application/json

{
  "html": "<section><h3>14:30 — task completed</h3><p>Cerrado el OAuth Google flow</p></section>",
  "label": "task-complete",
  "ts": "2026-05-21T14:30:00Z"
}
```

`label` y `ts` son opcionales. Si no pasás `ts`, el servidor usa `now()` UTC.

#### Metadata enriquecida en daily docs (NUEVO)

El append acepta los mismos campos `model`, `contentType`, `summary`, `description`, `meta` que `POST /publish`. La semántica es ligeramente distinta:

- `model`, `contentType`, `summary`, `description` se setean a nivel **manifest** del daily (los 4 quedan en el `DailyManifest`). El primer append los inicializa. Appends posteriores pueden override (last-write-wins) o no incluirlos (preserva los existentes).
- `meta` se persiste **por block individual** — útil para taggear cada bloque con cosas como `tokens`, `cost_usd`, `tool_name`, `commit_sha`.

Ejemplo de un append con metadata rica:
```json
{
  "html": "<p>Cerré el OAuth Google flow</p>",
  "label": "task-complete",
  "model": "claude-sonnet-4.7",
  "contentType": "dev-log",
  "meta": { "tokens": 1200, "tool_name": "git", "commit_sha": "abc1234" }
}
```

### Listar bloques

```http
GET https://api.out-box.dev/api/u/joni/today/blocks
Authorization: Bearer outbox_xxxx
```

Devuelve el manifest ordenado con `id`, `ts`, `label`, `size` por bloque.

### Borrar un bloque específico

```http
DELETE https://api.out-box.dev/api/u/joni/today/blocks/<blockId>
Authorization: Bearer outbox_xxxx
```

### Servir el documento

```http
GET https://out-box.dev/u/joni/today
```

Devuelve el HTML completo con todos los bloques concatenados en orden cronológico, con el template del usuario aplicado.

---

## Automatización: hooks para appendear automáticamente al daily

El caso de uso más potente de daily docs es **auto-documentación de agentes IA**: cada vez que Claude Code, Cursor, Aider u otro agente termina una tarea, un hook dispara un append al daily document. Al final del día tenés un work log que se escribió solo.

### Patrón general

Cualquier sistema que pueda ejecutar callbacks/hooks al terminar una tarea puede appendear a Outbox. El flujo es:

1. La IA (o cualquier proceso) termina una tarea — commit, build, test, deploy, sesión, etc.
2. Se dispara un hook que llama `pcpub append today <archivo>` o un `curl` directo al endpoint
3. Outbox appendea el bloque al documento `today` (o el slug determinístico que elijas)
4. Al final del día, el daily document tiene la cronología completa

### Opción 1 — Claude Code Hooks (recomendado)

Claude Code soporta hooks configurables en `~/.claude/settings.json`. Hooks útiles para daily docs:

- **`Stop`** — se dispara cuando termina la sesión / la respuesta principal
- **`PostToolUse`** — después de cada tool execution (con `matcher` se filtra por tipo)
- **`SessionStart`** — cuando arranca una sesión nueva
- **`UserPromptSubmit`** — cuando el user envía un prompt

Ejemplo mínimo — appendear al final de cada sesión:

```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "pcpub append today --label='claude-session-end' --message='Sesión Claude Code terminada en ${PWD}'"
          }
        ]
      }
    ]
  }
}
```

Ejemplo más rico — appendear cada git commit que haga Claude Code:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "if echo \"$CLAUDE_TOOL_INPUT\" | grep -q 'git commit'; then ~/scripts/append-to-outbox.sh \"git commit: $CLAUDE_TOOL_INPUT\" git-commit; fi"
          }
        ]
      }
    ]
  }
}
```

> El flag `pcpub append today --message='...'` se introduce en Sprint A4 junto al endpoint. Mientras tanto, usar la opción 2 (curl directo).

### Opción 2 — Curl directo (cualquier agente / cualquier OS)

Para agentes que no usan Claude Code, o si querés un hook bash genérico que funcione en CI/CD, git hooks, cron, etc.:

```bash
#!/bin/bash
# ~/scripts/append-to-outbox.sh

OUTBOX_KEY="${OUTBOX_KEY:-$(cat ~/.outboxrc | jq -r .apiKey)}"
USER=$(cat ~/.outboxrc | jq -r .username)
MESSAGE="${1:-no message}"
LABEL="${2:-task-complete}"
TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Escapar HTML básico del mensaje
MSG_HTML=$(echo "$MESSAGE" | sed 's/</\&lt;/g; s/>/\&gt;/g; s/&/\&amp;/g')
BLOCK_HTML="<section><h3>${TS} — ${LABEL}</h3><p>${MSG_HTML}</p></section>"

curl -s -X POST "https://api.out-box.dev/api/u/${USER}/today/append" \
  -H "Authorization: Bearer ${OUTBOX_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"html\":$(echo -n "$BLOCK_HTML" | jq -Rs .),\"label\":\"${LABEL}\",\"ts\":\"${TS}\"}"
```

Usar:
```bash
~/scripts/append-to-outbox.sh "Deploy a producción OK" deploy
~/scripts/append-to-outbox.sh "Tests pasaron 195/195" test-pass
```

### Opción 3 — Git post-commit hook

Para que cada commit en cualquier repo aparezca en el daily:

`~/.git-templates/hooks/post-commit` (set up con `git config --global init.templateDir ~/.git-templates`):

```bash
#!/bin/bash
MSG=$(git log -1 --pretty=%B | head -1)
SHA=$(git log -1 --pretty=%h)
REPO=$(basename $(git rev-parse --show-toplevel))
~/scripts/append-to-outbox.sh "[${REPO}] ${SHA}: ${MSG}" "git-commit"
```

`chmod +x ~/.git-templates/hooks/post-commit`. Aplica a repos nuevos. Para los existentes, copiarlo a `.git/hooks/post-commit` de cada repo.

### Opción 4 — Cursor / Aider / Copilot CLI / otros

Estos agentes no tienen hooks nativos como Claude Code, pero todos pueden invocar shell commands:

- **Cursor**: configurar "post-task command" en settings, apuntar al script de la Opción 2
- **Aider**: usar `--commit-prompt-hook` o un wrapper bash que envuelva `aider` y appendee al terminar
- **Copilot CLI**: aliasear comandos críticos con `function gh-suggest { gh copilot suggest "$@" && ~/scripts/append-to-outbox.sh ... }`
- **n8n / Zapier / Make**: nodo HTTP request a `api.out-box.dev/api/u/.../today/append`

### Opción 5 — CI/CD (GitHub Actions, GitLab CI)

`.github/workflows/notify-outbox.yml`:

```yaml
name: Notify Outbox
on:
  workflow_run:
    workflows: [deploy]
    types: [completed]
jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - name: Append to daily
        run: |
          curl -X POST "https://api.out-box.dev/api/u/${{ secrets.OUTBOX_USER }}/today/append" \
            -H "Authorization: Bearer ${{ secrets.OUTBOX_KEY }}" \
            -H "Content-Type: application/json" \
            -d '{"html":"<p>✓ Deploy ${{ github.workflow }} status: ${{ github.event.workflow_run.conclusion }}</p>","label":"ci-deploy"}'
```

### Best practices para hooks

| Recomendación | Por qué |
|---|---|
| **Usar slug determinístico** (`today`, `daily/2026-05-21`) | Permite que múltiples hooks appendeen al mismo documento sin colisión de slugs random |
| **Emitir agent key con slug whitelist** `["today", "daily/*"]` | Limita el blast radius si la key se compromete — no puede tocar otros posts del user |
| **No appendear info sensible** | El daily puede compartirse vía share token. Cero secrets, passwords, tokens en los bloques |
| **Bloques chicos y autocontenidos** | Cada bloque debería tener sentido por sí solo: timestamp + qué pasó + (opcional) por qué |
| **Usar labels consistentes** | `task-complete`, `git-commit`, `deploy`, `test-pass`, `session-end`. Facilita filtrar / extraer después |
| **Timestamp en UTC** | Evita confusión cuando el agente cambia de timezone |
| **No appendear más de 1 vez por minuto** | Quotas y ruido visual. Si necesitás más, agrupar eventos antes de mandar (debounce 60s) |
| **Auto-rotación de slug por fecha** | Si usás `daily/2026-05-21`, el script puede generar el slug con `date +%Y-%m-%d` para que cada día sea un documento nuevo limpio. Si usás `today`, el back puede rotar internamente al cruzar medianoche UTC. |
| **Manejar errores silenciosamente** | Si el append falla (red, quota, etc.), el hook NO debería bloquear la acción principal — log a stderr y seguir |

### Ejemplo concreto: día completo de Joni auto-documentado

`~/.claude/settings.json` con hooks combinados:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "~/scripts/append-to-outbox.sh \"Sesión iniciada en $(basename $PWD)\" session-start"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "if echo \"$CLAUDE_TOOL_INPUT\" | grep -qE '(git commit|npm test|wrangler deploy)'; then ~/scripts/append-to-outbox.sh \"$CLAUDE_TOOL_INPUT\" tool-use; fi"
          }
        ]
      }
    ],
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "~/scripts/append-to-outbox.sh \"Sesión terminada\" session-end"
          }
        ]
      }
    ]
  }
}
```

Al final del día, `https://out-box.dev/u/joni/today` se ve algo así:

```
09:14:23 — session-start    → Sesión iniciada en out-box
09:23:11 — tool-use          → git commit -m "feat(auth): add OAuth Google"
09:23:45 — tool-use          → npm test
09:24:02 — tool-use          → wrangler deploy
10:01:30 — session-end       → Sesión terminada
11:30:00 — session-start     → Sesión iniciada en out-box-front
12:15:22 — tool-use          → git commit -m "feat(ui): pricing page v2"
...
18:45:11 — session-end       → Sesión terminada
```

Todo escrito por el agente sin intervención humana. **Esto es agents-first puro**: la herramienta documenta su propio trabajo, vos lo leés al final del día como si fuera un journal.

### Variaciones útiles del patrón

- **Slack notification del daily**: agregar un hook que al final del día (cron 23:00 UTC) postee el link del daily a un canal Slack
- **Resumen semanal**: cada lunes, leer los daily de la semana anterior y armar un resumen con `outbox-publish` skill
- **Daily compartido con team**: para Team tier, mismo slug `today` pero todos los seats appendean → cada miembro del team aparece en el log compartido
- **Triggers de acción crítica**: si un hook detecta un `deploy-fail` o `test-fail`, además de appendear puede mandar email/Slack al user

---

## Ver tus consumos

El user puede pedir saber cuánto lleva consumido. Hay dos puntos de acceso:

### CLI rápido (humano):
```bash
pcpub usage              # tabla con publishes, storage, posts, keys, dailies vs límites del tier
pcpub usage --fresh      # fuerza recompute (saltea cache 5min)
pcpub usage --json       # machine-readable para hooks
```

### Endpoint API (agentes):
```http
GET /api/me/usage[?refresh=true]
Authorization: Bearer outbox_xxx
```

Response devuelve `tier`, `limits`, `usage.publishes` (hora/día/mes con `resetInSeconds`), `usage.storage` (usedBytes/usedMB/limitMB/pct/truncated), `usage.posts` (total + byVisibility), `usage.keys` y `usage.dailies` (active/max), `billing`, `computedAt`, `cached`.

Cache TTL 300s. `?refresh=true` lo recomputa (más caro, ~200-500ms para users con muchos posts). El campo `storage.truncated: true` indica que el cómputo cortó por cap de paginación (>5000 objects) — el valor `usedBytes` es un mínimo, no el total real. Usar `--fresh` para forzar el recompute igual no levanta el cap.

**Cuándo usar cada uno:**
- Dashboard / CLI interactiva → endpoint normal con cache (rápido).
- Pre-publish guard (chequear si vas a pasar quota antes de mandar 200 publishes en batch) → endpoint con `?refresh=true`.
- Post-publish notification al user → endpoint normal, ya tenés `quotaRemaining` en el response de `/publish` para algo más liviano.

---

## Flow 5: Listar / buscar posts

**Trigger:** "qué tengo publicado", "buscame los posts con tag X", "qué hay en mi library"

### List general

```http
GET https://api.out-box.dev/api/list
Authorization: Bearer outbox_xxxx
```

Filtros opcionales:
- `?tag=briefing` → solo posts con ese tag
- `?limit=20` → max resultados (default 50)
- `?prefix=notes/` → solo posts bajo ese folder
- `?depth=N` (Sprint 5, 2026-05-25) → tree shape jerárquico en vez de flat

Response (flat, sin `?depth` o con `?depth=1`):
```json
{
  "user": "joni",
  "count": 12,
  "posts": [
    {
      "slug": "notes/hoy",
      "title": "Notas 2026-05-20",
      "tags": ["daily"],
      "visibility": "private",
      "createdAt": "...",
      "updatedAt": "...",
      "contentSize": 4120,
      "url": "https://out-box.dev/u/joni/notes/hoy"
    },
    ...
  ]
}
```

### Tree response con `?depth=2` (hojas dentro de hojas)

**Cuándo usarlo:** cuando querés entender la ESTRUCTURA jerárquica del namespace de un saque, sin tirar N llamadas a `GET /api/folders/<prefix>`. Una request, contexto completo.

```http
GET https://api.out-box.dev/api/list?depth=2
Authorization: Bearer outbox_xxxx
```

Response:
```json
{
  "user": "joni",
  "count": 12,
  "depth": 2,
  "tree": [
    {
      "type": "leaf-with-children",
      "slug": "clientes",
      "title": "Overview clientes",
      "visibility": "unlisted",
      "childCount": 8,
      "omitted": 5,
      "children": [
        {
          "type": "leaf-with-children",
          "slug": "clientes/solera",
          "childCount": 3,
          "omitted": 0,
          "children": [
            { "type": "leaf", "slug": "clientes/solera/q2", "title": "Q2 Report", ... }
          ]
        },
        { "type": "leaf", "slug": "clientes/overview", "title": "Overview" }
      ]
    },
    { "type": "leaf", "slug": "today", "title": "Today briefing" }
  ]
}
```

**Tipos de nodo:**
- `"leaf"` — hoja sin descendientes. Equivale a un post leaf, lo que llamábamos "post" hasta hoy.
- `"leaf-with-children"` — hoja que también contiene otras hojas en su prefijo. Puede o no tener HTML propio publicado. Si lo tiene, `title`/`visibility`/`createdAt` vienen del HTML propio. Si no, `visibility` es `null` (es solo agrupador emergente).

**Reglas clave:**
- `childCount` = total descendientes recursivo del nodo.
- `children[]` = hijos directos incluidos en este response (max 3 por default — `previewLimit`).
- `omitted` = hijos directos que NO se incluyeron por `previewLimit`. Si querés verlos todos, llamás `GET /api/folders/<slug>?depth=2` para esa rama puntual.
- `depth=1` es flat (compat). `depth=2` es 1 nivel de hijos. `depth=3` es 2 niveles. Max `depth=3`.

**Desde CLI:**
```bash
outbox list --tree           # alias de --depth 2
outbox list --depth 3        # 2 niveles de anidación
```

### Search por title/slug/tag

```http
GET https://api.out-box.dev/api/u/joni/search?q=briefing
Authorization: Bearer outbox_xxxx
```

(Score: match en title +10, slug +5, tag +3. Devuelve ranked.)

Para fulltext del CONTENIDO del HTML, el frontend web tiene Pagefind en `out-box.dev/u/:user` — desde CLI/API solo metadata.

---

## Flow 6: Cambiar visibility / borrar

### Cambiar visibility

```http
PUT https://api.out-box.dev/api/u/joni/notes-hoy/visibility
Authorization: Bearer outbox_xxxx
Content-Type: application/json

{ "visibility": "public" }
```

Casos:
- `private` → `public`: hace el post visible en `/u/joni/` auto-index
- `public` → `private`: lo oculta, solo accesible con auth o share token
- `private` → `unlisted`: accesible con URL exacta pero NO listado

### Borrar un post

```http
DELETE https://api.out-box.dev/api/u/joni/notes-hoy
Authorization: Bearer outbox_xxxx
```

**Borra todas las versiones**. Si querés solo "ocultar", usar visibility en vez de delete. **Antes de borrar, confirmar con el usuario** ("¿seguro? Esto es irreversible").

### Generar share link (URL temporal para no-users)

**Trigger:** "compartilo con el cliente como link", "armame un link público de esto", "necesito mandar este post a alguien que no tiene cuenta de Outbox", "link compartible con expiración".

**Cuándo conviene:** un PM/agente quiere mandar el link a un cliente o tercero que no tiene cuenta de Outbox. El share token le permite ver el post (aunque sea `private`) por un período acotado, sin tener que cambiar la visibility ni crear cuentas.

```http
POST https://api.out-box.dev/api/share
Authorization: Bearer outbox_xxxx
Content-Type: application/json

{
  "resource": "notes-hoy",
  "resourceType": "post",
  "expiresInDays": 7
}
```

Response:
```json
{
  "token": "abc12345...",
  "url": "https://out-box.dev/u/joni/notes-hoy?share=abc12345...",
  "resource": "notes-hoy",
  "resourceType": "post",
  "expiresAt": "2026-05-32T..."
}
```

**Reglas clave:**
- `resourceType: "post"` → token vale solo para ese slug específico.
- `resourceType: "folder"` → token vale para CUALQUIER hijo del folder (cascade automático). Útil para "mostrale toda la carpeta `clientes/solera` al cliente".
- `expiresInDays`: 1-365 enteros, o `null` para nunca expirar. Default 7.
- El visitor con la URL puede ver el contenido aunque sea `private`. **Override intencional de visibility.**

### Mismo flow desde CLI (Sprint 5 · 2026-05-25)

```bash
outbox share notes-hoy                              # default 7 días
outbox share notes-hoy --expires-in-days 30
outbox share clientes/solera --folder               # cascade a hijos
outbox share notes-hoy --never                      # sin expiración (cuidado)
outbox share list                                   # ver tokens activos
outbox share revoke <token>                         # revocar uno específico
```

El CLI copia la URL al clipboard automáticamente y muestra warning sobre que cualquiera con el link puede ver el contenido.

---

## Flow 6.5: Compartir con otro user de Outbox (Sprint 5 · Track C · 2026-05-25)

**Trigger:** "compartí este post con ariel", "dale acceso a este folder a mi colega tal", "necesito que pedro vea mi carpeta clientes/solera", "share with a user".

**Diferencia con share token (Flow 6):** el share token es un link público para no-users. **Grants** son para users de Outbox que vos querés que vean el recurso. El recipient necesita autenticarse con su propia Bearer key o session — el recurso entra en su `/library/shared-with-me`.

### Crear grant

```http
POST https://api.out-box.dev/api/grants
Authorization: Bearer outbox_xxxx (la tuya, owner)
Content-Type: application/json

{
  "recipientUser": "ariel",
  "resource": "clientes/solera/q2",
  "resourceType": "post",
  "permissions": ["view"],
  "expiresInDays": 30,
  "message": "Para revisar antes de Q3"
}
```

Response:
```json
{
  "id": "a7f9c2b1d3e4f5a6",
  "ownerUser": "joni",
  "recipientUser": "ariel",
  "resource": "clientes/solera/q2",
  "resourceType": "post",
  "permissions": ["view"],
  "createdAt": "2026-05-25T12:00:00Z",
  "expiresAt": "2026-06-24T12:00:00Z",
  "message": "Para revisar antes de Q3"
}
```

**Reglas clave:**
- `recipientUser` debe ser un user **existente** en Outbox → 404 si no.
- `resource` debe pertenecer al caller (owner) → 403 si intentás grantear algo que no es tuyo.
- `recipientUser === ownerUser` → 400 (no self-grants).
- `resourceType: 'folder'` → cascade automático a todos los hijos del folder.
- `permissions` v1 solo acepta `['view']`. Futuro: `'comment'`, `'edit'`.
- `expiresInDays`: 1-365 enteros, o `null` para nunca expirar. Default 30.
- El grant **override** la visibility del recurso (el recipient puede ver aunque sea `private`).

### Listar grants (outgoing/incoming)

```http
# Owner: grants que diste
GET https://api.out-box.dev/api/grants

# Recipient: grants que recibiste
GET https://api.out-box.dev/api/grants?incoming=1
```

### Revocar

```http
DELETE https://api.out-box.dev/api/grants/<grantId>
```

Solo el owner puede revocar. El recipient pierde acceso inmediatamente.

### Ver lo compartido conmigo en `/api/list`

```http
GET https://api.out-box.dev/api/list?shared=1
GET https://api.out-box.dev/api/list?shared=1&depth=2   # combina con Track A
```

Cada post incluye `sharedBy: "ownerUser"` y `grantId` para que el front muestre atribución.

### Desde CLI

```bash
outbox grants give ariel clientes/solera/q2 --message "Para Q3"
outbox grants give ariel clientes/solera --folder --expires-in-days 7
outbox grants list                   # outgoing
outbox grants incoming               # incoming
outbox grants revoke <id>
```

### Cuándo usar grant vs share token

| Caso | Recomendación |
|---|---|
| Mandarle el link a un cliente sin cuenta de Outbox | **share token** (Flow 6) |
| Colaborar con un colega que YA tiene cuenta de Outbox | **grant** |
| Quiero saber quién entró al recurso | **grant** (audit log con recipient) |
| El link puede leakear y no me importa | **share token** |
| Quiero revocar acceso a UN user específico | **grant** |

---

## Flow 7: Emit / rotar / revocar API keys

### Shortcut: emitir agent key con folder + expiración (recomendado)

**Cuándo:** el usuario dice "necesito una key para mi briefing-bot", "una key automatizada", o "una key efímera para tal agente".

Hay dos vías. El **shortcut** es preferible — menos campos a llenar, defaults sanos:

```http
POST https://api.out-box.dev/api/keys/agent
Authorization: Bearer outbox_xxxx
Content-Type: application/json

{
  "label": "briefing-matutino-bot",
  "folder": "briefings",   ← opcional. Si va, la key sólo escribe bajo briefings/
  "days": 30,              ← opcional, default 30, max 365. 0 = nunca expira
  "verbs": ["publish"]     ← opcional, default ['publish']. Subset de [publish,list,delete]
}
```

Response (200):
```json
{
  "plaintext": "outbox_xxxx...",
  "keyId": "abc12345",
  "label": "briefing-matutino-bot",
  "type": "agent",
  "scopes": ["publish:joni:f/briefings"],
  "rateLimits": { "perHour": 5, "perDay": 50 },
  "expiresAt": "2026-06-23T00:00:00Z",
  "folder": "briefings",
  "days": 30,
  "warning": "Save this key NOW — it will never be shown again."
}
```

CLI: `pcpub keys gen-agent --folder briefings --days 30 --label briefing-bot` (con `--yes` skip prompts).

**Cuándo NO usar el shortcut**: si necesitás slug whitelist (lista de slugs específicos en vez de folder) o rateLimits custom, usá el `POST /api/keys` clásico (próxima sección).

### Para emitir una key con shape complejo (slug whitelist / rateLimits custom)

```http
POST https://api.out-box.dev/api/keys
Authorization: Bearer outbox_xxxx
Content-Type: application/json

{
  "label": "briefing-matutino-bot",
  "type": "agent",
  "scopes": ["publish:joni"],          ← scope mínimo necesario
  "slugWhitelist": ["notes/hoy", "briefing/today"]  ← LIMITAR slugs si es agente
}
```

Response (200):
```json
{
  "plaintext": "outbox_xxxx...",
  "keyId": "abc12345",
  "label": "briefing-matutino-bot",
  "type": "agent",
  "scopes": ["publish:joni"],
  "rateLimits": { "perHour": 5, "perDay": 50 },
  "warning": "Save this key NOW — it will never be shown again."
}
```

**MOSTRAR plaintext UNA SOLA VEZ:**

> 🔑 KEY GENERADA — guardala AHORA, no se muestra de nuevo:
>
>    `outbox_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
>
>    keyId:  abc12345
>    label:  briefing-matutino-bot
>    scopes: publish:joni
>    limits: 5/hour, 50/day
>    whitelist: notes/hoy, briefing/today

Recordarle al usuario:
- "Esta key solo puede PUBLICAR (no borrar ni listar) y solo en esos 2 slugs."
- "Si se compromete, revocala con `pcpub keys revoke abc12345` y emití otra."

### Rotar tu propia key

```bash
pcpub keys-rotate
```

Atómico: genera nueva, actualiza `~/.outboxrc`, revoca la vieja.

### Revocar una key

```http
POST https://api.out-box.dev/admin/revoke
Authorization: Bearer outbox_xxxx
Content-Type: application/json

{ "keyId": "abc12345" }
```

(El `keyId` es el SHA-256 truncado a 8 chars — lo ves en el response de `GET /api/keys` y en `GET /api/me`.)

O desde CLI: `pcpub keys revoke <keyId>`.

---

## Flow 8: Agents registry — clonar agentes de otros users (Sprint 16)

**Trigger:** "qué agentes hay disponibles", "quiero el briefing-bot de joni en mi espacio", "clonale a mi user el agente X"

Outbox tiene un **agents registry** público: cada user puede marcar agentes propios como `discoverable: true` + `instantiable: true` en su `_agents.json`. Otros users pueden clonarlos a su namespace.

### Paso 1 — Buscar agentes disponibles

```http
GET https://api.out-box.dev/api/agents/registry?tag=briefing
```

(No requiere auth — el registry es público. Filtros opcionales: `?tag=`, `?sort=publishCount`)

Response:
```json
{
  "count": 3,
  "agents": [
    {
      "id": "briefing-daily",
      "fromUser": "joni",
      "label": "Briefing matutino",
      "description": "Lee mails matutinos y arma briefing con Claude",
      "tags": ["briefing", "daily"],
      "publishCount": 187,
      "instantiable": true,
      "recipe": {
        "inputs": [
          { "name": "emailAccount", "type": "email", "required": true },
          { "name": "slackChannel", "type": "slack-channel", "required": false }
        ]
      }
    }
  ]
}
```

### Paso 2 — Clonar a tu espacio

```http
POST https://api.out-box.dev/api/agents/instantiate
Authorization: Bearer outbox_xxxx
Content-Type: application/json

{
  "fromUser": "joni",
  "agentId": "briefing-daily",
  "inputs": {
    "emailAccount": "ariel@procontacto.com",
    "slackChannel": "#ariel-briefings"
  }
}
```

Response:
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

El sistema:
1. Crea entry en TU `_agents.json` con el agente nuevo
2. Emite una agent key limitada (solo `publish:<vos>` + slug whitelist del recipe)
3. Agenda el schedule del recipe
4. Devuelve la URL del runtime (GitHub repo del agente) para que lo deployes

**Joni NO ve tus outputs.** Cada user mantiene aislamiento estructural.

---

## Manejo de errores común

| Status | Error code | Significado | Qué decirle al usuario |
|---|---|---|---|
| 401 | `missing_auth` | Sin Bearer header | "Configurá tu key con `pcpub login`" |
| 401 | `invalid_key` | Key no existe en KV | "Esa key no es válida — ¿la rotaron?" |
| 401 | `key_revoked` | Marcada como revoked | "La key fue revocada. Emití otra." |
| 401 | `key_expired` | `expiresAt` ya pasó | "La key venció. Emití una nueva con `pcpub keys gen-agent`." |
| 403 | `forbidden` | Falta scope | "Tu key no tiene scope para esto. Mostrame los scopes con `pcpub whoami`" |
| 403 | `slug_not_allowed` | Slug fuera de whitelist | "Este agente solo puede publicar en: {whitelist}" |
| 403 | `slug_not_under_allowed_folder` | Sprint 1 + Bug B residual fix 2026-05-26 — key folder-scoped y slug/resource cae fuera. Aplica a publish/delete/list/visibility/rollback/daily/append + endpoints de folder/share/grants con folder-scoped keys. | "Tu key solo puede operar bajo {folders}. Mové el slug o pedí una key con otro folder." |
| 403 | `scope_escalation` | Sprint 4 — intento de emitir key con scope que el caller no cubre | "No podés emitir keys con ese scope porque tu key no lo tiene. Es prevención de privilege escalation." |
| 503 | `team_early_access` | **Bug D fix 2026-05-26** — checkout de `tier:'team'` bloqueado hasta que exista el workspace model. | "Team tier en early access — contactanos a hola@out-box.dev. Mientras tanto, Pro o Pro+ están disponibles." |
| 400 | `invalid_resource` | grants/share — `body.resource` no es un slug válido | "El campo `resource` debe ser un slug válido (max 64 chars/segmento, regex [A-Za-z0-9_-/])" |
| 400 | `invalid_resourceType` | grants/share — `body.resourceType` no es `post` ni `folder` | "resourceType debe ser exactamente 'post' o 'folder'" |
| 400 | `invalid_permissions` | grants — v1 solo acepta `['view']` | "v1 de grants solo soporta permissions=['view']. 'comment' y 'edit' vienen en v2." |
| 404 | `recipient_not_found` | grants — el `recipientUser` no existe en Outbox | "El user '{recipient}' no existe. Verificá el username o pedile que se registre primero." |
| 403 | `resource_not_owned` | grants — el resource no pertenece al caller | "Solo podés grantear recursos que vos publicaste." |
| 400 | `self_grant_not_allowed` | grants — recipientUser === principal.user | "No tiene sentido grantear algo a vos mismo. Si querés compartir externamente, usá share token." |
| 413 | `html_too_large` | HTML > 5MB | "Achicá el HTML o publicá en partes" |
| 413 | `data_too_large` | Sprint 3 — `data` en publish-from-template > 64KB | "Achicá el JSON o partí en varios publishes" |
| 429 | `rate_limited` | Quota hit | "Quota máxima — reintentá en {retryAfter}s" |
| 400 | `invalid_slug` | Caracteres no permitidos | "Solo [A-Za-z0-9_-/] con max 64 chars/segmento" |
| 400 | `invalid_visibility` | Visibility != private/unlisted/public | "Visibility debe ser uno de esos 3 valores" |
| 400 | `invalid_html` | HTML vacío o malformado | "El HTML no puede estar vacío" |
| 400 | `invalid_template` | Sprint 3 — template id desconocido en publish-from-template | "Listá templates disponibles con `GET /api/templates`" |
| 400 | `missing_field` | Sprint 3 — falta campo requerido del template (devuelve `field`) | "El template `{template}` requiere el campo `{field}`" |
| 400 | `invalid_field` | Sprint 3 — campo del template con tipo incorrecto (devuelve `field`) | "El campo `{field}` debe ser {tipo esperado}" |
| 400 | `invalid_label` / `missing_label` | Sprint 4 — label inválido al emitir key | "Label requerido, 1-60 chars, sin caracteres especiales" |
| 400 | `invalid_folder` | Sprint 4 — folder del scope tiene path traversal o segmento inválido | "Folder solo acepta [a-z0-9_-/] sin `..` ni `//`" |
| 400 | `invalid_days` | Sprint 4 — days fuera de [0, 365] o no es integer | "days debe ser entero entre 0 y 365 (0 = no expira)" |
| 400 | `invalid_verbs` | Sprint 4 — verbs incluye algo fuera de [publish, list, delete] | "Verbs permitidos: publish, list, delete. `genkey` y `admin` nunca via shortcut." |

---

## CLI `outbox` — comandos disponibles

Instalación: `npm install -g @out-box/cli`

El binario es **`outbox`** (v0.2.0, 2026-05-24). El nombre legacy `pcpub` se eliminó en este release — si tu agente o script ejecutaba `pcpub publish`, actualizá a `outbox publish`. No hay alias.

```bash
# Setup
outbox signup                         # crear cuenta nueva vía browser handoff
outbox login                          # loguearse (menú: handoff o pegar key existente)
outbox login --token <claim_token>    # modo no-interactivo, polling de un token ya creado
outbox logout [--revoke]              # cerrar sesión local, opcional revocar key en backend
outbox reset-password                 # pedir email de reset (confirm en browser)
outbox status                         # ver cuenta + uso hoy + keys activas
outbox usage [--fresh|--json]         # consumos detallados vs límites del tier
outbox whoami                         # info compacta del usuario actual

# Publicar / leer
outbox publish file.html [--title --tags --slug --visibility --notify --model --type --summary --description --meta key=value]
outbox publish --template <id> --data <json|path> [--slug --title --tags --visibility]   # Sprint 3: render server-side
outbox list [--tag]
outbox search "query" [--user]
outbox delete <slug> [--yes]
outbox visibility <slug> <mode>

# Daily documents (Sprint A4)
outbox append <slug> [file] [--message --label --ts --quiet --model --type --summary --description --meta key=value]
outbox blocks <slug> [--date --remove --history --days --json]

# Templates + keys
outbox template show | set <file.html> | delete
outbox keys list | gen [--label --type --slugs] | revoke <keyId>
outbox keys gen-agent [--label --folder --days --verbs --yes]   # Sprint 4: shortcut agent keys efímeras
outbox keys-rotate
```

**Heads up:** si tu agente / hook usaba `pcpub` (nombre legacy pre-v0.2.0), reemplazalo por `outbox`. El binario `pcpub` ya no existe — clean break en v0.2.0.

Auto-archive opcional al vault de Obsidian si configurado en `~/.outboxrc`.

**Tip para hooks de IA:** los comandos `pcpub append` están pensados para ser llamados desde hooks de Claude Code u otros agentes — ver sección "Automatización" más arriba. Diseñados para ser idempotentes y no-bloqueantes ante errores.

---

## Detalles técnicos importantes para agentes

### 1. El campo `user` NUNCA va en el body

Outbox lo deriva server-side de la API key. **Si el agente lo manda en el body, el servidor lo ignora silenciosamente** y publica en el namespace de la key. Esto es seguridad estructural, no bug.

### 2. Plaintext keys NUNCA se logean ni repiten

Después de emitir una key:
- **Mostrarla UNA vez** en la respuesta
- **Nunca repetirla** en mensajes posteriores
- **Si el usuario la olvidó**, emitir nueva + revocar anterior — no buscar el original

### 3. Quotas reset UTC

`retryAfter` viene en segundos. Las quotas se resetean por hora UTC y por día UTC.

### 4. Templates pueden envolverse silenciosamente

Si el user tiene `_template.html` configurado, **todos** los publishes lo aplican salvo que pases `branding: 'none'` o `skipTemplate: true`. Si el agente está haciendo read-modify-write y ya tiene el HTML completo, **siempre usar `branding: 'none'`** para evitar doble wrap.

### 5. Versionado automático

Cada `POST /publish` al mismo slug crea una nueva versión. **No hay forma de "editar" sin crear versión nueva** (intencional — `nothing is lost`).

### 6. Visibility default es `private` — herencia SOLO al publicar (body wins en serve)

**Sprint 2 update (2026-05-24) + Bug A fix (2026-05-26):**

**Al publicar** (`POST /publish`), la resolución de visibility sigue este orden:

1. Si `body.visibility` viene (válida) → usa esa (override siempre permitido).
2. Sino, busca el folder ancestor más cercano con metadata (`_folder.json` con `visibility`). Si lo encuentra → hereda.
3. Sino → fallback `private`.

Ejemplo: si existe `_folder.json` para `clientes/` con `visibility: unlisted`, y el agente publica `clientes/solera/q2` SIN pasar visibility, el post queda **unlisted**.

**Al servir** (`GET /<user>/<slug>`), el back respeta `meta.visibility` tal cual fue persistido — NO re-aplica la herencia del folder dinámicamente. Esto permite el caso "folder private + post puntual unlisted compartible": el folder define el default al publicar, pero el post puede tener visibility distinta si el agente la pasó explícita.

> ⚠️ **Cambio de comportamiento del 2026-05-26** (Bug A fix): antes el serve aplicaba `mostRestrictive(post, folder)` y un post `unlisted` bajo folder `private` se servía como private (404 sin auth). Ahora se sirve correctamente como unlisted (200 con URL). Si el use case requiere cascade estricta, cambiar la visibility del folder cierra acceso a TODOS los posts via `PUT /api/folders/<X>` para invalidar el cache CDN.

### 6.1. Folder-scoped keys (Sprint 1 + post-PR-11 + Bug B residual fix 2026-05-26)

Si la key del agente tiene scope `<verb>:user:f/<folder>` (folder-restricted), **solo puede operar bajo ese folder**. Intentar fuera → 403 `slug_not_under_allowed_folder`.

**Verbs soportados con folder-scope (2026-05-26 update):**

| Verb | Endpoints | Bug B residual fix |
|------|-----------|-------------------|
| `publish:user:f/X` | POST /publish, POST /api/publish-from-template, POST /api/u/.../rollback, POST /api/u/.../append (daily), PUT /api/u/.../visibility | ✓ |
| `delete:user:f/X` | DELETE /api/u/..., DELETE /api/u/.../blocks/... | ✓ |
| `list:user:f/X` | GET /api/list (filter), GET /api/folders (filter), GET /api/u/.../blocks, GET /api/u/.../dailies | ✓ |
| `folder:user:f/X` (PR #11 fino) | PUT/DELETE /api/folders/X (acepta también `template:user` legacy) | ✓ |
| `share:user:f/X` (PR #11 fino) | POST /api/share (resource debe estar bajo X) | ✓ |
| `template:user:f/X` (legacy super-scope) | POST /api/grants (resource bajo X) + retrocompat con folder/share | ✓ |

**Cross-verb contagion**: si una key tiene CUALQUIER scope `f/...` (en cualquier verb), TODOS sus verbs quedan folder-restricted. Defense in depth — una agent key con `publish:f/clientes + delete:user:own` no puede borrar fuera de `clientes/` aunque su scope delete sea broad.

Para listar las keys propias con scopes legibles, hacer `GET /api/keys` — la respuesta trae `scopesDisplay` parseado: `{ verb, user, folder, modifier }` por scope.

### 6.2. Cookie session reconocida en endpoints públicos (Bug C fix 2026-05-26)

Endpoints públicos que respetan visibility (`/u/<user>/<slug>`, `/<user>/<slug>`, `/api/u/.../search`, `/api/u/.../manifest`, `/api/u/.../recent`, `/<user>/feed.xml`) ahora reconocen TANTO Bearer key COMO cookie `outbox_session`.

Antes del fix, el owner logueado en `out-box.dev` (con cookie session activa) NO podía ver sus propios posts `private` desde el browser — recibía 404 a menos que pasara `Authorization: Bearer`. Y los grants user-to-user vía browser nunca funcionaban (el recipient con session se ignoraba). Ahora todo funciona consistente.

**Implicación práctica para agentes IA**: si tu agente publica con Bearer key, todo funciona como antes. Si recomendás al user "abrí esta URL en tu browser", asumí que su sesión browser será reconocida.

### 6.3. publishedByLabel auto-enriquecido (2026-05-27)

Cada `POST /publish` ahora persiste automáticamente `publishedByLabel` en el meta del post, derivado del label de la key/session. **El agente NO lo manda** — el back lo lee de su propia key (defense in depth contra spoofing).

```json
// .meta.json del post (ejemplo)
{
  "slug": "briefing-hoy",
  "owner": "joni",
  "publishedByLabel": "briefing-matutino-bot",  // ← auto, viene de KeyRecord.label
  "model": "claude-sonnet-4.7",                 // ← lo pasaste vos en el body
  "summary": "...",
  ...
}
```

- **Agent key con label**: `publishedByLabel: <KeyRecord.label>` (ej. `"briefing-matutino-bot"`)
- **Session browser** (UI logueado): `publishedByLabel: "browser-session"`
- **Posts pre-2026-05-27**: campo `undefined` (compat — no rompe nada)

Disponible en `.meta.json`, `GET /api/list` response, `GET /api/u/.../search` y feed JSON. Habilita que los listings muestren "publicado por <agente>" sin que cada agente lo recuerde.

### 7. Slugs jerárquicos permitidos

`notes/2026-05-20`, `proyectos/cliente/v2`, `briefings/lunes` son válidos. Hasta 5 niveles de profundidad. Útil para organizar.

### 8. CORS si estás llamando desde browser

Outbox solo acepta requests CORS desde:
- `https://out-box.dev`
- `https://*.out-box.dev`
- `http://localhost:3000`
- `http://localhost:8787`

Si tu agente corre en otro dominio, no podrá hacer requests directas — necesita un proxy server-side.

---

## Endpoints reference compacto

| Endpoint | Method | Auth | Para qué |
|---|---|---|---|
| `/api/me` | GET | Bearer | Info del principal autenticado |
| `/api/me/usage` | GET | Bearer | Consumos detallados (publishes, storage, posts, keys, dailies) vs límites del tier. `?refresh=true` skipea cache 5min (Fase 4) |
| `/publish` | POST | Bearer | Crear / actualizar post (versioning auto) |
| `/api/list` | GET | Bearer | Listar posts propios |
| `/api/u/:u/search?q=` | GET | Opcional | Buscar (con auth ve private) |
| `/api/u/:u/manifest` | GET | Opcional | Stats del namespace |
| `/api/u/:u/:slug/versions` | GET | Bearer | Listar versiones de un post |
| `/api/u/:u/:slug/rollback?to=N` | POST | Bearer | Volver a versión N |
| `/api/u/:u/:slug/diff?from=X&to=Y` | GET | Bearer | Diff entre 2 versiones |
| `/api/u/:u/:slug/visibility` | PUT | Bearer | Cambiar visibility |
| `/api/u/:u/:slug` | DELETE | Bearer | Borrar post (todas las versiones) |
| `/api/u/:u/:slug/comments` | GET/POST | Opcional | Comments humanos + agentes |
| `/api/share` | POST | Bearer | Emitir share token |
| `/api/folders/:prefix` | GET/PUT | Bearer | Metadata de carpetas |
| `/api/template` | GET/PUT/DELETE | Bearer | Template personal |
| `/api/keys` | GET/POST | Bearer | Listar / emitir keys. GET devuelve `scopesDisplay` parseado (Sprint 1). |
| `/api/keys/agent` | POST | Bearer | **Sprint 4** — Shortcut agent key efímera: `{ label, folder?, days?, verbs? }` |
| `/admin/revoke` | POST | Bearer | Revocar key |
| `/api/admin/scan-exposed` | GET | Bearer (scope `admin:self`) | **2026-05-26** — herramienta diagnóstica. Devuelve lista de posts con `meta.visibility=A` bajo folder ancestor con `visibility=B` (query params `?post_visibility=&folder_visibility=`). Read-only. Útil para auditorías post-migración del modelo de visibility. |
| `/api/audit` | GET | Bearer (scope `audit:self`) | Sprint 15.A + audit emitters fix 2026-05-26 — filter `?kind=` acepta: `publish`, `delete`, `visibility_change`, `key_rotate`, `share_create`, `share_revoke`, `agent_instantiate`, `grant_create`, `grant_revoke`, `grant_used`, etc. Lista completa en `lib/audit.ts::AUDIT_ACTIONS`. |
| `/api/schedules` | GET/POST/DELETE | Bearer | Agendar ejecuciones de agents (Sprint 15) |
| `/api/u/:u/agents` | GET | Opcional | Manifest público de agentes del user |
| `/api/agents/registry` | GET | Opcional | Listar agents `discoverable: true` de TODOS los users (Sprint 16) |
| `/api/agents/instantiate` | POST | Bearer | Clonar un agente discoverable a tu propio namespace (Sprint 16) |
| `/api/u/:u/recent?since=ISO` | GET | Opcional | Change feed JSON — posts modificados desde timestamp (Sprint 10) |
| `/api/keys/rotate` | POST | Bearer/Cookie | Rotación atómica self-service (Sprint A1) |
| `/api/u/:u/:slug/append` | POST | Bearer | Appendear bloque a daily document (Sprint A4) |
| `/api/u/:u/:slug/blocks` | GET | Bearer | Listar bloques del daily document ordenados |
| `/api/u/:u/:slug/blocks/:id` | DELETE | Bearer | Borrar un bloque específico del daily |
| `/api/auth/google/start` | GET | — | OAuth Google flow start (redirect a consent) |
| `/api/auth/github/start` | GET | — | OAuth GitHub flow start |
| `/api/auth/email/signup` | POST | — | Signup público con email/password (rate limit 5/h IP, errores normalizados a `signup_conflict` anti-enum) |
| `/api/auth/email/login` | POST | — | Login email/password (rate limit 5/15min IP) |
| `/api/auth/email/reset-request` | POST | — | Reset password — siempre 200 (anti-enum) |
| `/api/auth/email/reset-confirm` | POST | — | Confirmar reset con token |
| `/api/auth/logout` | POST | Cookie | Invalidar sesión + clear cookie |
| `/u/:u` y `/<user>` | GET | — | Auto-index de biblioteca (HTML — ambos formatos soportados) |
| `/u/:u/:slug` y `/<user>/<slug>` | GET | Opcional | Servir HTML (respeta visibility) |
| `/u/:u/feed.xml` y `/<user>/feed.xml` | GET | — | Atom feed |
| `/og/:u/:slug.png` | GET | — | OG card SVG |
| `/favicon.svg` | GET | — | Favicon SVG inline servido por el worker |
| `/api/design-system.css` | GET | — | DS CSS consumible |
| `/api/signup` | POST | — | **DEPRECADO** (410 Gone, mensaje apunta a `/api/auth/email/signup`) |
| `/api/waitlist` | POST | — | **DEPRECADO** (410 Gone) |
| `/api/auth/claim/start` | POST | — | Iniciar browser handoff (devuelve claim_token + URL) |
| `/api/auth/claim/:token/status` | GET | — | Polling status del claim (devuelve key UNA vez) |
| `/api/auth/claim/:token/confirm` | POST | Cookie | Confirmar claim desde browser, emite agent key con TTL |
| `/api/templates/catalog` | GET | — | Catálogo público de templates predefinidos (chrome visual / `_template.html`) |
| `/api/templates/:id/preview` | GET | — | Sirve HTML del template (para iframe preview) |
| `/api/template/from-catalog` | POST | Bearer | Copiar template del catálogo al `_template.html` del user |
| `/api/publish-from-template` | POST | Bearer | **Sprint 3** — Publish con render server-side: `{ template, data, slug, ... }` |
| `/api/templates` | GET | — | **Sprint 3** — Lista de content templates v1 + schemas (galería pública, separado de `/api/templates/catalog`) |

---

## Ejemplos completos de flows

### Ejemplo 1: agente de briefing matutino (publish puro)

```
USER: "Generá mi briefing de hoy y publicalo"
AGENT:
  1. Genera HTML completo con el briefing
  2. POST /publish con slug="briefing/2026-05-20", title="Briefing 20/05",
     visibility="private", tags=["briefing","daily"], notifySlack="#joni-daily"
  3. Responde: "✅ Briefing publicado: https://out-box.dev/u/joni/briefing/2026-05-20
     Notificado en #joni-daily. Te quedan X publish/h."
```

### Ejemplo 2: agente acumulador de notas (read-modify-write)

```
USER: "Sumá a mis notas de hoy que Pedro confirmó el lunes"
AGENT:
  1. GET /u/joni/notes/hoy + Bearer (con auth ve private)
  2. Si 404 → arranca con HTML vacío
  3. Si 200 → parsea HTML, identifica donde sumar
  4. Genera HTML updated con la nota nueva sumada en sección "Updates"
  5. POST /publish con slug="notes/hoy", branding="none" (HTML ya completo)
  6. Recibe version=4
  7. Responde: "✅ Sumado a notes/hoy (v4). Si querés ver las versiones anteriores:
     pcpub diff notes/hoy --from=3 --to=4"
```

### Ejemplo 3: agente que arma reportes semanales (visibility public + share)

```
USER: "Armá el report semanal y compartilo con el equipo"
AGENT:
  1. Genera HTML con el report
  2. POST /publish con slug="reports/semana-21", visibility="public",
     tags=["report","semanal"]
  3. Recibe URL pública
  4. POST /api/share con resourceType="post", ttlSeconds=604800 (7 días)
     (por si quieren un share token también)
  5. Responde con la URL pública: https://out-box.dev/u/joni/reports/semana-21
     "Visible para cualquiera con el link. Aparece también en tu library pública."
```

---

## Si algo no está claro

- **API completa**: ver `references/api-reference.md` en este folder
- **Para entender Outbox como producto**: ver https://out-box.dev
- **Para contribuir al backend**: usar la skill `outbox-project` (no esta)
- **Logs en vivo**: `wrangler tail` desde el repo `out-box/worker/` (solo si el agente tiene credenciales de Cloudflare del owner)
