# Read-only Claude review brief

Run after 2026-10-07 13:00 Europe/Amsterdam. Use `claude-opus-5-5` at medium
effort, without model fallback. This continues thread
`7d475731-adb3-4c9c-9930-edfb1997bdad` and Wayfinder tickets 08, 06, 12 and 15.
Do not modify files, run tests, launch other agents, merge, push or deploy. Use
read tools and Git diff/show/status/rev-parse/log only. Return findings to this
session; do not post messages, comments or tickets externally.

Read `p5-review-handoff.md`, `p5-second-batch-handoff.md`, `p5-controller-plan.md`
and the relevant Wayfinder tickets. Verify the immutable heads and read the
exact evidence in those handoffs; a pending or failed run is not a pass.

Review the first batch at `963f569..47ea169` and its independent slice ranges
in the first handoff. Then review each continuation slice:

```bash
git diff 49061eb..ac19da3 -- src tests
git diff ac19da3..f625d10 -- src tests
git diff f625d10..c5af463 -- src tests
git diff c5af463..d0983ba -- src tests
git diff d0983ba..de8c74d -- src tests
git diff f625d10..aa0cca2 -- src worker tests
git diff 4cd6951..aa9ad84 -- src tests
git diff aa9ad84..1fba778 -- src tests
git diff 1fba778..77dcdfd -- src tests
git diff 1fba778..cf9883f -- src tests
git diff ac19da3..165645d -- src/components/page-structure.css
git diff 963f569..bf5dec1 -- src shared worker vite-monaco-trim.ts vite.config.ts
```

The `1fba778` range includes the palette revision fix as `05b90b7`; assess it
separately rather than treating it as a Pages policy change. The final candidate
is `bf5dec1f87bcd590358c72537823409bbab8c76a`, located in
`/home/ubulex/Projects/native-site-editor-p5-review-candidate-two`. The isolated
slice worktrees and notes are listed in the handoffs.

Check async ownership after every await, disposed UI/timer/observer behavior,
account/repository/branch/generation/source guards, lazy imports, and a single
draft/history source of truth. Focus on the captured edit-bar revision contract,
the legitimate site rebuild after Rename, index hydration before move-picker
proofs, and forwarding the full expected-source/current proof into existing
atomic transactions. Media must preserve binary staging, master-session proof,
source receipts and one Undo step. Boot must adopt only the original session
response and matching opaque server tag, refuse late generation/source changes,
preserve installation-return refresh and settle signed-out speculation safely.
The tag must never authenticate a request or expose a raw session/token.

For Monaco, assess required service registrations, TypeScript/JavaScript
intelligence, default features, keyboard commands, context menu, comparison and
read-only History. Optional UI and Monaco must stay off the first-paint path.
Keep development-only source-import tests separate from production chunk proof.

For the requested compact indentation, compare the user screenshot
`/home/ubulex/.t3/userdata/attachments/671e8a4c-d09d-4794-9d99-bd9481f3709a-10733717-d10b-46c7-9257-f2593295763f.png`
with local demo evidence
`/home/ubulex/.t3/userdata/browser-artifacts/browser-screenshot-localhost-muxxq21n-49d0f967.png`.
Rows, drop markers and inline/shared controls should use 4 px per level and
retain usable controls. This is local demo proof, not a deployed release.

Return blocking findings first, with file/line and a concrete failing scenario,
then nonblocking findings and a per-slice recommendation. State the reviewed
scope and evidence assessed. Do not claim that main's remaining 8,410 lines meet
the roughly 500-line target, that local 1.0/0.4 s timing targets passed, or that
Claude reviewed/approved any prior batch. The caller must check CLI exit status,
errors/permission denials and JSON `modelUsage` for the exact pinned model before
recording the review as complete.
