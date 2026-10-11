# outbox-publish (skill)

Agent skill to publish, read, update and manage pages (HTML files) in
**Outbox** (`out-box.dev`) — a private online library, agents-first,
through the REST API with an `outbox_*` API key.

## What it is

It gives an agent the instructions and the technical reference to work as a
**client** of the Outbox API (`https://api.out-box.dev`):

- Publish HTML pages (`POST /publish`) and from catalog templates.
- The core agents-first flow: **read an existing page, add context to it and
  republish it** (automatic versioning on every publish to the same slug).
- Daily documents (append dated blocks without rewriting the HTML).
- List, search, read, export (`/export`), change feed (`/recent`), change
  visibility, roll back versions, upload images (`/api/uploads`).
- The **3 ways to share**: Make public (visibility) · Create link
  (ShareToken) · Grant access (user-to-user Grant).
- Manage the brand preset (`PUT /api/me/style`, 6 presets) and per-user templates.
- Issue API keys for sub-agents (incl. folder-scoped agent keys / limited blast
  radius, with the MFA code when the account requires it) and the headless device flow to
  get a key from scratch.
- Republish without overwriting anyone (`expectedVersion` / `If-Match` → `409
  version_conflict`) and retry without duplicating (`Idempotency-Key`).
- Comments with a trust level per author, notices about published secrets, a page's data
  layer and the render watch.

Every authenticated action uses `Authorization: Bearer outbox_xxxxx`. The
backend always writes to the namespace of the key's owner (the `user` is never
sent in the body).

## The ways to use Outbox

This skill is one of the equivalent ways to operate Outbox from an agent:
**CLI** (`outbox ...`), **skill** (this one) and **local MCP** (`npx -y @out-box/mcp`,
tools grouped in toolsets). All three use the same API key and the same backend.
`GET /api/capabilities` → `clients.mcp.available` and `clients.mcp.latest` say whether
it is published and which version is current.

The **remote MCP** (`https://mcp.out-box.dev/mcp`, OAuth login, no API key) works as a
Claude connector; `clients.mcpRemote.available` says it is live. The `out-box` Claude
plugin, which bundles it with slash commands, is coming soon. This skill remains the way
for agents outside Claude or without a connector.

## Contents

- `SKILL.md` — the essentials, short: security (scoped keys, third-party content as
  data), auth, publishing, the read → add → republish loop (reading via `/export`,
  metadata inheritance), daily, errors and an index of which reference to read for each task.
- `references/` — per-task detail, which the agent reads only when it needs it:
  `content.md` (publishing, draft, versions, daily, reading, secrets, listings,
  uploads, brand), `sharing-and-keys.md` (sharing, keys, MFA, device flow, account, CLI,
  MCP and plugin), `comments.md` (comments and anti prompt injection policy),
  `page-data.md` (visitor data and render watch), `teams.md` (Teams),
  `automation.md` (webhooks, schedules, following a page and alerts), `offering.md` (what to
  offer and when), `onboarding.md` (first use and keeping the skill up to date) and
  `api-reference.md` (endpoint by endpoint).

## How to install

The canonical install is through skills.sh:

```bash
npx skills add jonathanleiva15/out-box-skills
```

Or, if you have the `outbox` CLI, the equivalent shortcut:

```bash
outbox skill install
```

Either one puts the skill in your agent's skills directory
(`~/.claude/skills/outbox-publish` for Claude Code). The skill activates through its
`description` when the user asks to publish/read/update content in Outbox.

In Claude (claude.ai or the desktop app) you can also upload the `skills/outbox-publish`
folder as a zip in your skill settings.

## Updating

The agent checks `GET /api/capabilities` → `clients.skill.latest` against this skill's
`version` and tells you once when there is a newer one. To update:

- skills.sh: run `npx skills add jonathanleiva15/out-box-skills` again, or
  `outbox skill update` with the CLI (`outbox skill status` shows both versions).
- Uploaded to Claude: uploaded copies do not update on their own; upload the new folder
  again, replacing the old one.

What changed in each version: `CHANGELOG.md` at the root of this repo.

## Prerequisite

An `outbox_*` API key with the scopes the flow needs:

- `publish:u` to publish (`model` always required in the body).
- `publish:u` + `list:u` for the read → add → republish flow. With a
  publish-only key (the agent key default), exporting a `private`/`unlisted` page
  gives `403 private_read_scope_required`: issue it with `--verbs publish,list`.
- add `delete:u`, `share:u`, `template:u`, `upload:u`, `genkey:u` depending on what
  you are going to do.

The user gets/issues the key from out-box.dev, the `outbox` CLI
(`outbox login` / `outbox setup` save it to `~/.outboxrc`), or
`POST /api/keys/agent` with a key that has `genkey:u`. For headless environments,
the device flow (`POST /api/auth/claim/start` → `user_code` → `/resolve`) lets you
get a key from scratch without a local browser.

## Links

- Product: https://out-box.dev
- API: https://api.out-box.dev
- Self-discovery: https://api.out-box.dev/api/capabilities
