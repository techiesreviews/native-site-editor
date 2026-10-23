---
title: "Invisible multiplayer: agent and Media work finishes in a background page"
type: task (AFK)
status: open
assignee: lead-27 (this session)
builder: claude
blocked_by: [23-work-finishes-where-it-started]
---

## Goal

Split from [Work finishes where it started](23-work-finishes-where-it-started.md) by Lex on 2026-10-23. Slice 23 makes saves, uploads, agent text edits and most Media work finish on the site, branch and page they started on. These still stop with "open it again" across a switch of site, branch or page:

1. agent page and file commands (create_page, set_page_details, make_component, add, move or remove a section, move_file, delete_file);
2. agent Media commands (`agent-tools-media.ts`, `listMedia`/`media` in `src/main.ts`);
3. placing a picture on a page without a pin (picker Use, image popup, place, trim, frame), and Media pane edits started on a stale screen;
4. a pinned Media batch whose workspace switches back and forth during each of its three attempts.

## Decided behaviour

Lex (2026-10-22 and 2026-10-23): **nothing stops when Lex navigates away; he never needs to be on the page.** He calls this **"invisible multiplayer"**: the agent (or a running Media job) keeps working on its own site and page as a second, invisible user while Lex works somewhere else.

- Work that can finish on the files finishes there. Work that needs the page drawn (a drop place, a section move, a placement, a measurement) runs in an **invisible background copy of that page** (a hidden preview frame of the site, branch and page the work belongs to), held only until the work is done, then closed.
- Results land as unsaved changes on their own site, branch and page, never on what is shown; the finished-work notification icon (slice 24, the agent-question style count on the repository menu tile) and the toast say where.
- Undo for such a change belongs to its own page (opening that page offers it), never to the page shown.
- At most one background page per site, branch and page at a time; it closes when idle; a hard limit on how many exist at once protects memory.
- Build it so the **later real multiplayer feature** (Lex and an agent typing in the same paragraph at once, its own build after the clean-up and the atomic catalogue) can reuse the background page and the per-page ownership, rather than replace them.

## Files

Expected (confirm while designing): a new `src/background-page.ts` (the hidden frame host, built on the preview link from sturdy-base, `src/components/preview-link.ts`), `src/agent-site.ts`, `src/agent-tools-edit.ts`, `src/agent-tools-media.ts`, `src/controllers/media-actions.ts`, `src/controllers/media-controller.ts`, `src/page-builder/media-workspace.ts`, `src/media-batch.ts`, `src/main.ts` (wiring only; set the ceiling per the README), and tests: unit tests for the background page lifecycle and a browser spec `tests/native-save/native-invisible-multiplayer.spec.ts`.

## Done when

- Each of the four cases above has a browser spec that starts the work, switches site, branch or page, and shows the result landing on its own page as an unsaved change, with nothing on the page shown and the notification icon set.
- No "open it again" / "Close Media and open it again" / "The editor changed branch or revision" refusal is left for these cases (`grep` in Done).
- Background pages close when their work is done (test), and the memory limit holds (test).
- `kit unit --affected`, `kit specs --affected`, `npm run check` green; `kit size` within budget.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Big, delicate slice: Claude builds (`--builder claude-opus-5-5`, `ASE_AGENT_TIMEOUT=150m`), Claude reviews, and one Grok second opinion on the final version (`ASE_REVIEW_MODEL=grok-4.7 kit review --ticket <this ticket>`). Counts as one of the two `src/main.ts` slots.
