# Preview proof: GitHub Actions builds on Cloudflare Workers static assets

Proof date: 2026-09-18. Ticket: [Prove a static Astro starter previews faithfully in the browser](../../.scratch/astro-editor-feasibility/issues/05-preview-proof.md). Lex chose this free route instead of Cloudflare Sandbox/Containers, which need Workers Paid.

## Verdict

**A faithful static preview is feasible on the Free plan without executing repository code in the editor.** The repository's own `astro build` runs in GitHub Actions; each pushed branch is uploaded as a Cloudflare Worker static-assets *version* with a preview alias named after the branch, and the default branch is also deployed as the live site. The preview and the live site are the same artifact type served by the same platform, so at the same revision they matched pixel-for-pixel in every tested case. Cost: nothing measurable — GitHub Actions minutes (free for this private repository within its monthly allowance) and Workers Free requests.

The limitation is latency and granularity: a preview exists only for **committed** revisions, roughly 45–80 seconds after a push (76 s measured). Unpublished drafts in the editor are not previewed on this route; a draft preview would need a commit to a preview branch or a different execution path.

## What was built

- Starter changes, now on `main` of `techiesreviews/astro-editor-starter` (mirrored in `fixtures/astro-starter`): a Preact counter island (`client:load`), an SVG from `public/`, and a PNG processed by `astro:assets`. The site still builds and runs with `astro` alone.
- Editor-owned files in the repository: `.astro-editor/wrangler.jsonc` (static assets Worker, no script), `.astro-editor/preview.json` (where the editor finds the preview), `.astro-editor/stamp-build.mjs` (writes `dist/.astro-editor/revision.json` plus a `_headers` CORS rule for that file), and `.github/workflows/astro-editor-preview.yml` (build, stamp, `wrangler versions upload --preview-alias <branch>`, and `wrangler deploy` on the default branch). The workflow must live under `.github/workflows`; everything else is in one removable directory. The directory name is still a placeholder.
- Editor: a **Preview** toggle splits the workspace with an iframe of `https://<branch-alias>-<worker>.<subdomain>` at the route of the open page. It fetches the preview's `revision.json` and states whether the build matches the branch head, polling every 10 s while a build is pending. Desktop/tablet/phone widths, an open-in-tab link and a live-site link are included. The editor's CSP now allows `https://*.workers.dev` for frames and that one fetch. Browser test: `tests/browser/preview.spec.ts`.

## Measurements

| Step | Measured |
| --- | --- |
| `astro build` of the starter (devbox, warm node_modules) | 1.8 s |
| `wrangler versions upload` (10 assets) | 8–10 s |
| Alias serving the new revision after upload | < 1 s |
| Cold request to an alias not requested recently | 0.5 s TTFB; first full page load 1.8 s |
| Warm page loads (both origins, three widths) | 0.6–0.9 s |
| GitHub Actions: push → checkout, setup-node, `npm ci`, build, stamp | ≈ 30 s (first run, no npm cache) |
| Push → preview available (Actions + upload), measured end to end | **76 s** (pushed 13:20:43 UTC, run queued 3 s later, upload finished 13:21:26, alias served the new revision at 13:21:59 as observed by 3 s polling) |

The full Actions path ran once the token secret existed: every step succeeded and the live site stayed at its previous revision. Roughly half the 76 s is GitHub queueing, checkout and `npm ci`; the deploy step itself is about 10 s.

## Fidelity

`.scratch/preview-proof/compare.mjs` loads `/` and `/about/` at 1280, 820 and 390 px on both the branch alias and the live deploy at the same revision (`ad773a6`), clicks the island twice, checks that every `<img>` decoded, records failed requests, and pixel-compares full-page screenshots.

- 6/6 comparisons: **0 differing pixels**, identical page sizes.
- Island hydrated and counted to 2 on both origins at every width.
- SVG (`public/`) and the `astro:assets` WebP output loaded on both.
- No failed or 4xx/5xx requests.
- After a second commit changed the home heading and re-uploaded the alias, the alias served the new heading immediately while the live site kept the old one: branch previews do not touch the live site.

Rendering differences would come from data or environment, not the host: no SSR, external data, cookies or domain-dependent URLs were involved. Sites that use `site`/absolute URLs will show the alias hostname in canonical links and sitemaps; that is expected.

## Sleep and recovery

Not applicable. Static asset versions are stored, not run; there is no container to sleep. Aliases persisted across the session and served after idle periods with a ≈0.5 s cold TTFB. Old versions accumulate (Cloudflare keeps a bounded history per Worker); aliases always point at the newest upload for that name.

## Limits and follow-ups

- **Drafts are not previewed.** Only commits are built. Either auto-commit drafts to a preview branch (adds ≈45 s per change and Git noise) or revisit in-browser building for literal edits. This shapes ticket 07.
- **Bootstrapping:** the Worker must exist before `versions upload` works. The first run must deploy (push to the default branch) or someone runs `wrangler deploy` once; the workflow orders steps for that.
- **Secrets and permissions:** the repository needs `CLOUDFLARE_API_TOKEN` (Workers Scripts edit) and `CLOUDFLARE_ACCOUNT_ID`. A token in a user's repository is under that user's control; the editor never sees it.
- **Preview URLs are public.** Aliases are predictable (`<branch>-<worker>.<subdomain>`), so a private repository's preview is reachable by anyone who guesses the branch and Worker name. Acceptable for this proof; a real feature needs Cloudflare Access (free for a small number of users) or a signed preview cookie.
- **CSP wildcard:** `https://*.workers.dev` is broad; a configured origin list would replace it.
- **Cache visibility:** the Playwright browser test only stubs the network; the deployed comparison lives in the throwaway script.
- **Not tested:** SSR/adapters, framework integrations beyond Preact, native dependencies, monorepos, `base` paths, branch names longer than 63 characters after sanitising, and Actions minute usage under many pushes.
