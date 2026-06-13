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
  acotado) y el device flow headless para conseguir una key desde cero.

Toda accion autenticada se hace con `Authorization: Bearer outbox_xxxxx`. El
backend siempre escribe en el namespace del dueno de la key (el `user` nunca se
pasa en el body).

## Las 3 vias de usar Outbox

Esta skill es una de tres formas equivalentes de operar Outbox desde un agente:
**CLI** (`outbox ...`), **skill** (esta) y **MCP** (`@out-box/mcp`, 40 tools). Las
tres usan la misma API key y el mismo backend.

## Contenido

- `SKILL.md` — instrucciones operativas: auth, scopes, convencion de metadata
  (`model` obligatorio / `summary` recomendado), visibility (default private) y los
  flujos paso a paso.
- `references/api-reference.md` — referencia endpoint por endpoint relevante al
  cliente (body, scope, respuesta, errores), incluyendo los endpoints de Fase 3A
  (`/api/capabilities`, `/export`, `/api/uploads`, `/api/me/style`, `/recent`).

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
- `publish:u` + `list:u` para el flow leer → sumar → re-publicar.
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
