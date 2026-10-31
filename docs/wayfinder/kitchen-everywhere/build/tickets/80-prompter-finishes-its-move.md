---
title: "The prompter finishes its move onto the shared kit (merge `shared-kit` into `main`), and test builds use https, never a file"
type: task (AFK)
status: closed
assignee: ke-80
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

## Comments

- Lex, 2026-10-31: yes to the preview address, "on next build": build `preview.prompter.techies.tools` (a second Worker custom domain) and CamFrame's `originAllowed` entry for it in this ticket, not as a later follow-up. Test builds for Lex go there.

## Done (2026-10-31)

All three parts merged. The live prompter was not deployed: production waits for Lex.

**1. The prompter is on the shared kit.** [techiesreviews/prompter#1](https://github.com/techiesreviews/prompter/pull/1) merged into `main` at `a388e84e4a5a2e75f36d86c95bc972ee9947ebda` (head `853d53b`). It was the first PR through the prompter's shared-kit `kit pr`.
- `origin/shared-kit` (`6dcc16b`, `ff2e811`, `cf596c7`) was merged into `origin/main` (`a3525a1`) in the worktree `~/Projects/techies-prompter-ke80`. `kit pr` lands a straight line and rebased the merge commit away, so the resolved merge became one commit, `b293471`. Its tree is the resolved merge, unchanged. Conflicts: `AGENTS.md` keeps main's newer speech, CamFrame and design facts in the shared-kit's shorter shape. `prompter-kit.mjs` takes the shared-kit's usage (suites by file; `shots.mjs` became `page.mjs`, which carried main's CamFrame and speech checks over). `docs/agents/agent-scripts.md` was removed, as on shared-kit. Its command list now lives in `kitchen-extras.md`, and each suite's checks live in their own file.
- `scripts/agents/` on `main` now holds only `kit` (launcher), `kit.json`, `hooks/run.sh`, `project.d/{size,specs}`, and their helpers `prompter-kit.mjs` and `specs-affected.mjs`. The private kit copy is gone: `agent-run.mjs`, `ci-summary.mjs`, `kit-lib.*`, `kit.d/`, `review-brief.mjs`, `sol-run.mjs`. Skill guard: `git ls-tree -r origin/main | grep -i skill` finds nothing, and the `skills: ok` step passed in every `kit pr`.
- `AGENTS.md` gets the `kit --help` line that `kit init` adds (`kit init --check`: `RESULT: ok init check: nothing missing`).
- `src/` changed against the old `main` in comments only: `src/ui/range-field.css` and `.mjs` comments point to the README, and `src/ui/README.md` gains a Checks line. These comments are inlined into the built page, so a live deploy would change the page's bytes and CSP hash but not what it does. **No live deploy was done; production waits for Lex.** prompter.techies.tools still answers 200 with the old build.
- `RESULT: ok doctor 13/13 checks passed` (on merged `origin/main`). `RESULT: ok unit 136/136 (13 files)`. `RESULT: ok specs` (page and range-field suites; the page suite timed out once on its file-picker step under load, then passed when re-run with nothing changed). `RESULT: ok merged #1 a388e84`.
- Review (Claude Opus 5.5) ran 4 times, with 3 fix rounds. The fixes:
  - `kit specs --affected` now also counts uncommitted and new files (`scripts/agents/specs-affected.mjs`, tested in a scratch repo), and a change to the runner reaches every suite.
  - The colour check now reads the whole component file, including named colours.
  - `--host` and `--base` are now strict.
  - `paths.visible` now covers the modules the page inlines.
  - AGENTS.md has the project's own design rules back.
  - `kitchen-extras.md` says reviews are Claude plus the second look, never GPT or Codex.
  - New tests keep the preview Worker in step with the live one.
- After the third fix round, the lead's waiver landed the PR with 8 open P3 findings and gaps ("Merged with 8 waived findings" comment on the PR). Second look: skipped (Grok's weekly budget is used up, 8/8 in 2026-W44; the free OpenCode model had no session within 300 s).

**2. The preview address.** `env.preview` in `wrangler.jsonc` is the Worker `techies-prompter-preview` on the custom domain `preview.prompter.techies.tools`, with its own Durable Objects. `npm run deploy:preview` runs `wrangler deploy --env preview` and never touches the live Worker. Its build (`scripts/build.mjs --host preview.prompter.techies.tools`) allows `wss://preview.prompter.techies.tools` in the CSP, and its `robots.txt` is `Disallow: /`. The live build output is unchanged; a test checks that.
- Deployed once from the merged branch (wrangler's own OAuth login; version `578d33c7-8a9d-4433-abcb-5222eed8f17f`). Checked over https: `GET /` returns 200 and the same `index.html` as the local build. The CSP has `connect-src 'self' wss://preview.prompter.techies.tools http://127.0.0.1:47833`, and `robots.txt` is `Disallow: /`. `POST /mcp` ping returns 200, and `POST /api/agent-token` returns a token, so the preview relay's Durable Object works. Still 200 after the merge.
- `docs/agents/kitchen-extras.md` says this: microphone, voice and CamFrame tests run on https://preview.prompter.techies.tools or on `http://localhost`, never on a `file://` copy. Test builds for Lex go to the preview, with a curl check afterwards.

**3. CamFrame trusts the preview.** [techiesreviews/camframe#24](https://github.com/techiesreviews/camframe/pull/24) merged into `main` at `8970806609349d327f11612e647d479e839c1c7c` (head `4242be9`). It went through CamFrame's own `kit pr` in the worktree `~/Projects/camframe-ke80`; the `experiment/gpui-port` checkout was left alone. No release was tagged.
- `originAllowed` (`src/prompter-link.js`) now accepts exactly `https://preview.prompter.techies.tools` (`PROMPTER_PREVIEW_SITE`, in a set with the live site and `null`). Tests:
  - Look-alikes are refused: the http form, other ports, longer names and other subdomains.
  - Through the real server: the preview's status read, its Private Network Access preflight and a cue all get its CORS origin.
  - A look-alike's cue and preflight get 403 with no CORS or Private Network Access header.
- The docs, after review: a new ADR 0033 supersedes part of ADR 0031 and names the cost, and a verification run was added (`docs/verification/runs/2026-10-31-prompter-link-preview-origin.md`). The README count, W-30, KG-13, the product spec and the data contracts all name the preview.
- `RESULT: ok unit 191/191 (12 files)`. `RESULT: ok doctor 12/12 checks passed; warning: 4 setup pieces missing (run scripts/agents/kit init)` (the kitchen pointer, the extras, the maps README and `.gitattributes`; left for ticket 81's `kit init --all`). A fresh worktree has no `node_modules`, so doctor's Playwright check fails there until one is linked; this run hard-linked them from the camframe-link worktree (same lock file). `RESULT: ok merged #24 8970806`.
- Review ran 4 times, with 3 fix rounds (only P2/P3 findings). The last review was clean, so no waiver was needed. Second look: skipped (Grok budget 8/8 in 2026-W44; OpenCode had no session within 300 s).

### Follow-ups

- **Lex:** deploy the prompter's `main` live when convenient (only comment changes in `src/ui/`, see above). CamFrame's preview origin ships with the next CamFrame release (Lex's).
- Prompter, waived on PR #1 (P3 and gaps):
  - `kit specs --affected --base=main` (with `=`) is ignored, and the default base should come from `branches.land`.
  - Renames out of `src/` reach no suite (`git diff --no-renames`).
  - The preview should also send `X-Robots-Tag: noindex`, with a test.
  - `paths.visible` `^src/ui/` also matches `src/ui/README.md`.
  - The mobile Settings check should include a real tap on the slider's name.
  - No test covers how `kit specs` reads its arguments.
  - Nits: `COLOUR` system-colour words could match class names; `prompter-kit.mjs` reads `kit.json` outside its `try`; the workflow actions are pinned by tag, not SHA.
  - On the preview, the `src/mcp.mjs` texts still name the live address.
- CamFrame: the verification run names the PR's commits before the rebase-merge. On `main` they are `f6a67fd`, `93cbfdf`, `d31ea1e`, `8970806`.
- The main checkout `~/Projects/techies-prompter` is still on `main` at `a3525a1` (not pulled).
