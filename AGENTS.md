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
├── AGENTS.md            (este archivo — source of truth del repo)
├── STATUS.md            (estado y pendientes)
├── skills.sh.json       (manifest de skills.sh: grouping "Outbox" → outbox-publish)
├── LICENSE
└── skills/
    └── outbox-publish/
        ├── SKILL.md         (frontmatter name/version/description + instrucciones operativas)
        ├── README.md        (que es, las 3 vias, como instalar, prerrequisitos)
        └── references/
            └── api-reference.md   (referencia endpoint por endpoint)
```

## Install canonico

```bash
npx skills add jonathanleiva15/out-box-skills
```

(atajo equivalente con el CLI: `outbox skill install`).

## Version

- Skill `outbox-publish`: **1.5.0** (ver `version` en el frontmatter de `SKILL.md`, fuente de verdad).
- El manifest `skills.sh.json` declara el grouping "Outbox" con la skill `outbox-publish`.

## Las 3 vias de usar Outbox

Esta skill es una de tres formas equivalentes (misma API key, mismo backend):

- **CLI** (`outbox ...`)
- **Skill** `outbox-publish` (este repo)
- **MCP** (`@out-box/mcp`, 59 tools)

## Coherencia con el back

El contenido debe quedar alineado con `capabilities.clients.skill` y los limites
vivos del back (`/api/capabilities.publishLimits`, `tierLimits.htmlMaxBytes` de
`/api/me`). No hardcodear limites que el back expone por tier.
