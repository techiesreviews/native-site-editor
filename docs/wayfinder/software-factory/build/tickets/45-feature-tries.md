---
title: Scripted tries for the rest of the feature list
type: task (AFK)
status: open
assignee: sf-45 (this session)
builder: claude
blocked_by: [42-kit-ux-scripted]
---

## Goal

Slice 42 writes tries only for the features the 13 named screens cover. The whole list must be tryable before Lex's end check ([checking-skill resolution](../../tickets/03-grill-checking-skill.md#resolution-2026-10-22) item 2), and the 7 bugs Lex found himself (research 01, section A: drag at an edge, selection in Edit component mode, an upload "vanishing" at 390 px, the image popup flicker, a 4 px gap) need tries that would have caught them.

## Decided behaviour

- One steps file per feature marked `Steps: none yet` in `docs/agents/features.md`, in `scripts/agents/shots/features/<feature-id>.json`, using the steps language of slice 42 (including `drag`, `record`, `expect visible`). Each feature's `Steps:` line is updated.
- Priority order: first the features behind the 7 bugs of research 01 section A (each try written so that the old bug would have shown: say in a comment line which bug), then phone (`Phone: yes`) features, then the rest by area.
- A feature that cannot be tried with the steps language stays `Steps: none yet (<why>)`, and the Done lists them; no new steps actions in this slice (ask in `decide` if one is clearly needed).
- **May split** by area if more than about 40 features remain: the lead writes 45a, 45b… with the same text and an area list each.

## Files

- `scripts/agents/shots/features/` (new steps files)
- `docs/agents/features.md` (`Steps:` lines only)

## Done when

- `scripts/agents/kit ux --all --no-review` runs every try; Done reports tried / untried / failed counts. A failing try is either a real editor problem (listed in Done for the lead to ticket; the try stays) or a wrong try (fixed).
- `scripts/agents/kit unit tests/features-list.test.ts` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Steps files and one doc; heavy on the browser: run it when no other slice runs specs, and never beside a timing run.

- `scripts/agents/kit doctor`; `ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit bg slice-sf45 -- scripts/agents/kit slice --ticket docs/wayfinder/software-factory/build/tickets/45-feature-tries.md --builder claude-opus-5-5`; `scripts/agents/kit wait job slice-sf45 --timeout 2h`.
- Report: the `kit ux --all --no-review` RESULT line and counts, editor problems found, review decisions, PR and merge SHA.
