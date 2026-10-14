---
title: Agents set shape and focus, and trim
type: task (AFK)
status: open
assignee: claude (mm-45 runner)
blocked_by: [38-place-shape-and-focus, 40-trimmed-copies, 37-agents-adding]
builder: sol
phase: 3
---

## What

Ticket [13](../../tickets/13-what-agents-may-do.md#resolution-2026-10-13) "Placing and framing".

- Tools to set a place's shape and focus point, and to trim, zoom, turn or flip, which saves a Trimmed copy exactly as the popup does.
- Media chapter: phase 3's rules (shape and focus change only the place; trims make a new file for that place); starter copy, fixture and vendored copy refreshed.

## Done when

- `tests/mcp-runtime.test.ts`: shape and focus written as the popup writes them; a trim makes a `-crop` file; the drift test passes.

## Build (2026-10-14)

- **Behaviour.** MCP tool `frame_image` (28 tools) reads the place's file, shape, focus and trim, changes shape/focus through the popup's `framePlace`, or makes a Trimmed copy through the lazy `trimPlace`. Trims read the full original, capture its asset revision before reading bytes, use the site's remembered quality and save the page, records, responsive copies and unused earlier-copy removal in one guarded batch, labelled "Picture trimmed". Re-cropping uses a fresh numbered address; the original's bytes and record stay unchanged. Without a frame change, the place's inline style stays byte-for-byte. Description and Decorative rules, picture unwrapping, sizing and loading share the extracted `mediaPlaceSwap` with picker Use and agent placement.
- **Design choices (★).** Trim arguments describe the whole new rectangle after flips and turn; zoom shrinks it about its centre, never hides an invalid rectangle. Trim validation lives in `shared/media-trim.ts`, re-exported by the existing geometry engine. Agent validation moved from the eagerly shared `shared/agent.ts` to `shared/agent-media-args.ts` so both Worker and lazy tab code use one rule set without pulling trim code into boot. The current popup has shape/focus controls only; its future trim controls can call the shared entry.
- **Tests.** `npm run check` and `npm run lint` pass. `scripts/agents/unit.sh` runs `npm test`: 2,881 pass, only the expected Media chapter drift test fails. Coverage includes Worker refusals and queued arguments, pure trim conversion, popup/agent framing equality, original-byte trims and re-crops with one Undo each, stale page/records/asset/version/branch refusal, plain preparation errors, read reports and the older-image picker/agent equality case with the same copy uploads. The MCP Media and image-popup browser specs pass 9/9 with CI fonts; the new framing/trim/Undo case also passes with the default fonts.
- **Bytes.** Same-session production entry gzip: 240,441 B before, 240,378 B after (-63 B). Production cold median of three loads: 347 KB gzip before first preview paint, within the 355 KB budget.
- **Runner work.** No commit, install, push, deployment, delegated agent or starter edit. Changes remain unstaged. The runner must copy the Media chapter to the starter, refresh the fixture and vendored copy, then rerun `tests/agents-md-drift.test.ts` and close the ticket. Status stays `open` instead of the runner's invalid `in progress` value so the ticket lint passes.
