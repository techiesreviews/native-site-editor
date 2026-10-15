# A better media manager: build spec

Handoff for the [media-manager map](../map.md) (ticket [14](../tickets/14-handoff-plan.md)). The decisions live in the ticket resolutions; this spec summarises them as requirements and points to the deciding rule. The slices are in [tickets/](tickets/), indexed in [README.md](README.md). Use the terms in [`CONTEXT.md`](../../../../CONTEXT.md): Media file, Media manager, Media collection, Media picker, Optimise, Responsive copy, Image family, Focus point, Trimmed copy, Recently removed, Always keep, Looping video, Online video, Description, Decorative, To check, Replace everywhere, Edit bar.

★ marks a connecting detail Claude filled in at handoff. Lex confirms or changes these.

## Goal

Build the media manager the map decided, on `dev` and the preview editor only, in eight phases that run back to back:

0. **Groundwork** that keeps the editor working: legacy code out, the library view split, the new `.editor/media.json`, Image families.
1. **The new Media screen**: the Tiles look with collections, details, usage, the shared picker and the To check list, on the site's existing images.
2. **Adding and pictures on pages**: one preparation for every way of adding, responsive copies and the new placed-image markup.
3. **The image popup**: shapes, focus point, trimmed copies, the large editor.
4. **Clean-up, renaming and Replace everywhere**.
5. **Video, audio and downloads**, with the site's own player.
6. **Improve images** for old and outside pictures.
7. **Sites in sub-folders**, site-wide.

Agents get each phase's media abilities in that phase.

## Sources

- Ticket resolutions (binding; read the whole resolution before building a slice):
  - Research: [01 Mobbin](../tickets/01-research-mobbin-patterns.md#resolution-2026-10-11), [02 optimising](../tickets/02-research-optimising-every-media-kind.md#resolution-2026-10-11), [03 responsive, crop, focus](../tickets/03-research-responsive-output-crop-focus.md#resolution-2026-10-11), [04 media code today](../tickets/04-research-media-code-today.md#resolution-2026-10-11), [05 images on existing sites](../tickets/05-research-images-on-existing-sites.md#resolution-2026-10-11).
  - Decisions: [06 look](../tickets/06-prototype-media-manager-look.md#resolution-2026-10-12), [07 adding](../tickets/07-one-upload-path.md#resolution-2026-10-13), [08 responsive output](../tickets/08-responsive-image-output.md#resolution-2026-10-13), [09 crop and focus](../tickets/09-prototype-crop-and-focus.md#resolution-2026-10-13), [10 clean-up](../tickets/10-safe-clean-up.md#resolution-2026-10-13), [11 fix-all](../tickets/11-fix-all-existing-images.md#resolution-2026-10-13), [12 video, audio, documents](../tickets/12-video-audio-and-documents.md#resolution-2026-10-13), [13 agents](../tickets/13-what-agents-may-do.md#resolution-2026-10-13), [15 collections and names](../tickets/15-collections-and-file-names.md#resolution-2026-10-14).
  - Handoff: [14](../tickets/14-handoff-plan.md#comments), Lex's comments of 2026-10-14 (summarised under [Decided at handoff](#decided-at-handoff-lex-2026-10-14)).
- Research files live on branches (read with `git show <commit>:<path>`; their line numbers predate later changes, so find code by symbol):
  - 01 `d0c211b7:docs/wayfinder/media-manager/research/01-mobbin-patterns.md`
  - 02 `8842164b:docs/wayfinder/media-manager/research/02-optimising-media.md`
  - 03 `87e5100b:docs/wayfinder/media-manager/research/03-responsive-crop-focus.md`
  - 04 `2d97d703:docs/wayfinder/media-manager/research/04-media-code-today.md` (the ten seams, the dead code list)
  - 05 `e31b6dc8:docs/wayfinder/media-manager/research/05-images-on-sites.md` (the must-not-touch list)
- Design references: [tiles.html](../prototype/tiles.html) (the selected Media look: library, adding, details, picker, clean-up) with [tiles-validation.md](../prototype/tiles-validation.md); [crop-popup.html](../prototype/crop-popup.html) (image popup and large editor) and the large window in [crop-wordpress-style.html](../prototype/crop-wordpress-style.html). Mockups are ideas; no prototype code is kept.
- Runner workflow: `docs/agents/runner.md`, `guardrails.md` and `agent-scripts.md` (on `origin/dev` until slice 01), and [local-testing.md](../../../agents/local-testing.md).

## Ground rules

- **`dev` only.** Every slice lands on `dev` and is deployed with `npm run deploy:preview` (through `scripts/agents/deploy-preview.sh`). **Never production** (`deploy:techies`, `main`) until Lex says. The starter's `main` is also off limits: Start your site on production downloads it.
- **Local `dev` first.** Local `dev` is about 147 commits ahead of `origin/dev` (planning) and 21 behind (the runner tooling: `land.sh`, `agent.sh`, `sol.sh`, `review-brief.sh`, `shots.sh`, `deploy-preview.sh`, `tickets.mjs`, the hooks). Slice [01](tickets/01-bring-dev-level.md) brings them level before any build slice starts. The starter's local `dev` is 18 behind its `origin/dev`; starter slices work from `origin/dev`.
- **Commit only your own paths.** Other sessions commit on the `dev` checkout at the same time. Stage files by name; no `git commit -a`, no `git add -A` on a shared checkout, no `git stash` (the hooks reject it). Use `git -C` or absolute paths, never a bare `cd`.
- **At most five Claude subagents** at once (hook-enforced).
- **One run, small slices.** About half a day or less each. Work continues without waiting for Lex; his feedback becomes new slices.
- **The editor keeps working after every slice.** Old screens stay until their replacement lands; existing e2e specs pin behaviour while code moves.
- **Byte budget.** Boot stays under 355 KB gzip (`npm run test:budget`, enforced in CI). The Media screen, popup and large editor load on demand ★. Encoders and decoders (Safari WebP, AVIF, libheif, oxipng, Mediabunny, pdf.js) load only when a file needs them; report the boot delta for every slice.
- **Direct hosting.** Everything written to a site is plain HTML, CSS and small client JS that works on any static server with no build ([ADR 0001](../../../adr/0001-the-repository-is-the-site.md)).

## Flow per slice

Editor slices (from `runner.md`):

1. Claim the ticket (fill in `assignee:`).
2. Fetch, then `scripts/agents/worktree.sh build/mm-NN-<slug> origin/dev`; work only in that worktree; set `ASE_OWNER`.
3. Build (see [Builders](#builders)). Add unit tests for every pure rule.
4. `npm run check`, `scripts/agents/unit.sh`, `npm run lint`; the touched browser specs through `scripts/agents/port.sh` (fixture groups as in local-testing.md); `scripts/agents/full-suite.sh 3` only for shared plumbing (preview runtime, source edits, transactions, the scanner). Compare failures with `tests/known-failures.json`. Report the byte-budget delta.
5. Review (see [Reviews](#reviews)). Fix real findings; record rejected ones with reasons.
6. Close the ticket in the same branch: `status: closed` and `## Done (YYYY-MM-DD)` with behaviour, commits, tests, review decisions.
7. `scripts/agents/land.sh`, then `scripts/agents/ci-status.sh dev --wait`.
8. Report in the runner's seven lines. Stage wrap-ups deploy and take screenshots ([README](README.md#per-stage-wrap-up)); a slice may also deploy when the lead wants it on preview sooner.

Starter slices (`~/Projects/native-site-editor-starter`, a separate project; `fixtures/native-starter` in the editor is frozen test data and never changed):

1. A starter worktree based on its `origin/dev`; commit there; rebase and push `HEAD:dev` under `flock /tmp/cb-starter-merge.lock`. Never commit to or merge into `main` until Lex says ship.
2. Keep the starter's rules: no build, no `package.json`, root links.
3. Check by serving its root (`python3 -m http.server` through `port.sh`) and with the editor's native-save server on the starter checkout.
4. The editor picks a starter commit up in `fixtures/actual-starter` (refresh by re-archiving the named commit, see `fixtures/actual-starter.README.md`; the drift test `tests/agents-md-drift.test.ts` must pass) and in the vendored preview copy `public/native-static-starter/v<sha>/`.

## Builders

- **Sol (GPT-6.1 Sol) builds most slices**: the behind-the-scenes work (preparation, markup, scanning, data, tools). The runner writes `.scratch/agent-brief.md` and runs `scripts/agents/agent.sh build "$PWD" .scratch/agent-brief.md --effort medium` (Codex, `workspace-write`). **Sol cannot commit**: the lead (or the slice's Claude runner) inspects the diff, fixes defects and commits with `Co-Authored-By: GPT-6.1 Sol <noreply@openai.com>`.
- **Claude builds the screens judged by eye**: the Media screen, the image popup and large editor, the video and audio players, and other visible UI (`builder: claude`). Claude commits its own work with its Co-Authored-By line.
- Slice 01 is the lead's own job.
- The split of each slice between Sol and Claude follows decision 3; the per-slice choice is Claude's ★.

## Reviews

**Every slice, whoever builds it, is reviewed by GPT-6.1 Sol through read-only `codex exec`.** No Claude or Opus review replaces it.

```sh
scripts/agents/review-brief.sh <ticket-file> origin/dev > .scratch/review-brief.md
scripts/agents/review.sh "$PWD" .scratch/review-brief.md .scratch/review
```

`review.sh` runs Codex with `-s read-only` against `CODING_STANDARDS.md`, the slice's ticket and this spec. The result in `.scratch/review/result.md` must start with `REVIEW_STATUS: complete`; anything else is a failed review and is rerun. Re-review once after substantial fixes. Record review decisions in the ticket's Done section.

## Requirements by phase

### Phase 0: Groundwork

- **Delete the dead code** ([04](../tickets/04-research-media-code-today.md#resolution-2026-10-11) §8, research 04 "Dead"): the legacy `write`/`changed`/`rename`/`remove` members of `MediaWorkspaceContext` and their throwing host stubs (`media-controller.ts:111-114`); the optional `applyBatch?`/`assetVersion?` and their checks (`media-workspace.ts:59-62`, `:93`, `:108`; `media-library-view.ts:433`); the uncalled `rewrite` (`media-workspace.ts:221-226`, `media-picker.ts:21`); the test-only `upload` (`media-workspace.ts:186`, `media-picker.ts:17`).
- **Split `media-library-view.ts`** (492 lines, one closure `:29-485`) on research 04's ten seams, behaviour unchanged, pinned by the existing e2e specs.
- **The new `.editor/media.json`** ([13](../tickets/13-what-agents-may-do.md#resolution-2026-10-13), [15](../tickets/15-collections-and-file-names.md#resolution-2026-10-14), [10](../tickets/10-safe-clean-up.md#resolution-2026-10-13), [09](../tickets/09-prototype-crop-and-focus.md#resolution-2026-10-13), [12](../tickets/12-video-audio-and-documents.md#resolution-2026-10-13)): collections and memberships, descriptions with the by-agent mark, Decorative, Always keep, trim sources, video stills and subtitles links, the Recently removed list, the remembered adding settings ★; migrated from today's `{ tags, alt }`.
- **Image families** that recognise today's `-480w` and ticket 07's `-480` copies (`media-markup.ts:61-63`) and originals in `media/originals/`.
- **Agents cannot write `.editor/media.json` directly** (ticket 13 build check; `worker/site-files.ts:226-244`, `shared/protected-paths.ts`).

### Phase 1: The new Media screen

- **Media replaces Images** ([06](../tickets/06-prototype-media-manager-look.md#resolution-2026-10-12)): opens on All, a dense square Tiles grid (3 across on phones, 4 on tablets, 6 wide), one tile per Image family, names on hover/focus/selection and always on touch.
- **One bar**: search, a native Collections select with customizable-select styling and Phosphor icons (plain select where unsupported), and More (Add new file first, kinds, grid/list, Manage collections). No heading, no separate Add button. *Changed by slice 116 (Lex, 2026-10-15): search, then Filter (collections and Manage collections, Show, View), + (Add files) and More (the five tools) as one group.*
- **Usage badges**: distinct pages; hover/focus expands "Used on X pages"; tap shows pages; `0` "No uses found"; other uses and **Not checked yet** shown apart. No usage filter.
- **Details**: big preview, name, Description and Decorative, collections, usage, family, Always keep; on phones its own screen with Back.
- **Collections like tags** ([15](../tickets/15-collections-and-file-names.md#resolution-2026-10-14)): Take out of vs Remove file; Manage collections (rename, delete, new); taken names refused, no combine; starting collections from named folders and old tags.
- **Drop to add** into the viewed collection, with progress and Cancel; on today's Optimise path until phase 2.
- **One shared Media picker**: compatible files only, full-screen on phones, Use / Cancel; adding inside it never places without Use.
- **To check** list for agent-written text ([13](../tickets/13-what-agents-may-do.md#resolution-2026-10-13)).
- **Agents**: list media, preview a picture, place and swap existing media, write descriptions (by-agent mark), manage collections; the Media chapter in the conventions and the starter's `AGENTS.md`; `docs/mcp.md` fixed.

### Phase 2: Adding, and pictures on pages

- **One preparation** for Media, the picker, Structure slots, component fields, Site settings, Files drops and canvas drops ([07](../tickets/07-one-upload-path.md#resolution-2026-10-13)); `uploadFilesTo` (`main.ts:2443`) and its callers (`:431`, `:682`, `:1922`, `:3986`) merge into it; one Undo step.
- **Presets** (Smaller files, Balanced, Higher quality, Smallest files (slower)) with ticket 07's exact mappings, remembered per site, Reset to defaults, in More.
- **Images**: WebP q80 ≤ 2,400 px by default, AVIF option, transparency kept, never larger than needed, copies at 480/960/1,600 named `-480`, Safari WebP encoder, HEIC decoder on demand, SVG sanitised, PNG lossless squeeze.
- **Folders and names**: `media/images/`, `media/videos/`, `media/audio/`, `media/downloads/`; a Files folder chosen by drop wins; tidy names, numbered on conflict across the whole family; Keep original in `media/originals/`.
- **Limits**: 20 MiB per stored file; Large download notes above 1 MB (images) and 10 MB (others); repo size with warnings at 500 MB and 900 MB.
- **Markup** ([08](../tickets/08-responsive-image-output.md#resolution-2026-10-13)): plain `<img srcset sizes>`; measured `sizes` plus `auto, ` for lazy images; first-screen images eager, the first large one `fetchpriority="high"`; `width`/`height` always; replacing inside `<picture>` cleans it up with an art-direction note; copies made for older images when placed; existing size sets adopted.
- **Social image**: a 1200 × 630 JPEG sharing copy, `og:image` at a full address.
- **Animated GIFs** are kept as they are until phase 5 ★.
- **Agents**: the same markup; may change adding settings.

### Phase 3: The image popup

- **One Image button** with a state badge in the edit bar ([09](../tickets/09-prototype-crop-and-focus.md#resolution-2026-10-13)); the popup: shapes (Original, Square, 4:3, 16:9, Tall 4:5, Free), focus dot, Replace, Zoom, Turn, live phone/computer previews, the blue/yellow message, Open large editor, Done; ✕/Escape cancels; bottom sheet on phones; arrow keys.
- **Shape and focus** change only the place (inline `aspect-ratio`, `object-fit: cover`, `object-position`).
- **Trimmed copies** for trim, zoom, turn, straighten, flip: `-crop` names, a fresh name on every re-crop, own responsive copies, "Made from …", re-crop starts from the original. Until phase 4 an old trimmed copy nothing uses is removed normally ★.
- **Large editor** in the WordPress 7.1 style; components open on their own shape; the Social image popup at 1200 × 630.
- **Agents**: shape, focus, trim.

### Phase 4: Clean-up, renaming, Replace everywhere

- **Wide use scanner** ([10](../tickets/10-safe-clean-up.md#resolution-2026-10-13)): every text file, full addresses on the site's own domain, `_redirects`/`_headers`, sitemap, feeds, JSON, JS, `AGENTS.md`; checked on open; Not checked yet never suggested; an unreadable file blocks all suggestions.
- **Always keep** mark; the counts in More (the Media tab's count badge was removed by Lex on 2026-10-15, [slice 122](tickets/122-gallery-polish.md)); Clean up review (groups, collages, file-level choice, confirm, Undo); **Recently removed** for 30 days (GitHub history; a browser copy for local folders); families removed and restored together; removing a used file warns, then allows.
- **Rename** ([15](../tickets/15-collections-and-file-names.md#resolution-2026-10-14)): the whole family and every mention, numbered suggestion, "Keep the old address working" (`_redirects`, as `src/native-page-moves.ts:201-236`).
- **Replace everywhere** with the "new version" mark.
- **Agents**: remove unused files, remove used ones only after swapping them out, add (never remove) Always keep, restore, rename, Replace everywhere with files already in Media.

### Phase 5: Video, audio and downloads

- **Preparation** ([07](../tickets/07-one-upload-path.md#resolution-2026-10-13), [02](../tickets/02-research-optimising-every-media-kind.md#resolution-2026-10-11)): Mediabunny H.264 MP4 with a WebP still; GIF → silent looping MP4; AAC rules; PDF first-page preview (pdf.js); file-type pictures.
- **The site's player** ([12](../tickets/12-video-audio-and-documents.md#resolution-2026-10-13)): one shared script and style in the starter for the video bar, audio player, corner pause button and the YouTube/Vimeo layer; browser controls without it.
- **Placing**: every kind through the picker; the Add panel's Image becomes Media; Looping video per place, in picture spots and section backgrounds; Online videos by pasting an address; subtitles; the edit bar's play button; the canvas stays still.
- **Security policy**: `media-src 'self' blob:` and frames from `https://www.youtube-nocookie.com`, `https://www.youtube.com` and `https://player.vimeo.com` in `public/_headers:5`, kept in step with `tests/native-save/test-csp.ts` (used by the test server).
- **Agents**: place, loop, stills, subtitles, re-place Online videos.

### Phase 6: Improve images

- **More → Improve images** ([11](../tickets/11-fix-all-existing-images.md#resolution-2026-10-13)): rows per page and component with reach; fix one or all; untick pictures (remembered); progress and Cancel; Undo per page and Undo all; More shows its count.
- **Outside pictures** fetched by the browser (policy widened for images only), named source site first, unfetchable ones listed as "website gone" or "not allowed".
- **Heavy files** become new lighter files, every mention repointed, the old to Clean up; GIFs on pages become Looping videos; YouTube/Vimeo players become "picture until tapped"; the left-alone list from tickets 11 and 05.
- **Agents** may run it, except outside pictures and YouTube/Vimeo switch-overs.

### Phase 7: Sites in sub-folders

- **Follow the site's address** (decision 7): the path in Site settings' full address (`https://user.github.io/my-site/` → `/my-site`) prefixes every root address the editor writes: media, page links, Change URL and `_redirects`, the component loader's `<script src>`, stylesheet links, `og:image`. Sites at a domain root are unchanged.
- **Changing the address** later rewrites every address in one go.
- **Writers to change**: `src/page-builder/media-markup.ts:11`, `media-references.ts:221`, `main.ts:683,1924`, `components.ts:1171,1888`, `media-library-view.ts:360`, `native-elements.ts:65`, `shared/native-routes.ts:31-33`, `src/native-create.ts:79`, `card-fill.ts:137,158`, `native-page-moves.ts:163-236`, `component-loader.ts:7`, `shared/starting-point.ts:74,165`, `site-settings.ts:405`; `nativePageMovedUrl` drops the sub-path (`shared/native-project.ts:383-397`); the canvas resolves against `https://site.invalid` with repo root as site root (`src/components/native-preview-runtime.js:111-147`).
- **GitHub Pages**: the Worker's project-site message (`worker/hosts.ts:119`, `shared/hosting.ts:233-250`) changes; `.nojekyll`; `_redirects` does not forward there.
- **ADR 0001** amended (root-link rule at `docs/adr/0001-the-repository-is-the-site.md:58`).

### Docs

- Each slice updates the docs it changes ★; slice [82](tickets/82-media-docs.md) rewrites `docs/page-builder/media.md`, `images-pane.md` and `asset-references.md` at the end.
- `docs/mcp.md` is fixed in phase 1 (missing `make_component`; the tool count) and extended with each phase's media tools.
- One **Media chapter** in `worker/site-conventions.ts`, copied into the starter's `AGENTS.md` with a drift test like the Components chapter; it grows with each phase's agents slice, which also refreshes the starter copy, `fixtures/actual-starter` and the vendored preview copy in the same slice ★.
- ADR 0001 amendments: `media/` folders (slice 24) and the sub-folder prefix (slice 81).

## Test plan

- **Unit tests** (`node:test` through tsx, `tests/*.test.ts`, `npm test`) for every pure rule, named in each ticket. New files include `media-records`, `media-families`, `media-library-filter`, `media-usage`, `media-descriptions`, `media-collections`, `media-prepare`, `media-names`, `media-limits`, `image-sizes`, `media-markup`, `social-image`, `place-frame`, `trimmed-copies`, `media-clean-up`, `recently-removed`, `media-rename`, `replace-everywhere`, `video-prepare`, `audio-prepare`, `player-markup`, `online-video`, `improve-images`, `outside-pictures`, `site-path-prefix`.
- **Exactly one `@smoke` Playwright spec per feature** in `tests/native-save/` (tag `{ tag: "@smoke" }`, default fixture group). Today no media spec is tagged `@smoke`. Twelve new smoke tests ★:

  | Feature | Spec | Slice |
  | --- | --- | --- |
  | Media screen | `native-media-screen.spec.ts` | 12 |
  | Collections | `native-media-collections.spec.ts` | 16 |
  | Media picker | `native-media-picker.spec.ts` | 18 |
  | Agents' media tools | `native-mcp-media.spec.ts` | 21 |
  | Adding | `native-media-adding.spec.ts` | 23 |
  | Placed-image markup | `native-image-markup.spec.ts` | 33 |
  | Image popup | `native-image-popup.spec.ts` | 39 |
  | Clean-up | `native-media-cleanup.spec.ts` | 50 |
  | Rename and Replace everywhere | `native-media-rename.spec.ts` | 54 |
  | Video, audio, downloads | `native-media-video.spec.ts` | 63 |
  | Improve images | `native-improve-images.spec.ts` | 74 |
  | Sub-folder sites | `native-subfolder-site.spec.ts` | 80 |

- **Edge cases are nightly** (untagged tests in the same files).
- **Existing media specs** stay green or move with their feature: `native-images-tab` and `native-media-library` (ported to the Media tab in slices 09–14 ★), `native-media-pane`, `native-asset-references` (scanner, slice 46), `native-upload` (slice 23), `native-media-transaction` (kept as is), `native-image-alt-refusal` (slice 13).
- **Byte budget** reported per slice; `npm run test:budget` green.
- **Full suite** (`scripts/agents/full-suite.sh 3`) before landing shared plumbing: slices 02–04, 08, 23, 33, 46, 52, 53, 77, 78.
- **CI fonts**: specs pass with `FONTCONFIG_FILE=$PWD/scripts/agents/ci-fonts.conf` too.

## Screenshots and phone checks

Once per stage (decision 4), when the whole phase is on preview: one set on the real starter (`scripts/agents/shots.sh`, scenario in `.scratch/shots/stage-N.spec.ts`), at computer (1280 × 800) and phone (390 × 844) widths ★, published with `html_render`. Builders test desktop browsers only; Lex tries the phone lists below on his iPhone with the preview editor (decision 8).

| Stage | Screenshot set | Lex's iPhone list |
| --- | --- | --- |
| 1 Media screen | All grid, a collection, search with no results, usage badge open, details, Manage collections, the picker, To check | Media shows 3 across with usage numbers and select circles (names only in details and the list, slice 122); tap a usage badge; open details and Back; Filter opens and picks (slice 116; was the Collections dropdown); + opens the photo library (slice 116; was Add new file in More); the picker is full-screen with Cancel/Use reachable |
| 2 Adding | Adding progress, Adding settings in More, a Large download note, a placed image's details | Add a HEIC photo from the camera roll; check it arrives as `.webp` and is small (Safari WebP); add 5 photos at once and cancel one; a page with a big photo loads quickly on the phone |
| 3 Image popup | Popup with each shape, focus dot, yellow message, large editor, the component shape note, Social image popup | Open the popup by touch; it is a bottom sheet; drag the focus dot; pinch to zoom; swipe down to close; large editor's icon row |
| 4 Clean-up | More's Clean up count, Clean up review, Recently removed, the used-file warning, Rename with taken name, Replace everywhere | Run Clean up and Undo; restore a file from Recently removed; rename a file with the phone keyboard |
| 5 Video | Video tile, player bar, audio player, PDF card, Looping video corner button, Online video in the picker | Add a video from the camera roll; play full screen; picture-in-picture; scrub the bar by touch; a YouTube video's still then play (what YouTube shows over the bar); Reduce Motion on: a Looping video stays paused; Low Data Mode: a background video shows its still |
| 6 Improve images | Rows, an opened row with unticked pictures, progress, Undo list | none ★ |
| 7 Sub-folder sites | Site settings with a project-site address, the rewrite note, the canvas of a sub-folder site | none ★ |

## Build checks

Collected from the resolutions and research; each owning slice confirms or fixes it.

- **Protect `.editor/media.json`** from direct agent `write_file`/`edit_file`/`move_file`/`delete_file`; the guard has no `.editor/` rule today (13; slice 07).
- **`docs/mcp.md` is out of date**: it leaves out `make_component` and lists 20 tools where 21 exist (13; slice 22).
- **Copy names**: today `-480w`, ticket 07 `-480`; families must recognise both (15; slice 06).
- **Research 04 line drift**: it cites `media-draft-transaction.ts:338-452`, but the file has 219 lines (`commit` `:116-150`, rollback `:217`). Find code by symbol.
- **Safari and phones**: real Safari WebP output and real-phone speed are unverified (02, 07); the Safari WebP encoder is about 120 KB and loads only there; the HEIC decoder (libheif, about 480 KB) needs a licence and patent check before it ships (slice 29).
- **Trims under a fresh name**: never overwrite a trimmed copy's address, so caches cannot show the old trim (09; slice 40). Safari, touch, swipe and pinch on the popup are unvalidated (09; stage 3 phone list).
- **Video on phones**: full screen, picture-in-picture and gestures on the custom bar; what YouTube still shows over a custom bar; whether YouTube or Vimeo captions can drive the CC button; Vimeo hides its bar only for paid owners (12; slices 60, 61).
- **Security policy**: YouTube/Vimeo frames and `media-src 'self' blob:` (12; slice 56); widen only what images need for outside pictures (11; slice 71). The test server's policy differs from production (`worker-src 'self' blob:` vs `worker-src 'self'`), so on-demand encoders in workers must be checked under the production header.
- **Fetching Online video stills** from the browser needs the services to allow cross-site reading (YouTube image host, Vimeo's oEmbed); confirm before slice 67, else list the still as "copy by hand".
- **`<picture>` stale `<source>` bug** (08, research 03; slice 34). **`og:image` must become a full address**; today it is a root link (`site-settings.ts:405`, `starting-point.ts:165`) (slice 36).
- **ADR 0001** needs the `media/` folders amendment; existing files are not migrated (07; slice 24).
- **Must-not-touch list** for Improve images: SVG logos (only `width`/`height`), affiliate banners when unticked, script-driven pictures, YouTube stills in structured data, sample code inside articles, component templates' own fallbacks (05, 11; slice 70). **Adopt hand-made responsive sets** (05; slices 35, 72).
- **`uploadFilesTo`** is still at `main.ts:2443` and `applyMediaBatch` at `main.ts:2522` (slice 23); library batches need an open page (`main.ts:2529`, research 04; slice 08).
- **Preview asset scanner** `referencedAssets` (`main.ts:2319`) misses `srcset` and `<source>` copies (research 04; slice 33).
- **HEIC kept as original** never shows in the library, because `isImagePath` has no HEIC (research 04; slices 06, 29).
- **Wording**: the library still says "Save" where the editor says "Publish" (research 04; slice 09).
- **Runner tooling** exists only on `origin/dev`; local `dev` is about 147 ahead and 21 behind; the starter's local `dev` is 18 behind (slice 01).
- **Ticket check**: `tickets.mjs check` (part of `npm run lint`) fails on local `dev` for five components-and-builder build tickets with unknown `blocked_by` slugs; slice 01 fixes them. This plan's tickets pass the check.
- **GitHub Pages** ignores `_redirects`, so "Keep the old address working" cannot forward there, and it needs `.nojekyll` (slices 52, 81).
- **Empty descriptions**: 490 of 533 images on techies-reviews have `alt=""`; as "not described yet" they will all show as gaps until marked Decorative (13, 05). Expect a long list there.
- **AVIF and the fix-all**: research 02 advised never using AVIF in the fix-all and ticket 07 left it open; ticket 11's confirmed resolution settles it: Improve images follows the site's remembered image setting, AVIF included when Lex chose it. Expect slow runs on large sites with AVIF; show progress and Cancel as ticket 11 requires.
- **Agent changes expire** if the tab does not pick them up within 2 minutes (13); long media jobs run in the tab after pickup.

## Decided at handoff (Lex, 2026-10-14)

1. **First stage on preview: the new Media screen** (Tiles look, collections, details, picker) on the site's existing images.
2. **Second stage: adding and pictures on pages**: one preparation for every way of adding, responsive copies, the new placed-image markup.
3. **Builders: Sol builds most** (preparation, markup, scanning, data); **Claude builds the screens judged by eye** (Media screen, image popup and large editor, video and audio players, other visible UI). **Every slice is reviewed by GPT-6.1 Sol through read-only `codex exec`.**
4. **Screenshots once per stage**: one fuller set on the real starter, computer and phone widths, published with `html_render` when a stage is fully on preview. Replaces the per-push screenshots for this build.
5. **Never pause** between stages; Lex steps in if something looks wrong.
6. **Agents get each stage's media abilities within that stage** (tickets 13 and 15 rules).
7. **Sub-folder sites are handled in this build, site-wide, as the last stage**, by following the site's address: the path in Site settings' full address prefixes every root address the editor writes; domain-root sites are unchanged; changing the address rewrites every address in one go. Amends ADR 0001's root-link rule.
8. **Real iPhone and Safari checks: Lex checks from a short list** at the end of stages that need it; builders test desktop browsers only.
9. **`dev` and `npm run deploy:preview` only, never production until Lex says.** Starter changes go on the starter's own `dev`, with the `fixtures/actual-starter` refresh and the `AGENTS.md` drift test.

## Out of scope

- Agents adding new media: uploading, fetching from the web or generating images (map). They also never paste new Online video addresses, bring in outside pictures or switch YouTube/Vimeo players (13).
- AVIF as the default ([02](../tickets/02-research-optimising-every-media-kind.md#resolution-2026-10-11), [07](../tickets/07-one-upload-path.md#resolution-2026-10-13)); see the AVIF build check for Improve images.
- Git LFS; PDF compression (Ghostscript's licence) (02).
- Duplicates, large files and kept originals in Clean up (10).
- Art-directed `<picture media>` authoring; per-place cutting in CSS (`object-view-box`); more than one focus point per place (03, 08).
- Responsive copies or focus for CSS backgrounds; `@media` rules in site styles (08).
- A Worker route for outside pictures (11); outside pictures in the library (they show only in Improve images).
- Moving existing files into `media/` folders (07).
- Relative links (`../media/…`) for sub-folder sites (decision 7).
- Embeds other than YouTube and Vimeo (12).
- A paid remote real-device service (decision 8).
- techies-reviews' own changes (its `AGENTS.md`, its images); Improve images runs on it only when Lex asks.

## Done when

- Every slice in [tickets/](tickets/) is closed and landed on `dev`, and the preview editor runs the last merge.
- `npm run check`, `npm test`, `npm run lint`, the byte budget, the smoke slice and the full native-save suite are green on `dev`'s head.
- On the real starter in the preview editor: Media opens on the Tiles grid with collections, usage and details; any way of adding makes a prepared file with responsive copies; placed images have measured `srcset`/`sizes`; the image popup sets a shape, focus point and trim; Clean up removes and Recently removed restores; a file is renamed and replaced everywhere; a video, an audio file, a PDF and a YouTube video play in the site's player; Improve images fixes a page and Undo reverts it; a sub-folder site works after its address is set.
- Every stage's screenshot set has been published to Lex, and every phone list sent.
- The conventions, tool descriptions, `docs/mcp.md` and the starter's `AGENTS.md` agree (drift test passes); every media tool works over MCP.
- Nothing has gone to `main`, production or the starter's `main` without Lex's word.
