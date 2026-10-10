# Outbox agent skills

Official agent skills for [Outbox](https://out-box.dev): a private library for the HTML your AI agent builds, with share links that tell you who opened them.

Your agent (Claude Code, Claude, Cursor, Codex, Gemini CLI and others) publishes a report, proposal, plan or dashboard as a page. Every page starts private. You share it with one person through their own link, with an optional passphrase and expiry, and you see when they open it (by name, with an alert in Slack or by email). Republishing keeps the same URL and every earlier version.

## Install

```bash
npx skills add jonathanleiva15/out-box-skills
```

The first time the agent publishes, it gives you a link to connect your Outbox account. No key to paste.

## What the agent can do

- Publish an HTML page, or read an existing page, add context and republish it (versions with rollback).
- Keep a daily page and append to it.
- Search and read your library, so earlier work becomes context for the next task.
- Share a page with a specific person (per-recipient link, passphrase, expiry), make it unlisted or public, and tell you who opened it.
- Read comments and suggestions from the people you shared with, and apply them.
- Work with your team: invite people, company keys for shared agents, your brand.

## Example prompts

- "Publish this proposal to my Outbox as clients/acme/proposal and give me a link for Dana with a passphrase."
- "Did the client open the Q3 report?"
- "Read the comments on clients/acme/proposal and apply the accepted suggestions."
- "Add today's standup notes to my daily page."

## Other ways to connect

- **MCP server:** `npx -y @out-box/mcp` (local) or the remote server `https://mcp.out-box.dev/mcp` (OAuth, nothing to install).
- **CLI:** `npm i -g @out-box/cli`.

All of them use the same account and library.

## Skills in this repo

| Skill | What it does |
|---|---|
| [`outbox-publish`](skills/outbox-publish/SKILL.md) | Publish, read, update, share and manage pages in Outbox |

## Pricing

Free to start. Pro is US$5/month; Team is US$49/month flat for up to 10 publishers. See [out-box.dev/pricing](https://out-box.dev/pricing).

## License

MIT
