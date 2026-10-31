---
title: "The editor's live deploy runs `kit release-check` first (follow-up on 72)"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [72-release-check]
---

## Goal

Ticket 72's second look (editor PR #291, P1, waived by the lead as this follow-up): the ticket says a project's own live deploy calls `kit release-check` as its first step, but the editor's `npm run deploy:techies` (`wrangler deploy --config wrangler.techies.jsonc`) doesn't yet. So production could still go out from a checkout with unsaved files or commits that never reached `main`.

## Decided behaviour

- `deploy:techies` runs `scripts/agents/kit release-check && wrangler deploy --config wrangler.techies.jsonc`. A failed check stops the deploy with its plain-words line; the lead's `--waive` is the way through in an emergency (run by hand).
- `deploy:preview` is unchanged (preview deploys from `dev` aren't live; ticket 72 "Not checked").
- `docs/agents/kitchen-extras.md` (release section) shows the line, as `docs/kitchen-extras-template.md` does.
- Lands on `dev` before the next Tuesday ship (3 Nov), so the first production deploy after it uses the check; listed in the Tuesday pack as an easy-to-undo default.

## Files

`package.json`, `docs/agents/kitchen-extras.md`, a unit test that reads the script (or the existing scripts test).

## Done when

- `npm run deploy:techies` in a checkout with an unsaved file stops before `wrangler` (shown with `--dry-run` or a stubbed wrangler, never a real deploy); in a clean checkout on `origin/main` the check passes.
- `kit unit --affected`, `kit doctor` pass.

## Kit commands and evidence

`kit doctor`, `kit slice --ticket <this> --builder claude-opus-5-5` (or by hand, it's two lines), `kit unit --affected`, `kit review`, `kit pr`; report the RESULT lines. Never a real production deploy.
