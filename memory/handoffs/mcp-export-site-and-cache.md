# Handoff: MCP reads without hammering GitHub (2026-09-28)

## Why
On 2026-09-28 an agent audited the whole techiesreviews/techies-reviews site through the Native Site Editor MCP: ~250 `read_file` calls, 8 in parallel. Every non-draft read goes from the worker to GitHub's `git/blobs/<sha>` as Lex's account, uncached (`worker/github.ts` ~L288, called via `files.read` in `worker/mcp.ts` `read_file` ~L309). GitHub's secondary rate limit tripped: the editor itself then failed for Lex (browser console "Failed to load resource: 500", MCP answered HTTP 429). The hourly core budget was untouched (1/5000); it was the burst limit.

## Objective
1. **Blob cache in the worker:** cache blob contents by git SHA (immutable, so cache permanently, e.g. Cache API or KV keyed repo+sha). Repeated reads cost no GitHub request, with or without an open tab.
2. **`export_site` MCP tool:** queued to the editor tab like edits. The tab answers once with every text file it holds (pages, components, CSS, JS, SVG, config), drafts applied, each with the content hash `edit_file` expects; binaries listed by path + SHA only. Files the tab doesn't hold fall back to the batched blob read (through the cache). Building blocks already exist: `nativeSources()` in `src/main.ts` (~L1588: every page, template and stylesheet with drafts applied) and `collectSiteFiles` in `src/site-download.ts` (held text first, `readTexts` batch for the rest).
3. **Clear rate-limit errors:** a GitHub 403/429 rate-limit answer must reach the user as a readable message ("GitHub is limiting requests, try again in a few minutes; your drafts are kept"), never a bare 500. Check `worker/github.ts` error mapping (~L110-150) and wherever an uncaught error becomes 500.
4. **Optional, second:** a preview-inspection MCP tool (computed styles / measured contrast / screenshot of an element in the editor's preview), so colour and layout checks don't need a local mirror of the site.

## Acceptance
- A whole-site read via `export_site` makes zero GitHub requests when the tab holds the files, and at most a few batched ones otherwise.
- Reading the same file twice through `read_file` makes one GitHub request at most.
- Hashes from `export_site` are accepted by `edit_file` / `write_file`.
- A simulated GitHub rate-limit response yields the readable message, not 500.
- Tests added next to the existing ones (`tests/github.test.ts`, `tests/mcp-harness.ts`, `tests/publish.test.ts`); typecheck and tests pass.
- Update `worker/site-conventions.ts` MCP instructions so agents prefer `export_site` for broad reads and never read in parallel bursts.

## Constraints
- Work on a branch, not main; don't deploy; leave it for Lex's review.
- The working tree already has Lex's uncommitted work: `M src/components/page-structure.ts`, untracked `docs/references/popmelt.md` and `memory/`. Preserve them; don't commit them.
- Tab-dependent tools must say clearly when no editor tab is connected or visible (edits already queue and poll every 2 s while the tab is visible).
- Keep secrets (MCP tokens, GitHub tokens) out of files and logs.

## Status (2026-09-28, branch `mcp-export-site-and-cache`, not deployed)
- Done: `worker/blob-cache.ts` (isolate LRU + named Cache API `github-objects`, keyed `<repoId>/blob|tree|commit-tree/<sha>`); `GitHub.file/raw/files/commitTree/snapshot` go through it. A repeat `read_file` now costs no blob/tree/commit request.
- Done: `export_site` MCP tool, computed in the worker (`SiteFiles.export`), not queued to the tab: tree + drafts from the hub's draft store + blobs through the cache (4 at a time). The tab's own reads warm the same cache, so a tab that holds the files means cache hits. Deviation from the plan: no tab round trip, so it also works while the tab is hidden and nothing multi-MB passes through the Durable Object. Text budget 4 MB per call; the rest is listed in `omitted`.
- Done: rate limits. A secondary limit (403 whose message alone says "rate limit"), `retry-after`, or `x-ratelimit-remaining: 0` becomes 429 "GitHub is limiting requests from your account for now. Try again in …; your drafts are kept." A fetch that fails becomes 502, not 500.
- Open for Lex: `authenticateAgent` still re-lists installations and repositories (2 GitHub requests) on every MCP call by design ("agents never do" reuse). Reusing the listing for ~30-60 s, as editor reads do (`readAuthorizationMaxAge`), would remove most of what's left; it's a security-policy call, and `tests/mcp-runtime.test.ts` asserts immediate revocation.
- Not started: optional preview-inspection tool.

## Status 2026-09-28 (later)

Merged to main (fast-forward) and deployed. Since then, on main and deployed:
- 6444fae: MCP calls reuse the installation listing for 60 s; a repo missing from the reused listing is looked up again.
- 0c440c1: export_site reads saved texts via GitHub GraphQL, 100 blobs per query. The first live whole-site export hit the Worker's "Too many subrequests" limit (probably the Free plan's 50). Checked live on techiesreviews/techies-reviews: 199 texts and 158 binaries in one call, about 3 s.
- ba659f7: inspect_preview measures elements in the editor preview: box, computed styles, rules and contrast. Not yet called live; the tab needs a reload.
