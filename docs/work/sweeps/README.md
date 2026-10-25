# Weekly sweeps

One file per Monday sweep, `YYYY-MM-DD.md`, written by the scheduled session that follows
[routines/sweep.md](../../agents/routines/sweep.md). Each file is the full list of bad patterns the
sweep found that week, ranked, each item with its evidence and one recommended fix; the top 3 are
marked and are what Lex was asked about.

A sweep changes nothing else. The items Lex picks become tickets elsewhere (usually
[tech-debt](../tech-debt/issues/)); the sweep file is not edited afterwards. The numbers behind each list
come from `scripts/agents/kit sweep` ([agent-scripts.md](../../agents/agent-scripts.md#kit)).
