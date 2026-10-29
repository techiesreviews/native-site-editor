---
title: "Agent tools: page picture, I'm working here, next steps, shorter instructions"
type: task (AFK)
status: closed
assignee: am-14
builder: claude
blocked_by: [11-several-agents-presence]
---

## Goal

Agents check their own work and show where they work; replies teach the next step and save tokens ([research 02](../../tickets/02-research-what-an-mcp-can-do.md#resolution-2026-10-24)).

## Decided behaviour

[Ticket 06, item 5](../../tickets/06-grill-asking-with-a-pin.md#resolution-2026-10-24):

- A picture of the preview at Lex's width or a phone width, as the receiving tab renders it.
- An "I'm working here" tool (page and section) that drives slice 11's presence.
- Every edit reply names the logical next step.
- The server instructions open with "start with `get_site`; pins come from `wait_for_requests`" within Codex's first 512 characters.

## Files

Expected (confirm while designing): `shared/agent-tool-table.ts`, `worker/mcp.ts`, `src/agent-site.ts`, a new `src/agent-picture.ts` (how the tab makes the image is this slice's design question, in `decide`), `src/agent-prompts.ts`, `docs/mcp.md`; tests including an MCP spec for the picture tool.

## Done when

- An MCP spec gets a picture at 390 and at Lex's width.
- The working-here tool draws presence.
- A unit test pins the next-step lines and the first 512 characters of the instructions.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit bg slice-am-14 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-am-14 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.

## Done (2026-10-29)

- **Picture (`screenshot_preview`).** An agent gets an image of a page as the receiving tab draws it. `width: "editor"` (the default) is the preview pane's own size, as Lex sees it; `width: "phone"` is 390 × 844. It shows the page's first screen, or one `section` (from get_page's outline), at most 1,600 px tall. The page is shown in the editor first, as inspect_preview does. The text beside the image gives its size and the width it was laid out at.
  - How the tab makes it (the slice's design question): the preview runtime copies the page shown into a hidden child frame of the asked size. This is the measuring frame image measurement already used, now shared (`measuringCopy`, `measuringFrame` in `native-preview-runtime.js`). There the page lays out at that width, so a phone picture is a phone layout.
  - `src/agent-picture.ts` (its own small frame script, global `asePicture`, which only a picture's measuring frame loads) then copies the composed tree (shadow trees with their slots filled, `::before`/`::after` as boxes) with each element's computed styles into an SVG foreignObject. It draws that onto a canvas and encodes WebP (else JPEG), shrinking until it fits 600 KB of base64. No permission prompt, server or network is needed.
  - The site's own pictures and fonts show, since the preview gives them as data: URLs. Pictures and fonts from other sites, embedded frames and video frames are left out; a video shows its poster.
  - The picture is answered once and never kept with a receipt.
- **I'm working here (`working_here`).** An agent names a page and section (or the page alone) before it changes anything. It shows there as a change would: its outline and name chip on the section, a Page Structure dot, or a dot on another page's row in Pages and files. `get_site` lists it.
  - It stays until the agent calls again (it moves), calls with `done`, or 5 minutes pass (`WORKING_HERE_MS`). A change of its own that runs meanwhile shows where it lands, then the hold shows again. A stopped agent shows nowhere.
  - An element id is drawn on its section. A section not on the page is refused. The hold lives in `src/agent-working-here.ts` (`createWorkingHere`), loaded with the first working_here; `src/agent-presence.ts` `show` draws it.
- **Next step in every reply.** A change's reply, once it worked, carries `next`: the logical next step. Examples: check it with `screenshot_preview`, `list_media` shows it now, fill a new section with `edit_file`, or answer the request with `reply_to_request`.
  - Each line is a `next` column in `shared/agent-tool-table.ts`, so every tool that changes the site has one; the picture and working_here have one too.
  - `get_command_status` answers without it; a duplicate of a change answers as the change did, with it.
- **Shorter first instructions.** The server's instructions open with a summary that stands alone in 487 characters (`SITE_INSTRUCTIONS_OPENING`): "Start with get_site; pins come from wait_for_requests", edits are drafts, show where you work with working_here, check with screenshot_preview, name yourself, read the conventions. The rest follows, a little shorter (3,618 characters in all, under Claude Code's 4,096).
  - The conventions, the connection prompt, the build-site prompt and the watch_editor prompt now name working_here and screenshot_preview.
- **Files beyond the expected list.** These were needed for the picture's wire and the presence hold:
  - `worker/site-conventions.ts`, `shared/agent.ts`, `shared/agent-edit.ts`, `src/agent-presence.ts`, `src/agent-site-host.ts`, `src/agent-tools-edit.ts`, `src/background-site.ts`;
  - `src/components/native-preview.ts`, `native-preview-runtime.js`, `preview-protocol.ts`, `preview-link.ts`.
  - `shared/media-kinds.ts` (`pictureReplyTypes`): the picture's allowed image types live with the other media lists, as `tests/media-kinds-guard.test.ts` asks.
  - For the boot byte budget: `vite-preview-runtime.ts` (a second frame script), `src/agent-working-here.ts` (new), `scripts/check-exports.allow.json`, `docs/agents/code-map.md`, `tests/vite-preview-runtime.test.ts`.
- **Tests.**
  - New `tests/native-save/native-agent-picture.spec.ts`, over the real MCP:
    - a picture at Lex's width (the pane's size) and at 390 × 844, and one of the hero section at 390, each decoded and checked not blank;
    - a missing section is refused;
    - working_here draws the agent's outline and chip on the hero and its Page Structure dot, `get_site` lists it, it moves to the cards section, and `done` clears it.
  - `tests/agent-tool-table.test.ts` pins every next-step line and the 512-character opening (and the 4,096 limit).
  - `tests/agent-presence.test.ts` covers the hold (move, a change of its own in between, done, five minutes, stopped) and applySiteCommand's working_here.
  - `tests/agent-picture.test.ts` covers pseudo-element text.
  - Refusals for both tools are in the ticket-51 list (`tests/agent-tools-edit.test.ts`).
  - Protocol and wire tests take the picture messages.
  - Tests that compared an edit's reply with its status now leave out `next`.
  - I also looked at the three pictures on the fixture: they match the preview, and the phone one is the stacked phone layout.
- Feature list: F-agent-12 added.
- `RESULT: ok unit 3894/3894 (254 files)` (`kit unit --affected`). `kit specs --affected`: `RESULT: fail specs 2 of 186 failed: native-agent-live.spec.ts, native-agent-reads.spec.ts`. In that run a change waited for typing and then ended conflict instead of applied, under four shards. Run alone, both pass: `RESULT: ok specs 2/2 passed`. After the last working_here change: `RESULT: ok specs 5/5 passed` (picture, several agents, presence, agent edits, MCP media). `npm run check` and `npm run lint` are clean.

- Commits: "Agent tools: page picture, I'm working here, next steps, shorter instructions", "docs: 14-agent-tools-see-and-say parked on the boot budget until am-42" and this commit.
- Review round 1 (fixed):
  - A working_here hold that ends (done, moved, or five minutes) leaves `get_site` as it was before the hold: the agent's last change, or nothing. Before, it listed the agent on that section for ten more minutes (`show(…, held)` in `src/agent-presence.ts`).
  - A picture shows no presence of its own, so an agent holding a section stays on it while its picture is taken, and a picture no longer lists the agent in `get_site` (`UNSHOWN` in `src/agent-site.ts`).
  - The picture's waits now fit the relay's ten seconds for the whole command, opening the page included: 1.5 s for the page, then a 5.5 s ask; the measuring frame gives up at 5 s and its settling at 3.5 s. A picture that still does not come back is answered "No picture came back (…). Nothing was changed; take it again." It is never told to look up a status, since it keeps no receipt.
  - The fakes' double assertions say why.
  - Tests:
    - `tests/agent-presence.test.ts`: `get_site` after done and after the five minutes; a picture taken while holding a section.
    - `tests/agent-tools-edit.test.ts`: the picture as an image, "The editor took no picture", and a late picture.
    - `native-agent-picture.spec.ts`: `get_site` is empty after done.
- Review round 2 (fixed):
  - A reply names the logical next step. With `done`, working_here's is answering the request (`nextStep(tool, args)`). `move_file`'s fits any file: "list_files shows it at its new path, and get_site the pages at their URLs". `remove_section`'s pictures the page, since the section is gone.
  - working_here takes its hold as the command arrives (`hold` in `src/agent-presence.ts`). A site or branch shown while it reads the page gets nothing drawn or listed.
  - A hold is tagged apart from changes. An agent's change shows over its hold, whichever began first. A change that ends while a hold stands is what `get_site` keeps, not the hold.
  - screenshot_preview takes no `requestId` or `waitSeconds`, since it keeps no receipt.
  - Tests:
    - `tests/agent-presence.test.ts`: a hold begun while a change runs; a switch during working_here's read.
    - `tests/agent-tool-table.test.ts`: the new lines, and done's step.
    - `tests/agent-picture.test.ts`: the shrink loop (quality first, then size, then "could not fit"), JPEG without WebP, a canvas the browser will not read.
    - `native-agent-picture.spec.ts`: done's next step, and a picture of About (not on screen), which the editor then shows.
- Review round 3 (fixed):
  - working_here never claims the user sees what they do not. A hold the tab cannot show is refused: "Nothing is shown: the editor shows another site or branch now." (another site or branch shown while the page was read) or "Nothing is shown: the user stopped you." (`hold` answers why).
  - The picture writes each element's styles against the defaults of the element it writes. A slot written as a span keeps `display: contents`, and the document's own elements become divs with their own styles.
  - A background see-through in any colour space (`color(… / 0)`, `oklch(… / 0)`) counts as none.
  - The picture test's fakes are typed.
  - Tests:
    - `tests/agent-presence.test.ts`: the refusal replies, for a switch and for a stopped agent.
    - `native-agent-picture.spec.ts`: a hero 3,000 px tall is cut at 1,600; a measuring frame whose runtime never loads answers "The picture timed out waiting for the page to draw." and leaves no frame behind.
- Evidence after round 3: `RESULT: ok unit 3902/3902 (254 files)` (`kit unit --affected`); `RESULT: ok specs 186/186 passed` (`kit specs --affected`, which also passes the two agent specs that failed under load in the first run); `npm run check` and `npm run lint` are clean.
- Landing fixes (kit pr and CI, fixed):
  - `kit pr`'s unit run stopped twice on guards: the picture's image types were a regex in `preview-protocol.ts` (now `pictureReplyTypes` in `shared/media-kinds.ts`), and the frame guard's counts. The second is gone with the merge below; `tests/frame-guard.test.ts` is dev's again.
  - Its specs stopped once on two timing tests under the full suite: `native-edit-latency.spec.ts` (a 52 ms task against 50 ms) and `native-structure-inplace.spec.ts` ("Cannot fast-forward to the past"). Run alone both pass: `RESULT: ok specs 2/2 passed`; the next full run passed them.
  - CI's byte budget failed: boot 364 KB against 362 KB (dev 369,672 B, this slice 370,857 B; budget 370,688 B). Three changes bring it to 370,610 B:
    - the painter is its own frame script, so the runtime no longer carries it (2.5 KB gzip);
    - image measurement and the picture share one measuring-frame run (`inMeasuringFrame`) in the runtime, instead of two copies;
    - working_here's hold moved out of the boot `agent-presence.ts` into `src/agent-working-here.ts`, loaded with the first working_here. Its load is taken as the command arrives (presence `begin`), before that code loads.
  - Evidence: `RESULT: ok unit 6362/6362 (411 files)` (`kit unit`); `RESULT: ok specs 5/5 passed` (picture, presence, image markup, runtime recovery, agent edits); `npm run check` and `npm run lint` clean.
- Parked (2026-10-29): squashed into one commit on dev after am-45 (`35b4950ba`; the conflict in `src/agent-presence.ts` resolved), not pushed. Boot is then 371,258 B against 370,688 B (dev 370,364 B), so the slice waits on the boot budget until am-42 (tech-debt 12) lands; then it rebases and reruns `kit pr`.
- Review round 3, declined: a spec for the measuring frame's 3.5 s settling deadline. In the measuring frame every picture and font is a data: URL and the sheets are adopted, so no request can be held to keep it unsettled. The frame's own 5 s timeout carries the same kind of answer and is tested.
- Review round 1, declined: `working_here { done: true }` while another site or branch is shown stays refused as needing its page on screen. The hold belongs to the load it began in, so after the switch its outline and dots are already gone. Its `get_site` line ends with its five minutes.

- UX review, declined: F-canvas-14's "Text changed" note after a heading edit, covering the code pane at 390 px (S4, U5). It comes from the page structure and component typing code (`src/controllers/page-structure-controller.ts`, `src/page-builder/components.ts`), which this slice does not touch. It is already listed in slice 11's UX follow-ups. F-agent-12 and the other agent screens were found fine. The second UX review found it again, along with the Publish button's count badge (S2), which comes from `src/components/publish-menu.ts`, also untouched here. Both are declined for this slice.

### Follow-ups

- A section picture is the page's own layout moved up, so a header fixed to the screen stays at the page's top: a section further down is pictured without it, though the user would see it there.
- A hold keeps the index path it was given. After the agent's own add_section or move_section above it, it points at the neighbouring section until working_here is called again; a structural change landing on its page could end or move it.
- open_page and inspect_preview still show their agent on the page while they run, and so list it in `get_site` for ten minutes with no section. Like a picture, a look could leave presence alone.
- A picture of a page that is not shown switches the editor to it first, as inspect_preview does. A background page (ticket 27) would leave Lex where he is, but it needs the page's images given as data: URLs.
- Spec (P3): bddcc66ca:docs/wayfinder/agents-and-multiplayer/build/tickets/14-agent-tools-see-and-say.md:101 — P3 ticket: The Done section lists review decisions and `RESULT:` evidence only up to round 3 ("Evidence after round 3: RESULT: ok unit 3902/3902 …"). The Commits line names "Review fixes round 4", "Review fixes round 5" and "Frame guard counts the page picture's child post and listener", but Done never says what those rounds changed. No `RESULT:` line was recorded after them, even though the last one changed `tests/frame-guard.test.ts` and the wire counts. docs/agents/runner.md:67 asks Done to record "behaviour, commits, tests, review decisions, evidence". The ticket's own "Kit commands and evidence" asks for `kit unit --affected`, `kit specs --affected` and `npm run check` to be green with `RESULT:` lines quoted. Fix: add "Review round 4 (fixed)" and "Review round 5 (fixed)" entries, then quote fresh `RESULT:` lines from `kit unit --affected` and `kit specs --affected` taken at HEAD.
- Standards (P2): fded93aa4:src/components/native-preview-runtime.js:3538 — P2 fault: When `config.picture` is set, `whenSettled` waits for every `<img>` to be `complete` and for `document.fonts.status` to stop being "loading". If that takes longer than 3.5 s, it answers with the error "The picture timed out waiting for styles or images." So one slow image or webfont from another site makes the whole picture fail. That is backwards, because `agent-picture.ts` leaves those resources out of the picture anyway (the SVG image cannot load them). The agent gets an error instead of a picture whose layout is already settled. Applicable rule: CODING_STANDARDS "Racing and speculative reads": "every combination has a stated outcome, and the page never stays in a loading state with no way forward". The "never settles" row for third-party resources has no way forward. Fix: for a picture, run `then()` when the deadline passes instead of throwing. Keep the error for image measurement.
- Standards (P3): fded93aa4:src/agent-site.ts:1074 — P3 race: `screenshot_preview` awaits `actions.open(path)` and then calls `actions.picture`. `native-preview.ts:1190` checks only `site.routes[route] === request.path`. If the user switches to another site or branch with a same-named page between those two awaits, the agent gets a picture of the other workspace's page and is told it is its own. `working_here` takes its proof before the read (`hold` → `ports.begin()`); this path takes none. Applicable rule: CODING_STANDARDS "Async writers": "capture the proof … before the first await, and re-check that same proof after every await". Fix: take `ports.begin()` (or the command's scope) before `open` and refuse after `picture` if it no longer holds, the way `hold` refuses with `NOT_HELD.elsewhere`.
- Standards (P3): fded93aa4:src/agent-site.ts:1095 — P3 fault: When `section` is an element id inside a section, the hold is drawn on the enclosing section (`presenceWithin`). But the reply says "The user sees you at work on section 1.1.1.0 of index.html", naming the element as the section, which is not what the user sees. Fix: name the section that is held, i.e. `outlineId` of the `presenceWithin` result.
- Standards (P3): fded93aa4:src/components/native-preview-runtime.js:3731 — P3 style: When the section is missing, `screenshot_preview` answers "No such section on the page shown." with no recovery hint. `working_here` answers the same case with `noSection` ("No section 1.9 on this page. get_page lists them."). The research behind this ticket (02, "errors say how to recover") asks for the hint. Fix: validate the section in `applyAdmitted` against `readSource(await actions.text(path))` and throw `noSection(args.section)` before opening, as `working_here` does.
- Validation gaps (gap): No browser spec for working_here on a page that is not shown. Done and F-agent-12 promise "a dot on another page's row in Pages and files", but `native-agent-picture.spec.ts` only checks the shown page. Add to that spec: call `working_here { page: "/about/" }` while Home is shown, assert one `.agent-dotsdot` on About's row in Pages and files and no preview outline, then call `done` and assert the dot is gone.
- Validation gaps (gap): No spec covers the preview re-rendering while a picture is taken (`takePicture` answers "The preview changed while it was pictured. Try again."). The racing-reads rule asks for one spec per matrix row. Add one: hold the measuring frame's runtime with `page.route`, make an `edit_file` land while it is held, release, and assert `screenshot_preview` returns `isError` with that message and leaves no hidden iframe.
- Validation gaps (gap): No test covers the host's 5.5 s ask timing out ("The preview did not answer. Keep the editor tab visible and try again."). Add a unit test of `createNativePreview(...).picture` with a fake link whose `ask` resolves `undefined`, asserting that message.
- Validation gaps (gap): No test checks that `next` is absent from replies that did not apply. Add to `tests/agent-tool-table.test.ts` (or the MCP rpc tests) a conflicting `edit_file` call, plus a `working_here` refused with `NOT_HELD.elsewhere`, and assert neither payload has `next`.

### UX follow-ups

- UX (looks off): F-canvas-14 the heading change shows in the page, the tree and the code panes without a reload, but each edit brings up a "Text changed" strip at the bottom that sits over the code pane lines, in light and dark at 390 and 1280 px (S4, U5) (.scratch/ux/am-14/20261029-073927-CQdZPi/add-panel-F-canvas-14-390-light-live-strip.webp)
