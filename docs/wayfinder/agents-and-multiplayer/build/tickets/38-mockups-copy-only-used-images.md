---
title: "The preview mock-ups copy only images a mock-up uses"
type: task (AFK)
status: closed
assignee: am-38
builder: claude
blocked_by: [37-mockups-on-preview]
---

## Goal

Slice 37 (PR #246) copies every image in `docs/wayfinder/*/prototypes/` to the public preview site, including two no mock-up uses. One is a screenshot of a third-party product (`styling/prototypes/03-unblockwp-panel-reference.png`), now public at preview-editor.techies.tools/mockups/. Reference screenshots are for planning, not for publishing (lead, 2026-10-28, easy to undo; listed in the Tuesday pack).

## Decided behaviour

- `vite-mockups.ts` copies an image only when an HTML mock-up in the same map references it (`src`, `href`, `url(...)`, `srcset`), by its file name in the same folder.
- Unused images stay in the repo and are left out of the build; the next preview deploy removes the two from the site.
- Also fix ticket 37's two Done follow-ups (its missing `Commits:` line and review-round lines; the "byte-identical except `_headers`" wording).

## Files

- `vite-mockups.ts`, `tests/vite-mockups.test.ts`
- `docs/wayfinder/agents-and-multiplayer/build/tickets/37-mockups-on-preview.md` (Done only)

## Done when

- A test with a used and an unused image in one map copies only the used one; fails before the fix.
- After `kit preview`, `/mockups/styling/03-unblockwp-panel-reference.png` answers 404, and every mock-up still loads its images (the existing browser check over all real mock-ups passes).
- `kit unit --affected`, `npm run check`, lint pass.

## Kit commands and evidence

`kit doctor`, `kit slice --ticket <this> --builder claude-opus-5-5`, `kit unit --affected`, `kit review`, `kit pr`, `kit preview`; report the RESULT lines and the 404 check.

## Done (2026-10-28)

- `vite-mockups.ts`: `mockupFiles` still lists every HTML mock-up, but an image beside them only when an HTML mock-up in the same map points at it by file name (`src`, `href`, `poster`, `srcset`, `imagesrcset` and `url(...)`, quoted, backticked or bare, any attribute case, `data-src` too; `&amp;`-style and `%20`-style escapes decoded, `./`, query and fragment ignored; file names match in exact case, like Cloudflare's asset paths; paths into other folders and references inside HTML comments don't count, while a `<!--` inside a script or style is not a comment). Not counted, and named in the module comment: CSS `image-set("a.png" 1x)` without `url()`, and paths a script builds. Unused images stay in the repo and out of the build. No real mock-up uses an image today, so both reference images (`styling/…/03-unblockwp-panel-reference.png`, `agents-and-multiplayer/…/12-caret-circle-reference.png`) leave `/mockups/` at the next preview deploy.
- Tests (`tests/vite-mockups.test.ts`): `referencedFiles` over every reference form, escapes, comments (including a script holding `"<!--"`, which failed with a whole-file comment strip) and the uncounted `image-set`; a Vite build of a map with a used image, one named only in notes and the map file, one used only from another map and `photo.png` referenced as `Photo.PNG` copies only the used one (failed on the old code, which copied every image). A browser test builds that map with the real `_headers`, serves it through Cloudflare's asset handler and opens the mock-up: its copied 1×1 PNG answers 200 and renders under the sandboxed policy with no policy violation, and the other map's image answers 404. The browser check over all real mock-ups now also fails on any image request that errors or answers non-2xx, and asserts on the built site that `/mockups/styling/03-unblockwp-panel-reference.png` answers 404 and the caret reference no longer loads.
- Ticket 37's Done: `Commits:` line, one line per review round, and the `_headers` exception in the byte-identical sentence.
- Review round 1 fixed: ticket 37's follow-up quote restored and its fixed follow-ups marked; test comment order; a test that images named only in notes or the map file stay out. Declined: none.
- Review round 2 fixed: this Done section's commit list and round line; `&amp;`-style escapes in references; a browser test that a mock-up loads an image the plugin copied, replacing the stand-in `probe.png`; upper-case, `data-src` and spaced `url()` cases. Also taken from its optional notes: references in HTML comments don't count, one doc comment per pattern, and a comment that the real-content 404 check is a deliberate guard. Declined: none.
- `RESULT: ok unit 12/12 (1 files)`; `RESULT: ok specs none affected`; `npm run check` and `npm run lint` exit 0.
- `kit preview` not run here (lead's step); the 404 for `/mockups/styling/03-unblockwp-panel-reference.png` is shown locally by the browser check.
- Feature list: no change (planning pages on the preview site, not an editor feature).
- Commits: "The preview mock-ups copy only images a mock-up uses", "Review fixes round 1", "Review fixes round 2", "Review fixes round 3", "docs: 38-mockups-copy-only-used-images commits by subject" and this commit.

### Follow-ups

- Spec (P3): 3d88d32b5:docs/wayfinder/agents-and-multiplayer/build/tickets/38-mockups-copy-only-used-images.md:45 — P3 ticket: The branch has four commits, and the last is "Review fixes round 3" (commits.log:1). The `Commits:` line names only three. The Done section has review lines for rounds 1 and 2 (lines 40–41) and nothing for round 3. runner.md:67 says the Done section must list "behaviour, commits, tests, review decisions, evidence". `kit pr` rewrites the commit list, so the missing subject fixes itself. The missing round-3 decisions do not, and the evidence line `RESULT: ok unit 12/12` may come from before round 3. Fix: add "Review fixes round 3" to the `Commits:` line. Add a "Review round 3 fixed: …; Declined: …" line. Re-run `kit unit --affected` and record its RESULT line.
- Standards (P3): 56b4bf7bd:vite-mockups.ts:273 — P3 fault: No CODING_STANDARDS.md section covers build plugins, so this is a plain correctness fault. `decodeCharacters` runs on every match, including matches inside `<script>` and `<style>`. Browsers don't decode HTML entities in that raw text. Take `<script>img.src = "a&amp;b.png"</script>`. The browser requests the literal `a&amp;b.png`, but the plugin counts `a&b.png`. If both files exist, it publishes the wrong one and leaves out the one the mock-up loads. The same holds for `url(p&amp;q.png)` inside `<style>`. The impact is tiny, since no real mock-up uses an image today. Fix: decode only matches outside script and style elements. You could reuse the split that comment-stripping already does: tag spans inside script/style and skip `decodeCharacters` for them.
- Validation gaps (gap): tests/vite-mockups.test.ts: the `referencedFiles` case only tests entities in attribute values. No test covers an entity inside a `<script>` string or a `<style>` `url()`. Add `<script>img.src = "s&amp;t.png"</script><style>i{background:url(u&amp;v.png)}</style>` to the fixture. Assert the set holds `s&amp;t.png` and `u&amp;v.png`, not `s&t.png` and `u&v.png`. This pins the fix for the defect above.

