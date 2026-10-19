# Lead log: kit-economy build (2026-10-19)

## Landed

| Ticket | PR | Built with |
| --- | --- | --- |
| tickets and map | #86 | — |
| 01 kit pr stops on findings | #87 | runner + `agent.sh` (old flow) |
| 02 kit bg / kit wait job | #88 | runner + `agent.sh` (old flow) |
| 03 kit fix | #89 | runner + `agent.sh` (old flow) |
| 04 kit slice | #91 | runner + `kit bg`/`kit fix` |
| 05 kit specs digest | #94 | `kit slice` (+ one lead-run fix round) |
| 06 kit shots contact sheet | #92 | `kit slice` |
| 07 kit unit --affected, flaky tests | #93 | `kit slice` |
| 08 kit preview timeout | #95 | `kit slice` |
| 09 kit tests leave no trace | #97 | `kit slice` |
| 10 agent-metadata flake (added) | #96, #99 | `kit slice` |
| 11 review reuse, kit fix fallback (added) | #100 | `kit slice` |
| 12 slice brief, clean-guard step, CI digest (added) | #101 | `kit slice` |
| kit-preview test ESRCH (lead) | #98 | lead |

The two hung `kit preview` wrangler deploys (pids 3167057, 3167195) were killed at the start.

## Measurement

Same counting as the retro, over each runner subagent's session log: steps = assistant replies
(unique message ids); waits = Bash calls containing `kit wait`; peak context = largest
input + cache read + cache write of one reply; cached = `cache_read_input_tokens` summed per log
line (this reproduces the retro's 570M: 574M over its 33 runners; summing once per reply gives 344M,
shown second). Only the Claude runners are counted; Sol builder and review usage (Codex) is not.

| Runner | Steps | Waits | Peak context | Cached (retro / unique) |
| --- | --- | --- | --- | --- |
| Before: DO build, small tickets 01, 04, 05, 22, 23, 24 | 37–57 | 5–9 | 97–113K | 4.0–6.9M / 2.4–4.5M |
| Before: DO build, all 33 runners | 2,810 total | 470 total | up to 341K | 574M / 344M total |
| Old flow here: tickets 01–04 (4 runners) | 34–44 | 2–20 | 61–85K | 2.3–4.1M / 1.5–2.4M |
| `kit slice`: tickets 05–12 (8 runners) | 10–46 (188 total) | 3–13 (51 total) | 39–60K | 0.4–3.6M / 0.3–1.8M (11M / 6M total) |
| `kit slice`, small ticket 08 | 10 | 3 | 39K | 0.4M / 0.3M |

Ticket 08 (preview timeout) is the measured small ticket: 10 steps, 3 wait check-ins, 39K peak,
0.4M cached, against 37–57 steps, 5–9 waits, 97–113K and 4.0–6.9M for the small tickets of the
Durable Object build. The tickets differ (kit scripts versus app code), so this compares like-sized
tickets, not the same ticket twice. Ticket 05 is the outlier among the `kit slice` runners: four
fix rounds, then a re-review after a rebase raised a new finding (fixed by ticket 11).

## Dogfood

- Helped: `kit bg` + `kit wait job` (no pid lookups, short tails), `kit slice` (one job per ticket,
  resumes after a fix), `kit pr` stopping on findings (ticket 05 left open instead of merging),
  `kit shots` sheet first (one look), `kit unit --affected`.
- Failed, then fixed in this build: `kit fix` lost its builder after worktree removal and took only
  review findings (11); `kit pr` re-reviewed after base-only rebases and found new nits (11); the
  slice builder ran landing commands itself (12); the clean guard doubled the unit load (12); CI
  failures showed only a log tail (12); a /proc race in the kit-preview test (#98).
- Still open: subagent runners cannot sleep on a background job, so a long job costs one check-in
  per 9 minutes (`kit wait job --timeout 9m`); merges that conflict on `agent-scripts.md` are found
  only after CI; `kit slice` cannot take a lead note (runners added notes to the ticket instead).
