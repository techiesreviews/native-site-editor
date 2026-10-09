---
title: "Starter: variants on its components"
type: task (AFK)
status: open
assignee:
blocked_by: []
builder: sol
phase: 2
---

## What

Repository: `~/Projects/native-site-editor-starter` (see the [spec](../spec.md) flow for starter slices and open point 1).

Show the variant contract ([07](../../tickets/07-variant-contract.md) §1, §6) on the starter's own components, with the suggested names:

- `data-layout` (`content-left`, `image-left`, `centered`) where a component has a layout to switch (for example `section-split`, `section-hero`), written `:host([data-layout="…"])` in the component's CSS; the absent attribute keeps today's look.
- A yes/no variant somewhere it makes sense (`:host([data-x])`).
- No `data-tone` yet (phase 7) and no annotation comments.

## Done when

- Each variant renders as intended when set by hand in a page; the default look is unchanged.
- One commit in the starter repo; screenshots of each variant.
