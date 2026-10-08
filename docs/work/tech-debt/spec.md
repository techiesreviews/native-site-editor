# Tech debt (recorded 2026-10-08)

Debt known at the end of the Phase 5 build day (lean-fast-editor), on dev
`ccfdce3`, preview `1d8c1a1f`. One ticket per item in `issues/`. Sources:
the Phase 5 handoff ([p5-continue-handoff.md](../../wayfinder/lean-fast-editor/build/p5-continue-handoff.md)),
the slice tickets `p5-16` to `p5-22`, the review results in the root
`.scratch/p5-review/`, and the planner's main.ts inventory
(root `.scratch/p5-plan/next-plan.md`).

| # | Item | Status |
| --- | --- | --- |
| 01 | main.ts is 6,220 lines; ticket 08 wanted about 500 | needs-triage |
| 02 | Byte budget headroom: 351 of 355 KB | needs-triage |
| 03 | 11 failing tests in the actual-starter group | ready-for-agent |
| 04 | A test server on 5216 died mid-suite, cause unknown | needs-info |
| 05 | CI deploy-preview has no Cloudflare token | ready-for-human |
| 06 | Boot memory known limits | needs-triage |
| 07 | Unit-test gaps in the Phase 5 controllers | ready-for-agent |
| 08 | Controller API tidy-ups from the reviews | ready-for-agent |
| 09 | Three flaky browser specs | ready-for-agent |
| 10 | Known limits of the preview preload and the Page Structure editor | needs-triage |

Process notes (not code debt):

- Sol (`codex exec -s workspace-write`) cannot commit: git metadata stays
  read-only, so the lead commits Sol's work.
- Merged worktrees `native-site-editor-p5-*` stay on disk until Lex says done.
