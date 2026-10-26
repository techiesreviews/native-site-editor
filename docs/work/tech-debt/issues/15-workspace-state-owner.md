---
title: The workspace host files share one state owner instead of 50-odd ports
status: ready-for-agent
assignee:
blocked_by: [14-file-size-limit]
---

# The workspace host files share one state owner instead of 50-odd ports

## What

Sweep 2026-10-26, item 1. Splitting `main.ts` (-5119 lines) made six files that still share all of its
state: `PageBuilderHostPorts` has about 45 members (`src/page-builder-host.ts:59-105`), the
pages-and-files ports about 65 (`src/pages-and-files-host.ts:68-139`), several of them other hosts' outputs.
`fileGeneration` reaches six hosts as a get/set pair (`src/main.ts:236, 376, 389, 450, 470`);
`nativePreview`, `pageStructure` and `componentTools` are set from inside the mount
(`src/workspace-mount.ts:428, 494, 561, 583`). `page-builder-host.ts:46-51` imports types from three other
hosts that take its outputs back, a cycle the getters hide. Tests pin the plumbing ("…through its
setters", `tests/workspace-mount.test.ts:261, 331, 353`). Inlining any host just moves its code back
(deletion test). `site-loading.ts` and `setup-host.ts` import none of the others and are the exception.

## Fix

Use the `codebase-design` vocabulary. Give the open workspace's shared state one owner module (one or
two objects with clear owners for `fileGeneration`, the preview, page structure and component tools);
hosts depend on it and stop importing each other. Startup order becomes explicit in that module.
Rewrite the setter tests to test behaviour through the owner's interface. Every touched file stays under
the line limit of ticket 14.

## Done when

- No host port list has more than 15 members; no get/set pair passes through ports.
- The cross-host import check from ticket 14 passes with no exceptions.
- `npm run check`, `npm test`, `npm run lint` and the native-save specs pass.
