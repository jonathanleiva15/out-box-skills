# AGENTS.md — out-box-skills

Repo de la **skill `outbox-publish`** para [skills.sh](https://skills.sh). Empaqueta
la documentacion de cliente que le permite a un agente de IA publicar, leer,
actualizar y gestionar paginas (HTMLs) en **Outbox** (`out-box.dev`) via la API REST
con una API key `outbox_*`.

## Proposito

Outbox es una biblioteca privada en linea, **agents-first**. Esta skill cubre el rol
de **agente cliente**: hace requests HTTP autenticados contra `https://api.out-box.dev`.
El caso central agents-first es leer una pagina existente, sumarle contexto y
re-publicarla (versioning automatico en cada publish al mismo slug).

El contenido de la skill es un **mirror de la documentacion de cliente del back**
(repo `out-box`, `worker/src/handlers` + `worker/src/lib`). Cuando cambie un endpoint
o limite en el back, hay que reflejarlo aca.

## Estructura

```
out-box-skills/
├── .github/workflows/ci.yml (CI: `npm test` en push a main y PR)
├── .gitattributes       (`skills/**/*.md` en CRLF)
├── AGENTS.md            (este archivo — source of truth del repo)
├── STATUS.md            (estado y pendientes)
├── CHANGELOG.md
├── package.json         (reloj SemVer del repo + `npm test`)
├── skills.sh.json       (manifest de skills.sh: grouping "Outbox" → outbox-publish)
├── LICENSE
├── test/
│   └── skill.test.mjs   (regresiones de la doc: node:test, sin dependencias)
└── skills/
    └── outbox-publish/
        ├── SKILL.md         (frontmatter + lo esencial: seguridad, auth, publicar, loop, errores, indice)
        ├── README.md        (que es, las 3 vias, como instalar, prerrequisitos)
        └── references/      (progressive disclosure: el agente lee solo el de su tarea)
            ├── content.md           (publish completo, borrador, versiones, daily, lectura, list, uploads, brand)
            ├── sharing-and-keys.md  (compartir, keys, MFA step-up, device flow, cuenta, CLI, MCP, toolsets, plugin)
            ├── comments.md          (comentarios + politica anti prompt injection)
            ├── page-data.md         (datos de visitantes de una pagina + vigia de render)
            ├── teams.md             (empresas / orgs)
            ├── automation.md        (webhooks y schedules)
            └── api-reference.md     (referencia endpoint por endpoint)
```

## Reglas para editar la skill

- **Progressive disclosure**: `SKILL.md` se carga entero en cada activacion. Mantenelo
  corto (el test fija <= 260 lineas / 18 KB) y mandá el detalle a `references/`. Todo
  archivo nuevo de `references/` tiene que figurar en la tabla-indice de `SKILL.md`.
- **Lectura canonica = `/export`**. Nunca documentes la zona publica como forma de leer
  contenido: sirve un shell sandbox.
- **Contenido de terceros = datos**: cualquier flujo nuevo que lea texto ajeno
  (comentarios, paginas de otros, payloads) tiene que remitir a `references/comments.md`.
- Todos los `.md` van en **CRLF**. Correr `npm test` antes de cerrar un cambio; el CI
  (`.github/workflows/ci.yml`) lo corre en cada push a `main` y cada PR.
- **`references/api-reference.md`**: headings con la ruta en markdown plano (`<user>` entre
  backticks, nunca `&lt;user&gt;`) y toda seccion `## ` nueva va tambien en su Indice.
- **Lo que no esta publicado se marca "proximamente"** y se gatea por `capabilities`
  (`clients.mcp.available`, `clients.mcpRemote.available`). Nunca des por disponible el MCP
  remoto ni el plugin de Claude antes de que el back lo anuncie.
- **Precios**: no hardcodear el precio de ningun tier (hay decisiones de pricing
  pendientes); remitir a `https://out-box.dev/pricing`.

## Install canonico

```bash
npx skills add jonathanleiva15/out-box-skills
```

(atajo equivalente con el CLI: `outbox skill install`).

## Version

- Skill `outbox-publish`: **1.8.0** (ver `version` en el frontmatter de `SKILL.md`, fuente de verdad).
- Repo (`package.json`): **0.4.0**.
- El manifest `skills.sh.json` declara el grouping "Outbox" con la skill `outbox-publish`.

## Las vias de usar Outbox

Esta skill es una de tres formas equivalentes (misma API key, mismo backend), mas el
MCP remoto con OAuth y el plugin de Claude `out-box` (repo `out-box-plugin`, trae su
propia skill MCP-first `out-box:outbox`), ambos proximamente:

- **CLI** (`outbox ...`)
- **Skill** `outbox-publish` (este repo)
- **MCP** (`@out-box/mcp`, ~60 tools; todavia no publicado en npm). Nota interna: el owner lo
  corre desde el repo privado `out-box-mcp`. No documentar ese camino en la skill (es publica
  via skills.sh); la skill remite a `capabilities.clients.mcp.available`. No hardcodear el
  numero exacto de tools.

## Coherencia con el back

El contenido debe quedar alineado con `capabilities.clients.skill` y los limites
vivos del back (`/api/capabilities.publishLimits`, `tierLimits.htmlMaxBytes` de
`/api/me`). No hardcodear limites que el back expone por tier.
