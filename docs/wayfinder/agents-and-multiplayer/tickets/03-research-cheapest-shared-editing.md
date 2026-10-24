---
title: Find the cheapest way to edit the same page live together
type: research (AFK)
status: closed
assignee: claude (research subagent)
blocked_by: []
---

## Question

Lex (2026-10-24): real multiplayer "the cheapest possible option"; internal use first; self-hosters set it up themselves so they pay. What is the cheapest sound way for Lex, agents and people to type in the same paragraph of a site's HTML and CSS at once?

- **Merging edits:** shared-editing libraries (Yjs, Automerge, Loro, others current in 2026): size in the browser, text versus element-tree editing, how they map onto our files and drafts (`src/draft-store.ts`, `src/native-site-runtime.ts`) and the editing preview (`src/components/native-preview-runtime.js`), and how an agent's edit (a whole replacement from MCP) merges with live typing.
- **Carrying edits:** peer-to-peer between browsers (WebRTC, with only a tiny meeting point on the server), a Cloudflare Durable Object per page with WebSocket hibernation, or another relay. Durable Objects are now possible on the free plan; give real numbers: what an hour of two people and three agents on one page costs on the free plan and on Workers Paid, and what happens when a free limit is hit.
- **Our current rules:** the Durable Object reduction (`docs/wayfinder/durable-object-reduction/`) and "drafts are never mirrored in Durable Objects" (CONTEXT.md, Agent connection): which option keeps them, which needs them changed.
- **Joining without an account:** what a "synced session" link needs from each option (Excalidraw, tldraw and Figma links as references; end-to-end encryption in the link).

Give two or three ranked options with cost, effort and what a self-hoster must set up.

## Resolution (2026-10-24)

Findings: `docs/wayfinder/agents-and-multiplayer/research/03-cheapest-shared-editing.md` on branch `research/am-03-cheapest-shared-editing` (commit `dc7bf0b0`, never merged).

1. **Recommended: Yjs plus a relay in the agent Durable Object we already run.** The relay forwards encrypted edits between browsers and stores nothing.
   - Adds about 30 KB to the browser download (measured).
   - Self-hosters set up nothing new.
   - Keeps "never mirror drafts in Durable Objects"; one CONTEXT.md sentence needs clarifying.
   - Guest links carry their key after `#`, as Excalidraw does.
   - Limit: someone who has the page must be online for others to join.
2. **Server copy of the page (`y-partyserver`).** Joining works with the host away, but it breaks the drafts rule (Lex decides, with an ADR) and an encrypted link is impossible.
3. **WebRTC browser to browser.** Just as cheap, but harder and less reliable: the main library was last published in 2023, and strict networks need a separate relay service.

**Cost of one hour of two people and three agents typing nonstop:** about 3,000 Durable Object requests and at most 450 GB-s.
- Free plan: about 3% of the daily allowance, so roughly 28 such hours a day.
- Workers Paid: the $5 base covers about 330 such hours a month; the first step over costs $12.50.
- Agents already keep the object awake, so shared editing adds almost no compute.
- Free limits are per account; when one is hit, live sessions and agent connections both stop until midnight UTC, and drafts are kept.
- Open fact: the account logged 95,517 requests on 2026-10-15 (free limit 100,000 a day), and whether it is on Free or Paid is unknown.

**Merging:** plain source text, which fits drafts; element-tree merging would lose the source's own formatting.
- Preview typing reaches the source only on click-away today and would need to be sent live.
- While someone types inside an element, agent replacements and structure changes to it wait until they click away (slice 52's rule).
