# Build: a better media manager

The build plan for the [media-manager map](../map.md). Requirements, flow per slice, reviews, tests, screenshots and the decisions taken at handoff: [spec.md](spec.md). Each slice is one ticket in [tickets/](tickets/), one branch, about half a day or less, built on `dev` and deployed to preview only (`npm run deploy:preview`, never production until Lex says).

## Phases

| Phase | Stage on preview | Slices | Sol | Claude |
| --- | --- | --- | --- | --- |
| 0 | Groundwork (invisible; the editor keeps working) | 8 | 7 | 1 (the lead) |
| 1 | The new Media screen | 14 | 6 | 8 |
| 2 | Adding, and pictures on pages | 15 | 13 | 2 |
| 3 | The image popup | 8 | 4 | 4 |
| 4 | Clean-up, renaming, Replace everywhere | 10 | 6 | 4 |
| 5 | Video, audio and downloads | 14 | 7 | 7 |
| 6 | Improve images | 6 | 5 | 1 |
| 7 | Sites in sub-folders (site-wide) | 7 | 6 | 1 |
| | **Total** | **82** | **54** | **28** |

`builder: sol` slices are built by GPT-6.1 Sol through `scripts/agents/agent.sh build`; `builder: claude` slices are built by a Claude agent (the parts judged by eye). **Every slice, whoever builds it, is reviewed by GPT-6.1 Sol through read-only `codex exec`** ([spec, Reviews](spec.md#reviews)). Each phase also gives agents that phase's media abilities (Lex, decision 6). Starter work goes to the `dev` branch of `~/Projects/native-site-editor-starter`.

★ marks a connecting detail Claude filled in at handoff, not stated in a ticket resolution or in Lex's handoff decisions. Lex confirms or changes these.

## Slices

### Phase 0: Groundwork

| Slice | Builder | Blocked by |
| --- | --- | --- |
| [01 Bring local dev level with origin/dev](tickets/01-bring-dev-level.md) | claude (lead) | – |
| [02 Remove the legacy media-workspace members](tickets/02-remove-legacy-workspace-members.md) | sol | 01 |
| [03 Split the library view: busy lock, byte cache, refresh, filter](tickets/03-split-library-state.md) | sol | 02 |
| [04 Split the library view: shell, grid, details, delete, Optimise, input](tickets/04-split-library-screens.md) | sol | 03 |
| [05 The new .editor/media.json shape, with migration](tickets/05-media-records.md) | sol | 01 |
| [06 Image families, for both copy names](tickets/06-image-families.md) | sol | 01 |
| [07 Agents cannot write .editor/media.json directly](tickets/07-protect-media-records.md) | sol | 05 |
| [08 Media changes work without an open page ★](tickets/08-media-undo-without-page.md) | sol | 02 |

### Phase 1: The new Media screen

| Slice | Builder | Blocked by |
| --- | --- | --- |
| [09 Media tab replaces Images, with the Tiles grid](tickets/09-media-tab-and-tiles.md) | claude | 04, 06 |
| [10 One bar: search, Collections dropdown, More](tickets/10-one-bar.md) | claude | 09 |
| [11 Usage records per media file](tickets/11-usage-records.md) | sol | 05, 06 |
| [12 Usage badges and the list view](tickets/12-usage-badges-and-list.md) | claude | 10, 11 |
| [13 Descriptions and Decorative](tickets/13-descriptions-and-decorative.md) | sol | 05 |
| [14 File details](tickets/14-file-details.md) | claude | 12, 13, 08 |
| [15 Collection records and starting collections](tickets/15-collection-records.md) | sol | 05, 08 |
| [16 Collections in Media](tickets/16-collections-in-media.md) | claude | 10, 15 |
| [17 Drop to add into the viewed collection](tickets/17-drop-to-add.md) | claude | 16 |
| [18 The shared Media picker](tickets/18-media-picker.md) | claude | 14, 16 |
| [19 The To check list](tickets/19-to-check-list.md) | claude | 14 |
| [20 Agents see media (list and preview tools)](tickets/20-agents-see-media.md) | sol | 11, 13 |
| [21 Agents place, swap, describe and collect](tickets/21-agents-place-describe-collect.md) | sol | 18, 20, 15 |
| [22 The Media chapter for agents; docs/mcp.md fixed](tickets/22-media-chapter-and-mcp-docs.md) | sol | 21 |
| [83 Alt text specs after Descriptions and Decorative](tickets/83-alt-text-spec-fix.md) | claude | 13 |
| [84 Win back boot budget headroom](tickets/84-boot-budget-headroom.md) | sol | 49 |

### Phase 2: Adding, and pictures on pages

| Slice | Builder | Blocked by |
| --- | --- | --- |
| [23 One preparation for every way of adding](tickets/23-one-preparation-path.md) | sol | 17, 08 |
| [24 media/ kind folders and tidy names](tickets/24-media-folders-and-names.md) | sol | 23 |
| [25 The image recipe: presets, copies, never larger](tickets/25-image-recipe.md) | sol | 23 |
| [26 Adding settings in More, remembered per site](tickets/26-adding-settings.md) | claude | 25 |
| [27 Keep original](tickets/27-keep-original.md) | sol | 24, 25 |
| [28 WebP in Safari and the AVIF option, loaded on demand](tickets/28-safari-webp-and-avif.md) | sol | 25 |
| [29 HEIC, SVG and PNG](tickets/29-heic-svg-png.md) | sol | 25 |
| [30 Limits, warnings and repo size](tickets/30-limits-and-repo-size.md) | sol | 23 |
| [31 Adding progress at every entry point](tickets/31-adding-progress-everywhere.md) | claude | 30 |
| [32 Measure how wide an image shows](tickets/32-measured-sizes.md) | sol | 01 |
| [33 Placed-image markup: srcset, sizes, loading order](tickets/33-placed-image-markup.md) | sol | 32, 25 |
| [34 Replacing inside picture cleans it up](tickets/34-picture-clean-up.md) | sol | 33 |
| [35 Copies for older images; adopt existing sizes](tickets/35-copies-for-older-images.md) | sol | 33, 24 |
| [36 The Social image sharing copy](tickets/36-social-sharing-copy.md) | sol | 25 |
| [37 Agents place with the same markup and may change settings](tickets/37-agents-adding.md) | sol | 33, 26, 22 |

### Phase 3: The image popup

| Slice | Builder | Blocked by |
| --- | --- | --- |
| [38 Shape and focus point per place](tickets/38-place-shape-and-focus.md) | sol | 33 |
| [39 The Image button and the image popup](tickets/39-image-button-and-popup.md) | claude | 38, 18 |
| [40 Trimmed copies](tickets/40-trimmed-copies.md) | sol | 24, 25, 05 |
| [41 Trim, zoom and turn in the popup](tickets/41-popup-trim-zoom-turn.md) | claude | 39, 40 |
| [42 The large editor](tickets/42-large-editor.md) | claude | 41 |
| [43 Components open on their own shape](tickets/43-component-shapes.md) | sol | 39 |
| [44 The Social image popup](tickets/44-social-image-popup.md) | claude | 39, 36 |
| [45 Agents set shape and focus, and trim](tickets/45-agents-frame-and-trim.md) | sol | 38, 40, 37 |

### Phase 4: Clean-up, renaming, Replace everywhere

| Slice | Builder | Blocked by |
| --- | --- | --- |
| [46 The wide use scanner, checked on open](tickets/46-wide-use-scanner.md) | sol | 11 |
| [47 Clean-up suggestions and Always keep](tickets/47-clean-up-suggestions.md) | sol | 46 |
| [48 Recently removed](tickets/48-recently-removed.md) | sol | 47, 40 |
| [49 The Media tab badge and the Always keep mark](tickets/49-media-tab-badge.md) | claude | 47 |
| [50 The Clean up review](tickets/50-clean-up-review.md) | claude | 48, 49 |
| [51 The Recently removed list; removing a used file warns](tickets/51-recently-removed-list.md) | claude | 48 |
| [52 Rename a file everywhere](tickets/52-rename-everywhere.md) | sol | 46, 06 |
| [53 Replace everywhere](tickets/53-replace-everywhere.md) | sol | 46, 48 |
| [54 Rename and Replace everywhere in details](tickets/54-rename-and-replace-in-details.md) | claude | 52, 53, 14 |
| [55 Agents remove, keep, restore, rename and replace](tickets/55-agents-tidy.md) | sol | 50, 51, 54, 45 |

### Phase 5: Video, audio and downloads

| Slice | Builder | Blocked by |
| --- | --- | --- |
| [56 The editor's security policy for media and video frames](tickets/56-media-security-policy.md) | sol | 01 |
| [57 Video preparation; GIF becomes a looping video](tickets/57-video-preparation.md) | sol | 23 |
| [58 Audio preparation; PDF first-page previews](tickets/58-audio-and-document-preparation.md) | sol | 23 |
| [59 Every kind in Media](tickets/59-every-kind-in-media.md) | claude | 57, 58, 12 |
| [60 Starter: the shared player](tickets/60-starter-player.md) | claude | – |
| [61 Starter: the YouTube and Vimeo layer](tickets/61-starter-online-video-layer.md) | claude | 60 |
| [62 Video, audio and download markup](tickets/62-player-markup.md) | sol | 60, 56, 33 |
| [63 Place every kind; Add panel Image becomes Media](tickets/63-place-every-kind.md) | claude | 59, 62, 18 |
| [64 Looping video per place, and section backgrounds](tickets/64-looping-video.md) | sol | 62, 38 |
| [65 The edit bar's play button](tickets/65-edit-bar-play.md) | claude | 62 |
| [66 Video details: still picture and subtitles](tickets/66-video-details.md) | claude | 59, 62 |
| [67 Online video records](tickets/67-online-video-records.md) | sol | 61, 62 |
| [68 Online videos in the picker and Media](tickets/68-online-videos-in-picker.md) | claude | 67, 63 |
| [69 Agents place video, loop, stills, subtitles](tickets/69-agents-video-audio.md) | sol | 64, 66, 68, 55 |

### Phase 6: Improve images

| Slice | Builder | Blocked by |
| --- | --- | --- |
| [70 Improve images: what would change, per page and component](tickets/70-improve-images-scan.md) | sol | 46, 35 |
| [71 Pictures from other websites](tickets/71-outside-pictures.md) | sol | 70 |
| [72 Heavy pictures get lighter files](tickets/72-improve-heavy-files.md) | sol | 70 |
| [73 GIFs and YouTube or Vimeo players](tickets/73-improve-gifs-and-players.md) | sol | 70, 57, 67 |
| [74 The Improve images screen](tickets/74-improve-images-screen.md) | claude | 71, 72, 73, 49 |
| [75 Agents run Improve images](tickets/75-agents-improve-images.md) | sol | 74, 69 |

### Phase 7: Sites in sub-folders (site-wide)

| Slice | Builder | Blocked by |
| --- | --- | --- |
| [76 The site's path prefix](tickets/76-site-path-prefix.md) | sol | 55, 69, 75 |
| [77 The canvas shows sub-folder sites](tickets/77-canvas-sub-folder.md) | sol | 76 |
| [78 Every root address follows the prefix](tickets/78-prefix-every-writer.md) | sol | 77 |
| [79 Change URL and redirects keep the sub-folder](tickets/79-prefix-change-url.md) | sol | 78 |
| [80 Changing the site address rewrites every address](tickets/80-change-site-address.md) | claude | 78, 79 |
| [81 GitHub Pages project sites, ADR 0001 and the rules](tickets/81-github-pages-and-rules.md) | sol | 80 |
| [82 Rewrite the media docs](tickets/82-media-docs.md) | sol | 81 |

## Finding the frontier

A slice is takeable when its ticket has `status: open`, an empty `assignee:`, and every ticket in `blocked_by` is `status: closed`. Take the lowest phase first, then the lowest number; slices on the frontier run in parallel, each in its own worktree, at most five Claude subagents at a time. Claim a slice by filling in `assignee:` before any work.

Once slice 01 has brought the runner tooling onto local `dev`:

```sh
node scripts/agents/tickets.mjs frontier media-manager   # open slices whose blockers are closed
node scripts/agents/tickets.mjs check                    # statuses and blocker slugs are valid
```

Before that, by hand:

```sh
D=/home/ubulex/Projects/native-site-editor-dev/docs/wayfinder/media-manager/build/tickets
grep -l '^status: open' "$D"/*.md | xargs grep -l '^assignee: *$'
```

At the start the frontier is [01](tickets/01-bring-dev-level.md) and the starter's [60](tickets/60-starter-player.md). Slice 60 may start early, but lands on the starter's `dev` only; nothing uses it until slice 62.

## Per-stage wrap-up

A stage is finished when every slice of its phase is closed and landed on `dev`. Then, straight away:

1. **Deploy** with `scripts/agents/deploy-preview.sh` (it runs `npm run deploy:preview` from `origin/dev`) and confirm the live build names the new `index-*.js`.
2. **One screenshot set** for the stage on the real starter site (`scripts/agents/shots.sh`), at computer and phone widths, published to Lex with `html_render`. This replaces the per-push screenshots for this build (Lex, decision 4). The shots per stage are listed in the [spec](spec.md#screenshots-and-phone-checks).
3. **Lex's phone list**, for stages that need it: a few things to try on an iPhone in the preview editor, sent with the screenshots. Lex answers in a sentence; problems become new slices.
4. **No pause.** The next phase continues at once. Lex steps in only if something looks wrong (decision 5). Slices of the next phase may already be running while a stage is wrapped up ★.

Phase 0 is invisible and gets no screenshot set of its own; its checks are the existing e2e specs.

## After the build

- Every ticket closed; the preview editor runs the last merge; nothing on `main`, production or the starter's `main` until Lex says ship.
- Close map ticket [14](../tickets/14-handoff-plan.md) and record the build in the map's Decisions.
- Follow-ups found during the build become new slices here, numbered from 83.
