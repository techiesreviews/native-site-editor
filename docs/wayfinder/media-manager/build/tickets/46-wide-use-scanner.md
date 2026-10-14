---
title: The wide use scanner, checked on open
type: task (AFK)
status: closed
assignee: claude (mm-46 runner)
blocked_by: [11-usage-records]
builder: sol
phase: 4
---

## What

Ticket [10](../../tickets/10-safe-clean-up.md#resolution-2026-10-13) "What counts as used"; research 04 §4 and 05 §5. Today Delete unused reads `.html` and `.css` only (`src/page-builder/media-workspace.ts:81`, `media-references.ts:132-170`).

- A file counts as used if its name or address appears in any text file: pages, styles, component templates, sharing tags (full addresses on the site's own domain), scripts, `sitemap.xml`, feeds, JSON and other data files, `_redirects`/`_headers`, notes such as `AGENTS.md`; also `srcset`, `data-src`, `imagesrcset`. Template-relative addresses resolve as the browser does.
- Details list where each mention was found.
- The editor checks by itself when a site opens; files not yet reached show **Not checked yet** and are never suggested; any unreadable file stops all suggestions.
- Feeds slice 11's usage records, so badges get the wider reach.

## Done when

- `tests/media-references.test.ts` extended: each file kind, full own-domain addresses, a sitemap and feed, JSON-LD, a script string, `_redirects`, unreadable file.
- `native-asset-references.spec.ts` updated: an image used only as a full `og:image` address is not unused.
- Full suite green.

## Done (2026-10-14)

- **Behaviour.** A media file now counts as used when its name or address appears in any site text file. New pure module `src/page-builder/media-mentions.ts`: `isMediaTextFile` (everything but known binary formats; SVG is text; `node_modules/`, `.git/` and `.editor/media.json` skipped) and `mediaMentions`, a lenient raw search over every text file, HTML and CSS included (inline scripts, JSON-LD, comments, code samples count). It handles JSON `\/`, percent-encoding, query and hash, entities in HTML/XML/SVG, dot segments, and names holding spaces, parentheses or commas, with name boundaries (`1.png` is not `21.png`). A bare name counts for every file of that name; a path counts as a suffix at a `/`. Full addresses count only on the site's own host (`src/page-builder/media-origins.ts`: the Site settings address plus a root `CNAME`, `www.` and scheme ignored); with no known address, a full address counts (prefer keeping). Where found: `script`, `data`, `feed`, `notes`, `settings` (`_redirects`, `_headers`, `CNAME`, `.editor/`), `sharing` (JSON-LD and full-address sharing tags), `stylesheet`, `component`, `file`. The structured scanner also reads `data-src`, `data-srcset`, `imagesrcset`, `<object data>` and `xlink:href` (renames rewrite these too), resolves own-domain full addresses for usage only (rewrites unchanged), and resolves relative addresses in component templates against the page using them. `mediaUsageRecords` gains `files`, `site`, `reach: "text"` and `pending`: a text file not read yet leaves every family Not checked yet while keeping uses found so far; an unreadable file still blocks everything. **Checked on open**: `src/controllers/media-usage-controller.ts`, loaded on demand after the site's text index settles, reads the remaining text files in batches of 12 and publishes records after each batch (`usageRecords()`, `onUsageChange()` on the media controller, for slices 12/47/49). It restarts when the repository, branch or commit changes, re-runs after a 400 ms pause in draft changes, and an edit stops an in-flight check from publishing. The Images library's Delete unused and the Files tab's delete use the wide reach; renames still rewrite only HTML and CSS (slice 52). Usage text lives in its own memory (`mediaTextSource` in `main.ts`), outside the preview's sources and `nativeEffectiveSource`. Uploaded or moved SVGs are read from their bytes and proved by their revisions.
- **Commits.** 740b0837 claim; 853d77aa build (Sol, with Claude fixes for names holding separators and refresh flicker/debounce); 71aa32da first-review fixes; 0c0127a6 second-review fixes; 225ac6bf full-suite fixes (usage text out of `nativeEffectiveSource`; stale Files delete falls through to the guarded refusal).
- **Tests.** New `tests/media-mentions.test.ts` (every file kind, escapes, boundaries, separators, entities, dot segments, own origins, skipped paths) and `tests/media-usage-controller.test.ts` (waits for the index, pending shrinks to checked, repository change, unreadable blocks, coalescing, edit during a read, replaced bytes reread, dispose). Extended `media-references` (new attributes, own-domain usage only, template-relative), `media-usage` (wide kinds, `reach`, pending, full `og:image`), `media-workspace` (wide Delete unused, rename stays HTML/CSS, uploaded SVG proved by revision), `media-controller` (uploaded SVG read from storage), `asset-references`. `native-asset-references.spec.ts`: an image used only as a full `og:image` address on the site's domain is refused for deletion, naming the page. `npm run check`, `npm run lint`, unit 2372/2372. Full suite on 853d77aa: 884 passed, 11 failed (all from this slice: usage text in `nativeEffectiveSource`, and the stale Files-delete path); after 225ac6bf the full suite passed 895, failed 0.
- **Review (GPT-6.1 Sol).** First review: 4 fixed (XML entities in sitemaps/feeds; dot segments inside addresses; an unsaved uploaded SVG broke the library load; a draft edit during reads could publish a stale checked result). 1 rejected: "records never reach the UI": wiring usage into badges and Not checked yet is slice 12 by plan (slice 11 likewise left records unwired). Second review: 3 fixed (an uploaded SVG made other image renames fail its source guard, now proved by revision; the check's private cache kept a replaced upload's old bytes, now removed; the Files delete now proves uploaded/moved files' revisions through confirmation). No dedicated browser test for the last one; the guard is a one-line revision comparison.
- **Bytes.** First-paint budget 345 KB of 355 KB (slice 11 recorded 341: +4 KB, the on-open wiring in the boot code); the scanner and check load on demand.
