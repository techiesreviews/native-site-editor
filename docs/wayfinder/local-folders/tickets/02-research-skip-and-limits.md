---
title: Research what to skip and how big a folder can be
type: research (AFK)
status: closed
assignee: claude (research subagent)
blocked_by: []
---

## Question

Which files should a folder project leave out, and what limits are sensible? Propose a default skip list (`.git/`, `node_modules/`, build caches, OS files such as `.DS_Store`, editor folders) and decide how `.gitignore` is honoured: root only or nested, negation rules, a small parser or a library (size), and what the editor does with a file that is ignored but linked from a page. Which hidden files must never be read or sent anywhere (`.env*`, keys)? How long does listing and fingerprinting (git blob SHA-1 via Web Crypto) take in the browser for 100, 1,000 and 10,000 files, and can fingerprints be computed lazily (size plus `lastModified` first)? Measure on `~/Projects/techies-reviews` (118 pages, 191 images) and `~/Projects/native-site-editor-starter`, and on a synthetic large folder. Compare with today's limits (1 MB text files, 5000 drafts, the media manager's 20 MB per file) and recommend a file-count cap, a per-file size cap and what the user sees when a folder exceeds them.

## Resolution (2026-10-13)

Full findings: branch `research/lf-02-skip-and-limits` (commit 192d9895), file `docs/wayfinder/local-folders/research/02-skip-and-limits.md`. Speeds measured in headless Chromium with OPFS standing in for a real folder (held in RAM on a fast laptop), so a first open from disk will be slower.

1. **Skipped folders, by name at any depth:** `.git`, `node_modules`, `.wrangler` and tool caches (`.next`, `.astro`, `.vercel`), editor folders (`.idea`, `.vscode`), OS folders. Never `dist`, `build` or `out` by name: in a no-build site they can be real folders; `.gitignore` covers them when they are build output.
2. **Skipped files:** OS and editor junk (`.DS_Store`, `._*`, `Thumbs.db`, `desktop.ini`, `*.swp`, `*~`) and Chrome's `*.crswap` swap files, so a save in progress is not taken for an outside change (that name is from third-party sources, not the spec).
3. **Secrets are never read, listed, previewed, sent or overwritten:** `.env*`, `.dev.vars*`, `*.pem`, `*.key`, `id_*`, `.npmrc`, `.netrc`, `.git-credentials`, `.htpasswd` and the like, plus `.ssh/`, `.aws/`, `.gnupg/`. This wins over `.gitignore` exceptions, page links and agent requests.
4. **`.gitignore` as git reads it:** the root file, nested ones and `.git/info/exclude`; ignored folders are not entered. `.assetsignore` is not honoured.
5. **The `ignore` package** (v7.0.12, about 4 KB gzipped, MIT, tested against git), loaded only for folder projects.
6. **An ignored file linked from a page** is not listed or sent to agents; the preview still shows it and a site check warns that it will not reach GitHub or the live site.
7. **Lazy fingerprints:** opening lists size and date; texts are fingerprinted when read, other files later; a cache of size, date and fingerprint makes a reopen re-check only changed files. Save always re-checks a file before overwriting or deleting it.
8. **Speed:** fingerprints matched git for every file (357/357, 46/46). Starter 10 ms; techies-reviews 131 ms (about 0.5 s on a 4× slower CPU); 100 / 1,000 / 10,000 files: 32 ms / 0.34 s / 3.0 s; reopen 24 ms for techies-reviews, 1.0–1.4 s for 10,000 files; 16 reads at once are 2.5–3× faster than one at a time.
9. **Caps:** 10,000 files (the walk stops at 20,000 entries and asks "Is this your site's own folder?"); 1 MB per text file as today; 20 MiB per file read as bytes, as the media manager. Bigger files are listed but not opened; the folder still opens.
