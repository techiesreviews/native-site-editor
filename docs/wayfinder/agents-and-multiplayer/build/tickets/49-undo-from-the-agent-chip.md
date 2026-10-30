---
title: "Undo an agent's change from its chip when it worked without a pin (follow-up on 15)"
type: task (AFK)
status: open
assignee: am-49
builder: claude
blocked_by: [15-agent-tools-ask-and-undo]
---

## Goal

Lex undoes an agent's change with one click even when no pin asked for it ([ticket 13, item 2](../../tickets/13-grill-undo-with-several-editors.md#resolution-2026-10-25)). Slice 15 built the pin card's Undo and the agent's own `discard_change`; the chip was left out.

## Decided behaviour

- The name chip on an agent's presence outline (`src/agent-presence.ts`) offers Undo for the agent's last change there while it shows, the same undo as the pin card's (`undoAgentChanges`, `src/agent-changes.ts`): one step of its own, refused in place when a file changed since.
- Undone, the chip says so on the control; the editor's Undo of that undo offers it again (state read from the drafts, as the pin card does).
- No toast or explainer.

## Files

Expected (confirm while designing): `src/agent-presence.ts`, `src/components/native-preview.ts`, `src/components/native-preview-runtime.js`, `src/agent-site-host.ts`, `src/agent-changes.ts`; tests and a spec.

## Done when

- A spec: an agent changes a section without a pin, Lex undoes it from its chip, and the page is back as before.
- The chip's Undo is refused in place when Lex typed in that section since.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`). `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done; `kit shots` of the chip, light and dark, 390 and 1280 wide, with a UX review against the [UX rulebook](../../../../agents/ux-rulebook.md).
