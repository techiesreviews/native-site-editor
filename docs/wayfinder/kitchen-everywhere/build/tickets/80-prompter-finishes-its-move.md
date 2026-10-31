---
title: "The prompter finishes its move onto the shared kit (merge `shared-kit` into `main`), and test builds use https, never a file"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: []
---

## Goal

Prompter ↔ CamFrame retro (Lex, 2026-10-31), findings 5 and 3. The prompter (`~/Projects/techies-prompter`, `techiesreviews/prompter`, public, live on `main` at prompter.techies.tools) still runs its private kit copy on `main`. Its move sits unmerged on `origin/shared-kit` (`6dcc16b`, `ff2e811` "Move onto the shared Agent Kit; drop the private copy", `cf596c7`), while `main` moved on by 10 commits (the CamFrame link, `92baa02`; the demo, `a3525a1`). The move was waiting for the CamFrame link branch, which has now merged.

## Check (lead, 2026-10-31)

Both real (checked: `git log origin/main..origin/shared-kit` shows the 3 commits; `wrangler.jsonc` has `workers_dev: false`, `preview_urls: false` and only the custom domain; CamFrame's `originAllowed` takes `https://prompter.techies.tools`, `null` and localhost). On finding 3: a `file://` page re-asks for the microphone on every restart, but `http://localhost` is a secure context whose permission sticks, and CamFrame already accepts localhost. So the agent-docs note can land now without any Cloudflare change; a preview address on the internet (so Lex can test from any machine) changes Cloudflare and waits for his OK (Tuesday pack 3 Nov).

## Decided behaviour

- Merge `origin/shared-kit` into `main` through the shared kit's own `kit pr` (the first PR on it). Conflicts in `docs/agents/` keep `main`'s newer content and the shared-kit layout. Afterwards `scripts/agents/` holds only the launcher, `kit.json` and project commands; `kit doctor` passes; the live site is unchanged (no deploy unless the merge changes `src/`).
- Prompter agent docs (`docs/agents/kitchen-extras.md`): microphone, voice and CamFrame tests run from `http://localhost` (`npx wrangler dev` or the kit's own server), never a `file://` copy; a test build for Lex on another machine waits for the preview address.
- If Lex says yes to the preview address: `preview.prompter.techies.tools` as a second Worker custom domain (as the techies.tools subdomains do), its origin added to CamFrame's `originAllowed` (a CamFrame PR), and the note above points there. That part is its own follow-up once he answers.

## Files

In `~/Projects/techies-prompter`: the merge, `docs/agents/kitchen-extras.md`. Later (after Lex's yes): `wrangler.jsonc`; in `~/Projects/camframe`: `src/prompter-link.js` and its test.

## Done when

- `main` holds the shared-kit move and today's work; `scripts/agents/kit doctor` passes there; the private kit copy is gone; the live site works as before (a check of prompter.techies.tools after merge).
- The localhost note is in the prompter's agent docs.

## Kit commands and evidence

Agent Kit is required. In the prompter: `scripts/agents/kit doctor`, `kit unit --affected`, `kit review`, `kit pr`; report the RESULT lines, the PR URL and merge SHA. This ticket's Done lands on `dev` here with `scripts/agents/kit pr` (docs tier).
