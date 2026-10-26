---
title: "Page scores: the score engine in the browser"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [11-kit-site-rules, 12-site-output-step]
---

## Goal

The editor scores a page in Lighthouse's five categories (performance, accessibility, best practices, SEO, and Agentic Browsing, shown as **Agents**) in the user's own browser, as close to Lighthouse as possible, and again at once after every change ([ticket 10](../../tickets/10-grill-page-scores.md#resolution-2026-10-26)). Size: L.

## Decided behaviour

- **One rule list, two users (DRY):** the rules live once in `shared/site-score/`. `kit site-rules` (slice 11) and this engine both import it; neither keeps its own copy. Slice 11 creates the module; this slice adds what the browser needs.
- **Accessibility:** axe-core, pinned to the exact version the pinned Lighthouse uses (read from Lighthouse's own `package.json` by `kit deps`), run with Lighthouse's axe rule set. The score uses Lighthouse's audit weights from its category config.
- **SEO and best practices:** Lighthouse's audits in those categories are repeated one by one as page checks, with Lighthouse's weights. Audits that need a network or a real server (HTTP status, HTTPS, console errors in other origins) take the answer the host gives, following [ticket 08](../../tickets/08-grill-host-dependent-rules.md#resolution-2026-10-26).
- **Agents (Agentic Browsing):** Lighthouse's audits in this category are repeated one by one, like SEO and best practices, with its weights ([ticket 10 follow-up](../../tickets/10-grill-page-scores.md#follow-up-2026-10-26)). The category is experimental, so its audit list is read from the pinned Lighthouse's category config, not copied by hand, and the monthly check (slice 51) follows its changes.
- **Speed:** measured in the editor's preview frame of the page with `PerformanceObserver` (layout shift, largest contentful paint, long tasks for blocking time, first paint), then scored with Lighthouse's own log-normal curves and weights from the pinned version. No "estimated" mark anywhere (Lex: "we don't need to show estimate").
- **What is scored:** the page as the site-output step (slice 12) would write it, saved and unsaved changes alike, so the generated canonical, description and picture sizes count.
- **Immediately:** every change re-scores the page it touched after a short pause in typing (about 500 ms, the same pause the edit bar uses). Results are findings with a rule id, a category, the spot (element path or file line) and the Lighthouse or spec link; the Inbox (slice 41), the rings (63) and the details (64) read this one list.
- **Never in boot:** the engine and axe-core load lazily after the editor is idle, in their own chunk. `kit size` boot bytes stay unchanged; the boot budget is on its way back to 355 KB (tech-debt 12), so nothing here may land in the boot chunk.

## Files

Expected: `shared/site-score/` (rules, weights, curves), `src/site-score/engine.ts` (lazy), `src/site-score/speed.ts` (preview measuring), `scripts/agents/site-rules.mjs` (imports the shared list), `package.json` (axe-core pin), tests.

## Done when

- On the fixture sites (`--site new` and `--site edited`), the engine's accessibility, best practices, SEO and Agents scores equal `kit lighthouse`'s; speed is within the parity gap slice 62 sets.
- A unit test changes a picture's description and sees the accessibility score move within one pause.
- `kit size`: boot bytes unchanged; the engine chunk's size is quoted in Done.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-sq-60 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-sq-60 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower.
- `kit lighthouse` (with `kit site-rules`) on the new and edited site, `RESULT:` lines quoted in Done.
- `kit shots` of the touched screens, light and dark, 390 and 1280 wide (Lex sees the contact sheet); Opus UX review of the sheet against the [UX rulebook](../../../../agents/ux-rulebook.md).
- One second opinion on the final version (`grok-4.7` or `gpt-6.1-sol`).
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
