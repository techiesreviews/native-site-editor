# Runner extras: <build>

Copy to `docs/wayfinder/<build>/runner-extras.md` and keep only the lines this build needs.
Read with [runner.md](../../agents/runner.md). Where they differ, this file wins
for this build only. The lead's notes live in [lead-log.md](lead-log.md).

- **Base.** Branch from `origin/<base>`; land into `<base>` with
  `scripts/agents/kit pr --ticket <ticket>` (or say why a slice cannot).
- **Builder.** Select the model for `kit slice --ticket <ticket> --builder <model>`
  (default path under `kit bg`, then `kit wait job`); name any exception requiring
  the manual fallback in runner.md.
- **Review.** Which slices get a second opinion beyond the Claude review, per the pins in
  [kitchen.md](../../agents/kitchen.md#who-cooks-pins-from-2026-10-22).
- **Out of bounds.** Files, folders or services no runner may touch in this build
  (beyond runner.md's rules: no subagents, no preview deploys, never `main`).
- **Screenshots.** Which screens to shoot (`kit shots <screen…>`) and whether to
  compare with `--compare dev`.
- **Report.** Anything the lead wants in the seven-line report beyond runner.md.
