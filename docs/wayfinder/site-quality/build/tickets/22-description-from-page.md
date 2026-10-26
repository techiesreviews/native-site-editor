---
title: "A page's description from its first sentences"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [12-site-output-step]
---

## Goal

No page goes out without a description ([ticket 05](../../tickets/05-grill-automatic-fixes.md#resolution-2026-10-26): the editor uses the page's first sentence or two, no AI, no mark). Size: S–M.

## Decided behaviour

- In the site-output step: a page whose description is empty, or still equal to what the editor would have made from the page's last saved version, gets a new one from the first sentences of its main text, up to about 155 characters, cut at a word.
- Once Lex (or an agent) writes a different description, it is left alone. Nothing is stored to remember this: the comparison with the last saved version decides.
- `og:description` follows the same way when it matched the description.
- No mark, no message, nothing to approve.
- Switches on the SEO budget's description rule.

## Files

Expected: `src/site-output/descriptions.ts`, `src/page-builder/site-head.ts`, tests.

## Done when

- A new page saved with text gets a description from it; editing the text and saving updates it; a hand-written one survives later saves.
- `kit lighthouse --site new` and `--site edited`: SEO 100 on every run, enforced from this slice (with slice 20).

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-sq-22 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-sq-22 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower.
- `kit lighthouse` (with `kit site-rules`) on the new and edited site, `RESULT:` lines quoted in Done.
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
