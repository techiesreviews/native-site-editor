# ADR 0003: Shared editing merges text in the browsers, over a relay that stores nothing

- Status: proposed 2026-10-24 with Lex's decisions; accepted when the [agents and multiplayer map](../wayfinder/agents-and-multiplayer/map.md) hands off its build.
- Decides: how Lex, agents, GitHub collaborators and synced-session guests type in the same page at once, and how outside changes and hot preview links reach open tabs.
- Keeps: drafts, context, commands and conversations are never stored in Durable Objects (CONTEXT.md, Agent connection; the Durable Object reduction map).

## Context

Lex wants real multiplayer at "the cheapest possible option", for internal use first, with self-hosters paying their own costs ([agents and multiplayer map](../wayfinder/agents-and-multiplayer/map.md)). Drafts live in each browser. The Worker already runs one agent relay Durable Object per workspace (`worker/agent-relay.ts`) that carries live sockets and stores no drafts. [Research 03](../wayfinder/agents-and-multiplayer/tickets/03-research-cheapest-shared-editing.md#resolution-2026-10-24) compared three options:

- a library merging edits in the browsers, over the existing relay;
- a server copy of each page (`y-partyserver`);
- browser-to-browser WebRTC.

## Decision (Lex, 2026-10-24)

1. **Yjs merges the site's source text in each browser** (about 30 KB). Merging is on plain source text, never on the element tree, so each file keeps its own formatting.
2. **Edits travel encrypted through the existing agent relay Durable Object, which forwards them and stores nothing.**
   - Someone who has the page open must be online for others to join.
   - A synced-session link carries its key after `#`, so the server cannot read the edits.
3. **Typing in the preview is sent letter by letter.** Today it reaches the source on click-away. An agent's change that replaces the element someone is typing in still waits until they click away (clean-up slice 52).
4. **Agents join the same merge in stage 2.** Until then an agent's change targets the exact words or section it changes, and only a true clash is refused.
5. **One relay for everything live:**
   - shared editing;
   - agent presence;
   - hot preview links;
   - "branch now at commit X" from a GitHub push webhook, after which each tab fetches files with its own sign-in.
6. **Saving shared changes:** whoever presses Save to GitHub saves everyone's changes in those files, and the commit names every author.

## Consequences

- No new service and no new storage. Self-hosters set up nothing new beyond the GitHub App webhook.
- A busy hour (two people, three agents) is about 3% of Cloudflare's free daily allowance. The allowance is shared with the editor, and hitting it stops live sessions and agents until midnight UTC.
- Joining needs someone online who has the page. A server copy (rejected) would have lifted this, but it would store drafts and make encrypted links impossible.
- Undo and history with several editors, and the self-host setup details, are still open on the map.
