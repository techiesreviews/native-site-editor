# Poteto's "cooking" method, compared with ours (2026-10-22)

Source: "LIVE: Poteto (creator of pstack) on shipping 1,000's of PR's a month at SpaceX", Matt Pocock's channel, 2026-10-03 (https://www.youtube.com/live/MN9dGgmLyso), full transcript read by a research subagent; pstack README (https://github.com/cursor/plugins/tree/main/pstack). Times are approximate (captions had no timestamps).

## Ideas

1. Trust ladder (~3 min): supervise less only as trust grows.
2. "Cooking" = a Michelin kitchen (~12 min): the human is head chef, agents are line cooks, the harness (skills, tools, rules, the codebase) is the knives; more projects = more restaurants. She dislikes "factory" (implies low quality).
3. Verification is the top skill (~17 min): give agents hands and eyes to run the app; one verification skill per app, maintained by agents.
4. Push the deterministic into scripts (~22 min): agents keep only judgment; otherwise "every agent rebuilds the world".
5. Make the wrong thing impossible (~28–32 min): strict lint, one place per concern; every repeated agent mistake asks "how does this become a lint rule?"
6. Outer and inner loop (~36–45 min): bots watch channels and bug reports; a chief-of-staff agent bundles related reports and hands them to subagents.
7. Gardening (~46–49 min): routines detect bad patterns and only write a list; a human reads it every few days for the pattern.
8. Sample, don't block (~50 min): taste a sample, fix the kitchen rather than the dish.
9. Dark factory (~52 min): agents merge overnight after heavy testing, reviewed in the morning; only where mistakes can be checked and undone (~56 min).
10. Mine past chats (~60 min) for corrections and turn them into skills or lint rules.

## Side by side

| Idea | Us | Where |
|---|---|---|
| Scripts for fixed steps | Have | Agent Kit, `docs/agents/agent-scripts.md` |
| Mistakes become rules | Have | `docs/agents/guardrails.md` |
| Intent pinned down first | Have | Wayfinder grilling tickets |
| Fix the setup before features | Have | sturdy-base, clean-up-before-features |
| Trust ladder | Partly | `kit pr` merges into dev after Sol review; Lex approves production |
| Verification (hands and eyes) | Partly | `kit shots`, `kit specs --affected`; no user-like verification skill with a feature list |
| Chief of staff | Partly | the lead, `kit status` |
| Sampling | Partly | Sol reviews every change; Lex checks once per build |
| Gardening | Partly | tech-debt notes by hand; no routine sweep |
| Mining past chats | Partly | one-off retros (2026-10-10, 2026-10-12) |
| Outer loop | Missing | |
| Dark factory | Missing, on purpose | |

## Does not fit

Overnight auto-release to production (Lex sees everything before release; published sites cannot always be undone); outer-loop bots (Lex is the only user); ten verifier agents per change (cost; five-agent cap); installing pstack as is (its orchestrator spawns its own subagents and picks models, against our runner and routing rules); formal-proof tools.
