# First use (onboarding) and keeping this skill up to date

> Part of the `outbox-publish` skill. Read it the first time the user works with Outbox in a
> conversation, and when `GET /api/capabilities` announces a newer skill.

## First use

Check what you already have, in this order, and stop at the first that works:

1. **MCP tools loaded** (any tool whose name ends in `outbox_<action>`): use them. The MCP
   handles the login; skip the rest of this section.
2. **A key** in `OUTBOX_API_KEY` or `~/.outboxrc`: `GET /api/me`. `200` → connected. `401`
   (`invalid_key`, `key_revoked`, `key_expired`) → the key is dead: connect again (step 3).
3. **Nothing**: connect by link (`references/sharing-and-keys.md`, "Getting a key from
   scratch"). Never ask the user to create a key by hand or paste one into the chat.
   If the user only wants a link now and does not want an account yet, and
   `GET /api/capabilities` → `features.anonPublish` is `true`, the backend can publish a page
   without an account for a limited time (`endpoints.anonPublish`); never do that with
   private data, and give the human the `claimUrl` so they can keep the page.

Once connected, onboard in **one short message**, not a tour:

- Who they are and their plan: `GET /api/me` (`user`, `tier`).
- If they asked for something, do it first. If they did not, offer to publish a private
  test page and give them the `url` (only they can open it).
- Then, at most two lines on what they can ask next, picked for what they are doing
  (`references/offering.md`): a link per client that tells them when it is opened, a
  daily page to keep adding to, a page others fill in, their brand on every page.
- If their library already has pages (`GET /api/list?limit=1`), they are not new: skip the
  intro and just do the task.

## Keeping this skill up to date

This skill's version is `version` in the frontmatter of `SKILL.md`. The latest published one
is `GET /api/capabilities` → `clients.skill.latest` (with `clients.skill.install` and
`clients.skill.source`).

- When you read capabilities anyway, compare both versions (SemVer). If `latest` is newer,
  tell the user **once per conversation**, in one line, and carry on with the task with
  this version. Never block the task, and never download or overwrite the skill files
  yourself without the user asking.
- How to update depends on how it was installed:
  - **skills.sh** (Claude Code, Cursor, Codex and other agents): run
    `npx skills add jonathanleiva15/out-box-skills` again (it replaces the installed copy),
    or `outbox skill update` if they have the CLI (`outbox skill status` shows both versions).
  - **Uploaded as a skill in Claude (claude.ai or desktop)**: those copies never update on
    their own. Point the user to `clients.skill.source`; they upload the new
    `skills/outbox-publish` folder as a zip in their Claude settings, replacing the old one.
  - **Claude plugin** `out-box`: it carries its own skill and updates with the plugin. It is
    coming soon; do not offer it yet.
- If the backend announces something this skill does not document (a `features` flag or an
  `endpoints` entry you do not recognize), trust capabilities over this skill and tell the
  user that updating the skill may cover it.
