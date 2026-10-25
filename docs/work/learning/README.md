# Chat learning

One file per learning Monday, `YYYY-MM-DD.md`, written by the scheduled session that follows
[routines/learning.md](../../agents/routines/learning.md) every other Monday. Each file lists the
corrections Lex gave more than once in the last two weeks, ranked by count, each with its evidence,
whether a rule or guardrail already covers it, and one proposed action: a hook, lint rule or kit check,
or a UX rulebook line with its wording.

A learning file adds nothing by itself. Lex picks; his picked checks become tickets and his picked
rulebook lines are added to [ux-rulebook.md](../../agents/ux-rulebook.md) after his yes. The file is not
edited afterwards. The groups behind each list come from `scripts/agents/kit learn`
([agent-scripts.md](../../agents/agent-scripts.md#kit)), which reads the chat project's corrections list
and this repo's build feedback logs.
