---
title: Prove typing together on the real stack
type: prototype (HITL)
status: closed
assignee: Lex + claude (prototype)
blocked_by: [08-grill-shared-editing-mechanism]
---

## Question

Lex (2026-10-24), after the [demo](../prototypes/08-typing-together.html): "can we create a poc with the stack you are thinking of?"

Does [ADR 0003](../../../adr/0003-shared-editing-over-a-store-nothing-relay.md) work for real? The proof uses:

- a Cloudflare Worker with a Durable Object relay that uses WebSocket hibernation and only forwards;
- Yjs in two or more real browser tabs, with AES-GCM encryption and the key after `#`;
- other people's carets with name chips in a code pane and in a small rendered preview;
- going offline and catching up;
- an "agent" client (a script) whose whole-element change waits while someone types in that element.

It is a throwaway on a `prototype/am-12-typing-together-poc` branch, run locally (`wrangler dev`), and never merged. Deploying it to a `workers.dev` address on Lex's account waits for his OK. Lex tries it, and the result either confirms the ADR or changes it.

## Comments

- 2026-10-24, builder: branch `prototype/am-12-typing-together-poc` (commit `ae2d7569`); `kit doctor` 7/7.
  - **All five checks pass** (Playwright, `shots/verify-results.txt`). Client 29.7 KB gzipped. Encryption about 6 ms for ~135 messages.
  - **Four additions** are written into ADR 0003's "Proven" section: starting text under a blob-sha client id, a room access check, the 30 s presence timeout, and join traffic growing with the square of the people.
  - **Kit gaps:**
    - `kit deps add` writes the root `package.json` (Yjs went into the folder's own `node_modules`);
    - the guard hook blocks wrapping `port.sh` in `timeout` or a pipe;
    - `kit shots` only knows the editor's screens.
  - **Run locally:** `cd prototypes/typing-together-poc && npm start` in the branch's worktree, then open the two printed links.
  - **Waiting:** Lex trying it, and his OK to deploy it to a throwaway `workers.dev` address.
- 2026-10-25, Lex: deploy to a throwaway `workers.dev` address: yes. "For the poc we don't need to highlight the whole element, just show the cursor and caret where some one else is working." The same holds for people in the editor: a caret and name chip where they work, with no element highlight. Agents keep the section outline from ticket 05.
- 2026-10-25, builder:
  - **Preview shows carets only:** a thin line and name chip, with a tint for a selection, and no element outlines (commit `fc473f01`).
  - **Deployed** as the separate Worker `am-typing-together-poc` at https://am-typing-together-poc.lexvd.workers.dev (commit `cdfffcf0`). The live two-window check passes and the room stores 0 keys.
  - **Delete it** once Lex has tried it: `npx wrangler delete --name am-typing-together-poc`.
- 2026-10-25, Lex tried it remotely: "typing together this feels great". He asked for a caret with a small circle on top, with the name on hover; the first letter by default; an AI agent shows a tiny icon of its model in the circle, "really small" ([his reference](../prototypes/12-caret-circle-reference.png)). He also asked how it works technically with the stack (answered in chat).

## Resolution (2026-10-25)

Proven, and approved by Lex. [ADR 0003](../../../adr/0003-shared-editing-over-a-store-nothing-relay.md) holds, with the four rules added in its Proven section.

**Look of other people and agents while they type**, in the code pane and on the page:
- a thin caret in their colour;
- a small circle on top showing their first letter (an agent's circle shows a tiny icon of its model or program instead: Claude, OpenAI, Gemini and so on);
- the full name on hover;
- a light tint for their selection;
- no element highlight.

The section outline for agents (ticket 05) stays. The throwaway Worker `am-typing-together-poc` (also serving `/mockups/`) is deleted when the map hands off: `npx wrangler delete --name am-typing-together-poc`.
