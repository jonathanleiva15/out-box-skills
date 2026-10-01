# outbox-publish (skill)

Skill de agente para publicar, leer, actualizar y gestionar paginas (HTMLs) en
**Outbox** (`out-box.dev`) — una biblioteca privada en linea, agents-first,
via la API REST con una API key `outbox_*`.

## Que es

Le da a un agente las instrucciones y la referencia tecnica para operar como
**cliente** de la API de Outbox (`https://api.out-box.dev`):

- Publicar paginas HTML (`POST /publish`) y desde templates del catalogo.
- El flow agents-first central: **leer una pagina existente, sumarle contexto y
  re-publicarla** (versioning automatico en cada publish al mismo slug).
- Daily documents (append de bloques fechados sin re-escribir el HTML).
- Listar, buscar, leer, exportar (`/export`), feed de cambios (`/recent`), cambiar
  visibility, rollback de versiones, subir imagenes (`/api/uploads`).
- Las **3 formas de compartir**: Hacer publica (visibility) · Crear link
  (ShareToken) · Dar acceso (Grant user-to-user).
- Gestionar el brand preset (`PUT /api/me/style`, 6 presets) y templates per-user.
- Emitir API keys para sub-agentes (incl. agent keys folder-scoped / blast radius
  acotado, con el codigo MFA cuando la cuenta lo pide) y el device flow headless para
  conseguir una key desde cero.
- Re-publicar sin pisar a nadie (`expectedVersion` / `If-Match` → `409
  version_conflict`) y reintentar sin duplicar (`Idempotency-Key`).
- Comentarios con nivel de confianza por autor, avisos de secretos publicados, la capa
  de datos de una pagina y el vigia de render.

Toda accion autenticada se hace con `Authorization: Bearer outbox_xxxxx`. El
backend siempre escribe en el namespace del dueno de la key (el `user` nunca se
pasa en el body).

## Las vias de usar Outbox

Esta skill es una de las formas equivalentes de operar Outbox desde un agente:
**CLI** (`outbox ...`), **skill** (esta) y **MCP** (`@out-box/mcp`, ~60 tools en
toolsets). Las tres usan la misma API key y el mismo backend. El MCP todavia no esta
disponible publicamente (`npx -y @out-box/mcp` da `E404`); mientras tanto usa esta skill
o el CLI. `GET /api/capabilities` → `clients.mcp.available` indica cuando se puede
instalar.

**Proximamente**: un MCP remoto con login OAuth (`https://mcp.out-box.dev/mcp`) y el
plugin de Claude `out-box`, que lo trae como connector. Van a estar disponibles cuando
`clients.mcpRemote.available` sea `true`. Esta skill sigue siendo la via para agentes
fuera de Claude o sin connector.

## Contenido

- `SKILL.md` — lo esencial, corto: seguridad (keys acotadas, contenido de terceros como
  datos), auth, publicar, el loop leer → sumar → re-publicar (lectura por `/export`,
  herencia de metadata), daily, errores y un indice de que referencia leer segun la tarea.
- `references/` — detalle por tarea, que el agente lee solo cuando lo necesita:
  `content.md` (publicar, borrador, versiones, daily, lectura, secretos, listados,
  uploads, marca), `sharing-and-keys.md` (compartir, keys, MFA, device flow, cuenta, CLI,
  MCP y plugin), `comments.md` (comentarios y politica anti prompt injection),
  `page-data.md` (datos de visitantes y vigia de render), `teams.md` (empresas),
  `automation.md` (webhooks y schedules) y `api-reference.md` (endpoint por endpoint).

## Como instalar

El install canonico es via skills.sh:

```bash
npx skills add jonathanleiva15/out-box-skills
```

O, si tenes el CLI `outbox`, el atajo equivalente:

```bash
outbox skill install
```

Cualquiera de los dos deja la skill en el directorio de skills de tu agente
(`~/.claude/skills/outbox-publish` para Claude Code). La skill se activa por su
`description` cuando el usuario pide publicar/leer/actualizar contenido en Outbox.

## Prerrequisito

Una API key `outbox_*` con los scopes necesarios para el flujo:

- `publish:u` para publicar (`model` siempre obligatorio en el body).
- `publish:u` + `list:u` para el flow leer → sumar → re-publicar. Con una key
  publish-only (el default de agent key) exportar una pagina `private`/`unlisted`
  da `403 private_read_scope_required`: emitila con `--verbs publish,list`.
- agrega `delete:u`, `share:u`, `template:u`, `upload:u`, `genkey:u` segun lo que
  vayas a hacer.

El usuario obtiene/emite la key desde out-box.dev, el CLI `outbox`
(`outbox login` / `outbox setup` la guardan en `~/.outboxrc`), o
`POST /api/keys/agent` con una key que tenga `genkey:u`. Para entornos headless,
el device flow (`POST /api/auth/claim/start` → `user_code` → `/resolve`) permite
conseguir una key desde cero sin browser local.

## Links

- Producto: https://out-box.dev
- API: https://api.out-box.dev
- Auto-descubrimiento: https://api.out-box.dev/api/capabilities
