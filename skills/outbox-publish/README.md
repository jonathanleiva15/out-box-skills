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
  `automation.md` (webhooks and schedules) and `api-reference.md` (endpoint by endpoint).

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

## Without an account

An agent with no key can still publish a page that lasts **72 hours**, when the backend
has it enabled (`GET /api/capabilities` → `features.anonPublish: true`; otherwise
`403 anon_publish_disabled`):

```bash
curl -sS -X POST https://api.out-box.dev/api/anon/publish \
  -H 'content-type: application/json' \
  -d '{"markdown": "# Trip notes\n\nDay 1: ...", "title": "Trip notes"}'
```

`html` or `markdown` (one of the two), `title` optional. Raw `text/html`, `text/markdown`
and `multipart/form-data` with `file` also work. The response (`201`):

```json
{
  "id": "k3x9...",
  "url": "https://out-box.dev/p/k3x9...",
  "expiresAt": "2026-10-14T12:00:00.000Z",
  "ttlSeconds": 259200,
  "claimToken": "anc_...",
  "claimUrl": "https://out-box.dev/claim/page#k3x9....anc_..."
}
```

- Anyone with the `url` can open the page until `expiresAt` (72 h); it is not in any library.
- Limits: 2 MiB of HTML or 256 KiB of markdown (`413`), 5 per hour and 20 per day per IP
  plus a global daily cap (`429` with `Retry-After`: wait, do not retry in a loop).
  `503 anon_paused` means anonymous publishing is paused for now.
- **Give the human the `claimUrl`, not the `claimToken`**: opening it lets them save the page
  to their account before it expires. The token is in the URL fragment; do not paste it
  anywhere else.
- **Never publish private data without an account**: no personal data, client data,
  credentials or anything the user would not post on a public link.
- With a key, publish to the library with `POST /publish` instead. In the local MCP this is
  the `outbox_publish_anonymous` tool, listed only when the server has no key.
  Endpoint details: `references/api-reference.md`, "Without an account".

## Links

- Product: https://out-box.dev
- API: https://api.out-box.dev
- Self-discovery: https://api.out-box.dev/api/capabilities
