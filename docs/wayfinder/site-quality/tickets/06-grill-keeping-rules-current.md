---
title: Decide how the rules stay up to date
type: grilling (HITL)
status: closed
assignee: Lex + claude (grilling)
blocked_by: [01-research-spec-for-native-sites]
---

## Question

Lex: "we need to keep the specs up to date". Decide how changes in specification.website (its GitHub repo), Lighthouse versions, Google Search Central and AI-search docs reach the editor's rules. Options:

- a scheduled research agent (T3 `schedule_task`, monthly) that compares and proposes changes to Lex;
- following the spec's repo releases;
- running the spec's MCP audit tool against the starter.

What does Lex see, and what changes without him?

## Resolution (2026-10-26)

Lex: yes, as recommended.

- **A monthly check:** a T3 `schedule_task` research agent runs on the first Monday of each month. It compares what changed since the last run in:
  - specification.website (its GitHub repo);
  - Lighthouse releases;
  - Google Search Central, and the crawler docs of OpenAI, Anthropic, Perplexity and Bing.

  Where a vendor's own page and the spec's table disagree, the vendor's page wins.
- **What Lex sees:** a short list, one line per change with a recommendation. Nothing in the editor's rules changes without his OK. An approved change becomes a normal ticket and build slice.
- **Where it lands:** a T3 thread for Lex, not the in-editor inbox. These are changes to the editor itself, not to one site (see ticket 05 for the inbox).
- **Kept current by the check:** the Lighthouse version pinned in `kit lighthouse`, the list of AI crawlers in `robots.txt`, and the automatic fixes list.
