---
title: "The editor's live deploy runs `kit release-check` first (follow-up on 72)"
type: task (AFK)
status: closed
assignee: tools-40
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

## Done (2026-11-20)

- **The PR:** https://github.com/techiesreviews/native-site-editor/pull/417 (Orbit card TOOLS-40), landed on `dev` through `kit pr` as `36ace76` (`RESULT: ok merged #417 36ace76`), CI green. Review: 1 round with claude-opus-5-5, approved (one P3, the emergency route's `npx wrangler`, fixed in the follow-up PR that closes this ticket). Second look: skipped (GPT usage limit, Grok's weekly count used up, 8/8 in 2026-W47, the free OpenCode model's usage limit).
- **The change:** `deploy:techies` is `scripts/agents/kit release-check && wrangler deploy --config wrangler.techies.jsonc`; `deploy:preview` is unchanged. `docs/agents/kitchen-extras.md` (Release to production) shows the line, says to deploy from a checkout of `main`, and names the lead's emergency route (`scripts/agents/kit release-check --waive "<reason>"`, then `npx wrangler deploy --config wrangler.techies.jsonc` by hand).
- **Tests:** `tests/deploy-techies-release-check.test.ts` (5: the exact script, no check in the preview deploy, the release line in the docs, and the script's own command line with a stand-in kit and wrangler: a failed check stops before wrangler, a passed one goes on). 4 of the 5 failed before the change.
- Done when 1: met — with the real kit and no real deploy (each `npm run deploy:techies` ran with a `--script-shell` wrapper that put a stand-in `wrangler` first on the PATH after npm's `node_modules/.bin`): in the build worktree with unsaved files, `RESULT: fail unsaved files (docs/agents/kitchen-extras.md, package.json) … HEAD 5086df42d is 1485 commits ahead of origin/main …`, exit 1, wrangler not called. In a scratch clone whose origin's `main` was the branch head, `RESULT: ok release-check 2ba37065 is origin/main, nothing unsaved` and the stand-in got `deploy --config wrangler.techies.jsonc`; with one untracked file there, `RESULT: fail unsaved files (unsaved.txt): …`, exit 1, wrangler not called. The clean case ran on a stand-in `origin/main`, since today's real one cannot run the check yet (see "Not yet on `main`" below).
- Done when 2: met — `kit unit --affected` → `RESULT: ok unit 5/5 (1 files)`; `kit doctor` → `RESULT: ok doctor 11/11 checks passed`.
- **Not yet on `main`:** today's `origin/main` (`18a3e0c`, 2026-10-31) still has the old in-repo kit, with no `release-check` command and no `scripts/agents/kit.json`, so the check cannot run on a checkout of it. The next live release (`kit pr --release`, after Lex's go) brings `dev`'s kit launcher, `kit.json` (`branches.release: main`) and this script to `main` together.
