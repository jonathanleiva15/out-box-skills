# What to offer and when

> Part of the `outbox-publish` skill. Outbox has features users almost never ask for
> because they do not know they exist. This file says when to offer them.

## How to offer

- **One suggestion, one line, at the right moment.** At most two per task. Say what the
  user gains ("you'll know when she opens it") and carry on with what they asked for.
- **Offering is not doing.** Anything that exposes content or sends data out (links,
  visibility, data layer, webhooks) is confirmed first (Security rule 4 in `SKILL.md`).
  The detail of each endpoint is in the reference cited.
- **Do not repeat.** If they already use it or said no, do not offer it again in the
  conversation.
- **Only what exists.** If `GET /api/capabilities` does not announce it or the route
  returns `404`, do not offer it. If a feature depends on the plan, point to
  `https://out-box.dev/pricing` without quoting prices.

## Moments

| When the user... | Offer | Detail |
|---|---|---|
| Is going to send the page to a client, prospect or specific person | A **per-recipient link** (`POST /api/share` with `recipient: "Laura · Acme"`, or `outbox share <slug> --recipient "Laura · Acme"`) instead of making it `unlisted`: every open is recorded under that person's name and whoever created the link gets an email when they open it (category `opens`, on by default). One link per person. | `sharing-and-keys.md`, `teams.md` |
| Shares prices, a proposal or something sensitive | A **passphrase** (`passphrase`) and an **expiration** (`expiresInDays`) on the link. If the page goes `unlisted`/`public`, a `ttl` turns it back to `private` on its own. | `sharing-and-keys.md`, `content.md` |
| Wants to review it before anyone else sees it | A **draft** with `previewUrl` and go-live when they approve it. | `content.md` ("Draft") |
| Asks whether the client saw it | `GET /api/u/<user>/<slug>/views` (`outbox opens <slug>` in the CLI, `outbox_page_views` in the MCP); `GET /api/share` also lists the `opens` of each link. If they sent it without a per-recipient link, tell them: next time, one link per person says who opened it. | `teams.md` |
| Builds something others fill in (intake, checklist, survey, approval, RSVP) | The **data layer**: the page stores what they write with `window.outbox.data`, no external forms. The policy must be turned on (confirm it). | `page-data.md` |
| Wants to hear about it in Slack or another tool | A **webhook** to a Slack (`hooks.slack.com`) or Discord Incoming Webhook: it is posted in that channel in its native format (there are no direct messages to a person) (opens, comments, versions, submitted forms; the live catalog is in `GET /api/webhooks/events`). | `automation.md` |
| Publishes their first page for clients and has no brand | A **brand preset** or their own template, so every page goes out with their identity. | `content.md` |
| Works with a sales team that shares pages | **Teams**: the team's space, a shared brand, per-recipient links for the team. The Team plan is requested with "Contact us" on `https://out-box.dev/pricing`. | `teams.md` |
| Publishes things they need to read every day | A **daily** with `append`, instead of a new page per day. | `content.md` |

## Example

The user says "publish the proposal for Acme and give me the link for Laura". Publish it
`private`, and before creating the link ask in one line: "Want a link just for Laura?
You'll know when she opens it, and I can add a passphrase if you like." With their yes,
`POST /api/share` with `recipient` (and `passphrase` if they asked for it) and share that
`url`.
