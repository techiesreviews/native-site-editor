---
title: kit doctor --fix links node_modules in a fresh worktree
status: needs-triage
assignee:
blocked_by: []
---

# kit doctor --fix links node_modules in a fresh worktree

## What

Retro 2026-10-26, item 6. In the planning worktree, `kit doctor` failed on missing `node_modules` until a helper linked the shared one by hand, as doctor's message suggests. Every helper in a fresh docs-only worktree pays that step again.

## Proposal

`kit doctor --fix` (or the worktree setup step) links the main checkout's `node_modules` when the lockfiles match, and says so in its output.
