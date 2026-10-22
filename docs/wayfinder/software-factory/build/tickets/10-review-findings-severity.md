---
title: "Review findings: severity read after any location, and \"Spec defects:\" headings"
type: task (AFK)
status: closed
assignee: lead-sf10
builder: opencode/deepseek-v4.1-flash-free
blocked_by: []
---

## Goal

Clean-up follow-up (slice 95, PR #119): `openFindings` in `scripts/agents/review-findings.mjs` (about line 49) looks for the severity only in a finding's first 80 characters, so `commit:<long ticket path>:line — P2: …` reads as "no severity" and blocks `kit pr` after three rounds (it blocked PR #119 three times). Research 01 also counted 17 unreadable reviews from findings listed under a `Spec defects:` / `Standards defects:` heading, which the parser does not know.

## Decided behaviour

- Severity is the first `P0`–`P3` token after the finding's location: strip a leading location (`<sha>:<path>:<line>` or `<path>:<line>`, line may be a range, optional backticks) and the separator after it (`—`, `–`, `-`, `:`), then read `\bP[0-3]\b` in the next 40 characters. `(P2)` and `**P2**` count. With no location, today's rule applies to the first 80 characters.
- **Lead decision (2026-10-22), after review:** when nothing sits within 40 characters after the location, the old first-80-characters rule still applies, so a finding that names two locations before its severity keeps it (a missing severity always blocks `kit pr`, which is the false block this ticket removes). A P-token in the evidence within 80 characters therefore counts; reviews put the severity first, so this is accepted.
- Headings `Spec defects`, `Standards defects` (with or without colon, bold or `#`) open the Spec / Standards defect groups, like `Defects — Spec` today.
- Nothing else changes: blocking rules, Validation gaps without severity, Optional nits ignored. Kitchen ticket 04 ("record review findings in a clear, structured way", [resolution](../../tickets/04-grill-scoreboard.md#resolution-2026-10-22)) builds on this parser (slice 20).

## Files

- `scripts/agents/review-findings.mjs`
- `tests/review-findings.test.ts`

## Done when

- `tests/review-findings.test.ts` proves: a finding with a 150-character ticket path before `— P2:` reads P2; `(P1)` and `**P3**` read; a P-token only inside the evidence text far after the location does not count as severity; a `Spec defects:` heading with `<sha>:path:line — P1: …` bullets yields Spec P1 findings; every existing case still passes.
- `scripts/agents/kit unit tests/review-findings.test.ts tests/kit-pr.test.ts` and `scripts/agents/kit unit --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Kit only; may run before the clean-up lands and beside 11 and 12.

- Free worker through T3 `delegate_task` (provider OpenCode, model `deepseek-v4.1-flash-free`) in worktree `build/sf-10-review-findings-severity` (`ASE_OWNER=sf-10`); its brief names this ticket, the Files list and `scripts/agents/kit doctor`, `scripts/agents/kit unit …` as above. One attempt plus one correction; then Claude (`--builder claude-opus-5-5`).
- Review: `ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit review --ticket docs/wayfinder/software-factory/build/tickets/10-review-findings-severity.md`; land: `ASE_OWNER=sf-10 scripts/agents/kit pr --ticket <same>`.
- Report: unit `RESULT:` lines, review folder and decisions, PR and merge SHA.

## Done (2026-10-22)

- Severity is now read after a finding's leading location (`<sha>:<path>:<line>` or `<path>:<line>`, line ranges and backticks included) and its separator, within the next 40 characters; `(P1)` and `**P3**` count. When that window holds no P-token, and for findings without a location, the first-80-characters rule applies (lead decision above), so only a P-token past both is ignored. A 150-character ticket path before `— P2:` now reads P2.
- `Spec defects` and `Standards defects` headings (bare, `:`, bold, `#` or bulleted) open the Spec and Standards defect groups, alongside `Defects — Spec` and `Defects — Standards`, but only before the first Validation gaps or Optional nits heading; after it they are plain text (a gap, or an ignored nit). Once one has opened, later bare `Spec:` / `Standards:` lines are text, as under a `Defects` heading; a top-level `Spec:` group written before one still keeps its defects. A `Spec defects` heading only after the notes leaves the review unreadable (blocks).
- Lead finish (2026-10-22): the separator after a location is optional, so `<sha>:<long path>:12 (P1)` and `` `path:12` **P2** `` read their severity; the 80-character fallback keeps the severity of a finding that names two locations.
- Code commits: `69e232f0` (location-aware severity), `75e32d69` (Spec/Standards defects headings; free worker correction round), `93348a5d`, `3aa54e4a`, `eb434572` (lead finish), `66ffc625`, `d8da9353` (review fixes rounds 1 and 2), plus round 3 below.
- Review decisions: round 1, six findings fixed (bulleted `Defects` heading counts again; tests and evidence added). Round 2, five fixed (unbulleted labels in nits or gaps stay text; long-location window and far-off evidence tests). Round 3, four fixed (a `Spec defects` / `Standards defects` heading no longer hides an earlier top-level `Spec:` group; Done section merged into this current statement). None declined; optional nits on the fallback reading the location and on `LOCATION` matching `Round:3` left as is under the lead decision.
- Tests pin: a 150-character path before `— P2:`, `(P1)` and `**P3**`, the 40-character window with a long location, far-off evidence after long and short locations, the no-separator, line:column and Markdown-link locations, and every heading case above.
- Tests (round 3, working tree on `d8da9353`): `ASE_OWNER=lead-sf10 scripts/agents/kit unit tests/review-findings.test.ts tests/kit-pr.test.ts` — `RESULT: ok unit 163/163 (2 files)`; `ASE_OWNER=lead-sf10 scripts/agents/kit unit --affected` — `RESULT: ok unit 163/163 (2 files)`; `npm run lint` — exit 0.

### Follow-ups

- Spec (P2): 253c07ee:docs/wayfinder/software-factory/build/tickets/10-review-findings-severity.md:44 — P2: The "Code commits" line lists `69e232f0`, `75e32d69`, `93348a5d`,
- Spec (P2): 253c07ee:docs/wayfinder/software-factory/build/tickets/10-review-findings-severity.md:47 — P2: The test evidence says it was taken on "working tree on `d8da9353
- Spec (P3): 253c07ee:docs/wayfinder/software-factory/build/tickets/10-review-findings-severity.md:42 — P3: The sentence "Once one has opened, later bare `Spec:` / `Standard
- Standards (P3): 253c07ee:scripts/agents/review-findings.mjs:68 — P3: The comment "Once a 'Spec defects' / 'Standards defects' heading opens, later bare Spec:/Standards: lines a
- Validation gaps (gap): No test pins that a bare `Standards:` line directly after a `Spec defects:` heading still switches the group, for example `Spec defects:\n- a.ts:1 — P1: x\nStan
- Validation gaps (gap): No test covers a non-location prefix that `LOCATION` still strips, such as `Round:3 — evidence … P1` with the P-token past 80 characters. Add one that pins whet
- Validation gaps (gap): No test mixes an explicit `Defects:` heading with a later `Spec defects:` heading (`Defects: none\nSpec defects:\n- a.ts:1 — P1: x\nValidation gaps: none.`). Ad
- Spec (P2): 86e0217f:docs/wayfinder/software-factory/build/tickets/10-review-findings-severity.md:44 — P2: The "Code commits" line names `69e232f0`, `75e32d69`, `93348a5d`,
- Spec (P2): 86e0217f:docs/wayfinder/software-factory/build/tickets/10-review-findings-severity.md:47 — P2: The test evidence says "working tree on `d8da9353`", and that com
- Spec (P3): 86e0217f:scripts/agents/review-findings.mjs:68 — P3: The comment says that once a "Spec defects" / "Standards defects" heading opens, later bare `Spec:` / `Stan
- Spec (P3): 86e0217f:docs/wayfinder/software-factory/build/tickets/10-review-findings-severity.md:51-57 — P3: Every Follow-ups bullet is cut off mid-word, for example "…lin
- Validation gaps (gap): No test pins that a bare `Standards:` line after a `Spec defects:` heading switches the group, which is the code's actual behaviour. Add: `openFindings(review("
- Validation gaps (gap): No test mixes an explicit `Defects:` heading with a later `Spec defects:` heading. Add: `"Defects: none\nSpec defects:\n- a.ts:1 — P1: x\nValidation gaps: none.
- Validation gaps (gap): No test covers a location whose path contains a P-token when the finding has no severity. Today `docs/p3-plan.md:3 — Missing test coverage.` reads P3 through th
- Spec (P2): b1024a4a:scripts/agents/review-findings.mjs:68 — P2: The comment says that once a "Spec defects" / "Standards defects" heading opens, later bare `Spec:` / `Stan
- Spec (P2): b1024a4a:docs/wayfinder/software-factory/build/tickets/10-review-findings-severity.md:42 — P2: The Done statement repeats the same wrong claim ("Once one has op
- Spec (P2): b1024a4a:docs/wayfinder/software-factory/build/tickets/10-review-findings-severity.md:44 — P2: The "Code commits" line lists `69e232f0`, `75e32d69`, `93348a5d`,
- Spec (P2): b1024a4a:docs/wayfinder/software-factory/build/tickets/10-review-findings-severity.md:47 — P2: The test evidence says "working tree on `d8da9353`", which is not
- Spec (P3): b1024a4a:docs/wayfinder/software-factory/build/tickets/10-review-findings-severity.md:45 — P3: "None declined; optional nits on … `LOCATION` matching `Round:3` 
- Validation gaps (gap): No test pins that a bare `Standards:` line inside a `Spec defects` block switches the group, which is what the code does. Add: `openFindings(review("Spec defect
- Validation gaps (gap): No test pins a finding with no severity whose path holds a P-token. With `docs/p3-plan.md:3 — Missing test coverage.`, the 80-character fallback reads `P3` from
- Validation gaps (gap): No test covers a non-location prefix that `LOCATION` still strips, e.g. `Round:3 — ` followed by more than 80 characters of evidence and then `P1`. Add one that

