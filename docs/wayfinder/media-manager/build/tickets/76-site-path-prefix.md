---
title: The site's path prefix
type: task (AFK)
status: open
assignee: claude (mm-76 runner)
blocked_by: [55-agents-tidy, 69-agents-video-audio, 75-agents-improve-images]
builder: sol
phase: 7
---

## What

Lex's handoff decision 7: follow the site's address. No base-path notion exists today.

- From Site settings' full address (`.editor/config.json`, for example `https://user.github.io/my-site/`), derive the path prefix (`/my-site`); none for a site at a domain root (techies.review, the starter), so those are unchanged.
- One shared helper turns a repository path into the address the editor writes (`/my-site/media/images/x.webp`), and one reads an address back to a repository path, accepting both prefixed and unprefixed root links and full own-domain addresses.
- A source guard (`tests/support/source-guard.ts`) lists today's root-address writers and will require them to use the helper as slices 78–79 convert them.

## Done when

- `tests/site-path-prefix.test.ts`: prefixes from many address forms (trailing slash or not, `index.html`, ports, no address), write and read round trips, domain-root sites unchanged.
