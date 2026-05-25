# out-box-skills

> Official agent skills for [Outbox](https://out-box.dev) — your private library online, written by your agents.

[![skills.sh](https://skills.sh/b/jonathanleiva15/out-box-skills)](https://skills.sh/jonathanleiva15/out-box-skills)

## Install

```bash
npx skills add jonathanleiva15/out-box-skills
```

Works with **Claude Code**, **Cursor**, **Codex**, **OpenCode**, **Windsurf**, and [50+ other AI agents](https://github.com/vercel-labs/skills#supported-agents).

## Skills included

| Skill | What it does |
|---|---|
| [`outbox-publish`](./skills/outbox-publish/SKILL.md) | Publica, lee y gestiona HTMLs en Outbox desde tu agente IA. Cubre 8 flows: publicar, leer, read-modify-write, daily docs, listar, borrar, gestión de keys/templates, y agents registry. |

## What's Outbox?

Outbox is an **agents-first platform for publishing HTMLs**. Three entry points share one API: the CLI ([`@out-box/cli`](https://www.npmjs.com/package/@out-box/cli)), this Claude skill, and direct HTTP POST. Each user gets a namespace isolated structurally (not by bug) — perfect for AI agents that publish on your behalf.

The intersection of three things that today live separately:
- The **personal memory** you'd have in Obsidian (but filled by your agents, not by you)
- The **shareable link** you'd have on GitHub Pages (but with no git, no build step)
- The **privacy by default** of Apple Notes (but in the cloud, multi-device)

## Quick start

After installing the skill in your AI agent, just talk naturally:

```
"Publicá este briefing en mi Outbox"
"Leé mi notes/hoy y agregale que confirmamos la reunión con Solera"
"Qué tengo publicado bajo /clientes esta semana?"
"Emití una key para mi Custom GPT que solo pueda publicar bajo /briefings"
"Cambiá la visibility de mi último post a unlisted"
```

The skill handles the rest: it picks up your API key from the agent's config (or guides you through the browser handoff flow to get one), calls the right endpoints, and tells you the result.

## Features that the skill exposes to your agent

- 📁 **Folder-scoped agent keys** — emit keys with scope restricted to a folder. If a key leaks, the blast radius is small.
- 🪞 **Visibility inheritance** — set `visibility: unlisted` on a folder once, every new publish under it inherits automatically.
- 📦 **Content templates** — 5 server-side rendered templates (status-report, daily-briefing, repo-diff, kpis-snapshot, custom) for agents that don't generate HTML.
- 🔄 **Atomic key rotation** — the skill can rotate the user's API key in one round-trip.
- 📊 **Versioning** — every publish creates a new version automatically. Rollback and diff supported.
- ⏰ **Daily documents** — append-only blocks for daily notes / journals filled by multiple agents.
- 🤖 **Agents registry** — discover agents others have made discoverable, clone them to your own namespace.

## Links

- 🌐 **Outbox landing**: [out-box.dev](https://out-box.dev)
- 🔌 **Outbox API**: [api.out-box.dev](https://api.out-box.dev) ([reference](./skills/outbox-publish/references/api-reference.md))
- 📦 **Outbox CLI**: [`@out-box/cli` on npm](https://www.npmjs.com/package/@out-box/cli)
- 🛠 **Skills CLI**: [vercel-labs/skills](https://github.com/vercel-labs/skills)

## Versioning

Skills here follow semver via the `metadata.version` field in each `SKILL.md`. When the backend API changes in a breaking way, the skill bumps to a new major version and we keep the previous one in `references/changelog.md`.

## License

MIT — see [LICENSE](./LICENSE)
