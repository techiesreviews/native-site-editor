# Refined Media mockup — validation

Validated locally on 11 October 2026. The implementation owns `refined.html` and this record. The first-round `directions.html`, its demo images and downloaded reference screenshots remain unchanged as research assets. No production code, commit, push or deployment was made.

Validated HTML SHA256: `59a90d112f693761d6d7650a60e0571deb1378faf14643a7cdef16b7ce0447a7`.

## Confirmed choices

- Collections is the chosen basis. Collections browse like folders; a file can belong to several collections without extra copies. Collection names in the mockup are examples. File details use membership checkboxes; bulk Add to… adds memberships. Remove from collection keeps the file in All media. Physical media storage paths are outside this flow.
- Media replaces Images in the editor. Images, video, audio, PDFs and other downloads belong in Media; Files shows the website’s other files. Pages / Media / Files tabs work, and Files offers read-only HTML/CSS/JavaScript sample previews.
- A collection opens in the picture grid, with a switch to the list showing size and usage. All media includes files with no collection.
- Search remains visible. All / Images / Video / Audio / Documents buttons select kinds; main Documents includes PDFs and other downloads. Extra collection and usage filters sit under Filters, using the same structure on desktop and phone.
- Grid thumbnails carry a numbered usage badge. Hover or keyboard focus expands its text; clicking or tapping opens usage text and page names. Counts are distinct pages, not collection memberships. The list retains usage text.
- A checked file with zero page and other uses expands to No uses found; that filter finds those files. Zero pages with other uses explicitly says Other uses found. Newly added files show ? / Not checked yet and are excluded from No uses found. Usage dialogs and details identify the sample check scope and warn that some uses may be missed.
- Choosing media uses the same collections, search, views and media data in a smaller desktop window and a full-screen phone picker. The target restricts selectable kinds: an image place accepts images, a PDF download accepts PDFs. Add files returns an actually added compatible file selected. Use confirms the choice and returns to the page preview.

Phone and tablet visual feedback remains for Lex to assess. Production choices about keeping originals, real processing, scanner completeness and removal/restoration policies remain undecided. Upload progress, savings, check results, removal and Undo are demonstrations.

## Independent source review and fixes

The lead ran a source-only review with Claude CLI, `claude-opus-5-5 --effort medium`, on immutable snapshot `f3604a65e80d8d67f30a4cc11a007820866d40957932da21b4c9922556d14515`. The reported model usage confirmed Opus. The reviewer did not render the prototype.

All five reported defects were reproduced before changes:

- Selecting a file reset picker scroll from 300 to 0.
- After choosing Orange Orbit, Replace followed by Escape removed the chosen page preview.
- When the image succeeded and the unrelated PDF failed, Back to choosing was absent.
- The PDF-only picker said Documents included other downloads.
- A filtered file result still used the Your collections heading.

The fixes preserve picker scroll and the focused control through selection/filter updates within the same view and a child usage dialog. Closing usage returns focus to its badge. Replace Cancel, Close and Escape preserve the current image and return focus to Replace. A successful compatible image can be chosen while the failed PDF remains accessible for Retry; failed files are not selectable. PDF-only help matches its target. Search/kind results have Search results / All media headings and a working collection-home breadcrumb; clearing filters restores the home.

### Focused follow-up review

The lead’s second read-only Claude CLI review used `claude-opus-5-5 --effort medium` on immutable snapshot `4503cb6717505a3ff5210177ee560c4ad946e0a7db9f8e277233f04652688fd8`. It completed with exit 0, `is_error: false`, and model usage matching the requested Opus pin. The five fixes above were acknowledged; one remaining collection-navigation defect was reported. This was a source review, not a rendered inspection.

Before the final change, a 360 × 700 px browser reproduced collection navigation keeping old scroll: opening Archive from the bottom of collection home changed scroll from 349 to 308 and focused Close media picker. The picker now identifies the library scope as collection home, All media or the named collection. Entering another scope starts at scroll 0 and focuses its heading; updates within the same scope keep scroll and the active control.

A focused inline Node/Playwright runner (`node` with a heredoc; no temporary runner file) passed at 360 × 700 px. Home → Archive, Archive → All collections, scrolled home → All media and scrolled All media → All collections each ended at scroll 0 with `library-title` focus and the correct heading. Selecting Pink Study retained scroll 537 and checkbox focus. Opening usage and closing it with Escape retained scroll 537 and returned focus to its badge. There was no horizontal overflow or browser page error; Node `vm.Script` accepted the inline script. The browser was closed in `finally`. A first runner assertion compared an untrimmed CSS class string and was corrected to check `classList`; no implementation change was needed for that assertion.

## Browser verification

Used local Node runners with `require('playwright')` and `chromium.launch({headless:true})`, opening the HTML through `file://`. Exact final commands were `node /tmp/media-refined-verification.cjs` and `node /tmp/media-refined-review-fixes.cjs`; both exited 0. The temporary runners were removed after their results were recorded. Earlier runner selectors were corrected separately from the reproduced implementation defects above.

Passed checks:

- At 360, 768 and 1200 px: actual picker opening, phone full width / desktop smaller width, target context, collection home, applicable images, grid/list, nested usage dialog, choice confirmation and return to Pages, PDF-only selection, main Media return, hover labels, other-use dialog and no horizontal overflow in the library, picker or result.
- At 360 px with picker scroll greater than zero: selection keeps scroll and control focus; opening/closing usage keeps scroll and returns badge focus.
- Orange Orbit stays selected after Replace Cancel, Close and Escape. All three return focus to Replace.
- Mixed sample upload progress and Retry work. A successful image can return selected before the unrelated PDF is retried; the failed file remains reachable and is not selectable.
- New uploaded files show ? and Not checked yet, then can be placed. The manager and picker share the same ten unique media records after adding two samples.
- Multiple memberships save without copies. Removing a membership keeps the file; a file with no memberships remains in All media. Clean up covers the whole library and excludes unchecked additions from No uses found.
- Usage dialogs show page names, other uses and check status. Escape and 44 px Close controls work. Grid usage is not duplicated as permanent card text. Details, responsive-copy disclosure, sample removal/Undo, type and extra filters continue to work.
- No browser page errors occurred. Script syntax passed Node’s `vm.Script`; the HTML has no trailing whitespace.

The lead independently verified a two-column grid at 360 px and three columns at 768 px, a 360 × 900 px full-screen picker and a 728 px picker at 768 px, with no horizontal overflow or page error. The lead visually viewed the demo images; after expanding Inspiration, all six downloaded references loaded. These observations precede the final navigation-only fix; the final focused check above covers that change.

All browsers launched by the implementation worker were closed. No server was started. Images retain complete absolute local path literals for the publication tool to inline.

## Final publication

The lead independently checked the final navigation correction at 360 × 700 px: Archive, the collection home and All media each start at scroll 0 with the new heading focused. No picker overflow or page errors occurred. The browser was closed.

T3's `html_preview` was attempted with the final HTML but returned the same host AppArmor sandbox error recorded for the first comparison. Local Playwright supplied rendered checks instead; the host configuration was not changed.

The final HTML was published with `html_render`, title **Media manager: refined Collections**, height 1300, in thread `492d7080-d465-4710-96fd-0516aedb90b7`, attachment `492d7080-d465-4710-96fd-0516aedb90b7-28a968f2-73cb-462c-bc2b-39e9929c3c71-html`. This publishes a planning artifact in the conversation; it does not deploy the editor. Lex's small-screen reaction remains pending.

The final navigation check created no new temporary files or screenshots and started no server. The HTML is frozen at the SHA above for the lead’s final focused review. Publication IDs will be recorded by the lead.
