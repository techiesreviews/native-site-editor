---
title: Decide what agents are told about making components
type: grilling (HITL)
status: open
assignee: Lex + claude (grilling)
blocked_by: [03-default-editables, 07-variant-contract]
---

## Question

Agents must make components the same way the editor does. Today the rules are spread across `worker/site-conventions.ts` (the `native-site://conventions` resource, :41-68), MCP tool descriptions (`worker/mcp.ts` `write_file` :477, `add_section` :697), each site's `AGENTS.md`/`CLAUDE.md`, and `src/agent-prompts.ts`, and they already disagree on slot placement. Which one is the source of truth, and how are the others kept in step with it (generated, linked, or checked by a test)? What must the guide cover: file layout, whole-element slots, the default editables rule, variants, Add card grids? Do agents also need a tool that makes a component, or does `write_file` plus the guide suffice?
