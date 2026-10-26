# Build: agents and multiplayer

Lex's first build after the clean-up (order of 2026-10-23): several agents and subagents working at once while he works, asking them with pins, typing together with agents and people, and files that are always the latest version. Every decision comes from the [map](../map.md)'s closed tickets and [ADR 0003](../../../adr/0003-shared-editing-over-a-store-nothing-relay.md); this build does not reopen them.

Research is on branches that are never merged (`git show origin/<branch>:<path>`):

- `research/am-01-agents-on-own-subscriptions`
- `research/am-02-what-an-mcp-can-do`
- `research/am-03-cheapest-shared-editing`
- `research/am-04-always-the-latest`

The proof of concept is on `prototype/am-12-typing-together-poc`. Approved mock-ups are in [../prototypes/](../prototypes/).

Tickets live in [tickets/](tickets/), one slice each, numbered by stage: 10s stage 1, 20s stage 2, 30s stage 3. Find takeable slices with `node scripts/agents/tickets.mjs frontier agents-and-multiplayer`.

## Gate

**Nothing here starts before the clean-up build ([clean-up-before-features](../../clean-up-before-features/build/README.md)) is released to production, and the kitchen-everywhere slices 10–24 ([its build](../../kitchen-everywhere/build/README.md)) have landed on `dev` (Lex, 2026-10-26: kit changes first).** These slices build on its agent command path (slices 50–53), presence (33), background pages (27, 34), the MCP menu (29) and the site runtime (31). The lead checks that `kit status` shows the clean-up released before claiming slice 10.

## Three stages, each shipped on its own

1. **Stage 1: several agents at once, and asking them** (slices 10–17). Lex's end check, then release.
2. **Stage 2: typing together** (slices 20–26). Starts after stage 1 is released; Lex's end check, then release.
3. **Stage 3: people and outside changes** (slices 30–36). Starts after stage 2 is released; Lex's end check, then release.

The `blocked_by` lines hold the stage gates: 20 waits for the last stage-1 slices, and 30 and 32 wait for the last stage-2 slices. The lead does not claim a stage's first slice before the stage before it is released. Each stage follows the kitchen's stations 6–12 ([kitchen.md](../../../agents/kitchen.md)).

## Rules for the whole build

- **Agent Kit is required** for every slice, every model: `scripts/agents/kit` ([agent-scripts.md](../../../agents/agent-scripts.md#kit), [runner.md](../../../agents/runner.md)).
  - Run `kit doctor` first, then `kit slice` under `kit bg`.
  - While building: `kit unit --affected`, `kit specs --affected` and `npm run check`.
  - `kit size` whenever boot code moves; `kit shots` for anything visible.
  - `kit review` for the code review, then `kit pr` into `dev`.
  - A builder that cannot run a kit command says so in `decide`; it never skips one silently.
- **Builders and reviewers** follow the pins in [kitchen.md](../../../agents/kitchen.md#who-cooks-pins-from-2026-10-22):
  - Claude Opus 5.5 builds every slice (`--builder claude-opus-5-5`, high).
  - A fresh Claude Opus 5.5 session reviews every slice (medium).
  - The big, delicate slices get one second opinion on their final version: 10, 16, 21, 23, 25 and 30. Use `grok-4.7` or `gpt-6.1-sol` within the weekly budget.
- **Visible slices** (marked *visible*) link their approved mock-up and follow the [UX rulebook](../../../agents/ux-rulebook.md).
  - They run `kit shots` (light and dark, 390 and 1280 wide), and the lead shows the contact sheet to Lex.
  - The Opus UX review reads the sheet.
  - No toasts and no explainer text (S1): feedback sits on the control or element.
  - The Pages dots and Page Structure dots were decided by Lex (ticket 05), an exception to S2's "no dots on buttons", which covers buttons and tabs only.
- **`src/main.ts`** is about 530 lines of wiring after the clean-up. A slice adds only wiring there, keeps `tests/main-ts-ceiling.test.ts` green, and at most two slices edit it at once. Slices marked *main.ts* may need a few wiring lines.
- **Byte budget:** boot stays within the clean-up's budget (`tests/perf/byte-budget.ts`; 362 KB, or 355 KB once tech-debt 12 lands).
  - Yjs, `y-monaco` and the live-editing code load only when a live room opens (a second participant or an agent joins), never at boot.
  - New packages go in through `kit deps add`, with the reason in the PR.
- **Docs move with the code:** `docs/agents/code-map.md` for moved or new modules (`tests/code-map.test.ts`), `CONTEXT.md` for new terms (Synced session is already there; add Live room, Preview link and Helper as they land), and `docs/mcp.md` for tool changes.
- **Runner extras:** owner `ASE_OWNER=am-NN`; branch `build/am-NN-<slug>` from `origin/dev`. No preview deploys by builders (the lead runs `kit preview`). Never `main`.

## Stage 1: several agents at once, and asking them

| Slice | Size | Visible | main.ts | Blocked by |
| --- | --- | --- | --- | --- |
| [10 Agent changes target the exact part they change](tickets/10-exact-part-edits.md) | M | – | – | – |
| [11 Several agents: names, colours and presence](tickets/11-several-agents-presence.md) | M | visible | – | – |
| [12 MCP menu: agents working now, Stop, and Pins go to](tickets/12-mcp-menu-agents.md) | S–M | visible | – | 11 |
| [13 A pin is a conversation](tickets/13-pin-conversation.md) | M | visible | – | 11 |
| [14 Agent tools: page picture, I'm working here, next steps, shorter instructions](tickets/14-agent-tools-see-and-say.md) | M | – | – | 11 |
| [15 Agent tools: ask first, undo its own change](tickets/15-agent-tools-ask-and-undo.md) | M | visible | – | 10, 13 |
| [16 The helper: any agent picks up pins](tickets/16-helper-any-agent.md) | L | – | – | 12, 13 |
| [17 Claude Code waits as a long job](tickets/17-long-job-wait.md) | S–M | – | – | 14 |

## Stage 2: typing together

| Slice | Size | Visible | main.ts | Blocked by |
| --- | --- | --- | --- | --- |
| [20 Live rooms in the relay: locked, store nothing](tickets/20-live-rooms-relay.md) | M | – | – | 15, 16, 17 |
| [21 Each open file has a shared copy](tickets/21-shared-copy-per-file.md) | L | – | main.ts | 20 |
| [22 Code pane: typing together and carets](tickets/22-code-pane-together.md) | M | visible | – | 21 |
| [23 The page: typing goes out letter by letter, carets on the page](tickets/23-page-typing-together.md) | L | visible | – | 22 |
| [24 Your Undo undoes your own typing](tickets/24-per-person-undo.md) | M | visible | – | 21, 15 |
| [25 Agents join the merge](tickets/25-agents-join-merge.md) | M | – | – | 21, 10 |
| [26 Saving with several editors](tickets/26-save-several-editors.md) | S–M | – | – | 21 |

## Stage 3: people and outside changes

| Slice | Size | Visible | main.ts | Blocked by |
| --- | --- | --- | --- | --- |
| [30 Synced session: Share live](tickets/30-synced-session.md) | L | visible | main.ts | 23, 24, 25, 26 |
| [31 GitHub collaborators join automatically](tickets/31-collaborators-join.md) | S–M | visible | – | 30 |
| [32 GitHub pushes reach open tabs](tickets/32-github-push-to-tabs.md) | M | – | – | 23, 24, 25, 26 |
| [33 Outside changes fold in](tickets/33-outside-changes-fold-in.md) | M | visible | – | 32 |
| [34 Folder changes merge too](tickets/34-folder-changes-merge.md) | S | – | – | 33 |
| [35 Hot preview link](tickets/35-hot-preview-link.md) | L | visible | – | 30 |
| [36 Close-out: checklist, docs, delete the proof of concept](tickets/36-close-out.md) | S | – | – | 31, 33, 35 |

## Suggested waves

The frontier decides; this is one order that keeps to the rules.

1. 10, 11.
2. 12, 13, 14 (all after 11).
3. 15, 16, 17. Then Lex's stage-1 end check and release.
4. 20; 21 alone; then 22, 24, 25, 26; 23 after 22. Then Lex's stage-2 end check and release.
5. 30 beside 32; then 31, 33, 35; 34 once the local-folders build has shipped; last 36. Then Lex's stage-3 end check and release.

## Lead decisions (technical, made in planning; check with Lex where marked)

- **Live room scope (20):** one room per site, branch and file path, inside the existing per-workspace relay Durable Object (`worker/agent-relay.ts`), not a new class, so self-hosters deploy nothing new.
  - Joining needs the editor sign-in, an agent connection, or a synced-session link token (30).
  - The relay forwards ciphertext only and never calls storage.
- **Who holds the key:**
  - A synced-session link carries the key after `#`.
  - Signed-in tabs and agents of the same workspace get the room key from the receiving tab over the existing relay handshake. Ticket 20 confirms the exchange in `decide`.
- **The helper (16)** lives in this repository under `helper/`, as its own small Node package. It is an MCP client of the editor's `/mcp`, signing in through the same OAuth as any agent. It starts agents through ACP.
  - **Installed (Lex, 2026-10-25: "ok"):** one `npx` command copied by Connect to MCP, published to npm as `@techiesreviews/editor-helper`. The first publish still waits for Lex's OK at build time, because publishing is outward-facing.
  - **Default agent for "Pins go to":** Claude Code (Lex, 2026-10-25).
- **Preview address (35), Lex 2026-10-25:** "keep it at workers.dev for as long as we can and skip a custom domain for now". The preview runs on a separate small preview Worker with its own `workers.dev` address, so site scripts never share an origin with the editor; each site gets a path (`/<site>/`), not a subdomain. Sites share one origin with each other, which is accepted while this is for internal use. A custom domain returns only if a real need shows up.
- **Local folders (34)** need the local-folders build (`docs/wayfinder/local-folders/`), which is unbuilt. Slice 34 waits for it; the lead re-plans 34 if that build has not shipped when stage 3 starts.
- **Cloudflare plan:** stays on Free (ticket 11). The lead tells Lex if a slice's numbers show the daily allowance at risk.

## Lex's checklist: the GitHub App webhook (before slice 32 lands)

Slice 32 first proves the setup on a throwaway test App, including whether installations must approve again when an event is added. Then the lead hands Lex this list, with the exact values filled in by slice 32. About five minutes.

1. Open github.com → **Settings → Developer settings → GitHub Apps** → the editor's App → **Edit**.
2. Under **Webhook**, tick **Active**, set the URL the slice gives, and set a secret. The lead asks for the secret through a secret prompt, never the chat.
3. Under **Permissions & events → Subscribe to events**, tick **Push**. Save.
4. If GitHub asks installations to approve the change, approve it on each account that uses the editor.
5. Tell the lead "the webhook is on"; the lead checks a test push reaches an open tab.

New self-hosters get the webhook at setup (slice 32 changes `worker/owner-setup.ts`).
