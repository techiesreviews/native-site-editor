# Cloudflare preview alias length correction

The integration-update branch `astro-editor/update-integration-46bfa9881990` failed in [GitHub Actions run 35782129122](https://github.com/techiesreviews/astro-editor-starter/actions/runs/35782129122). Astro compilation succeeded, but Cloudflare rejected the preview upload with error 10021, “Alias name too long.”

The normalized alias has 44 characters and the Worker name `astro-editor-starter` has 20. Including the separating dash gives a 65-character DNS label. [Cloudflare documents a maximum of 63 characters for the combined label](https://developers.cloudflare.com/workers/versions-and-deployments/preview-urls/). The previous workflow truncated only the alias at 63 characters, and the editor and draft-preview server repeated that calculation independently.

The correction must keep all three consumers on one deterministic naming implementation. Short valid aliases retain their existing URLs; long aliases fit the Worker-specific budget and retain a stable branch-derived suffix to avoid collisions between branches that share the same long prefix. The deployed repository needs both the helper and the workflow change in the same commit. Existing canonical workflows remain recognized during migration.

This fixes the concrete branch-preview upload error. The user’s separate report of a frozen preview after duplicating a formatted button remains unresolved; existing short generated draft branch names fit the length budget. See the original checkout’s `memory/handoffs/structural-preview-reset.md` for that investigation and the rollback history.

## Local validation

The shared helper uses the existing short-name normalization and a 64-bit FNV-1a suffix over the full branch name for long aliases. The failed branch now maps to `astro-editor-update-integ-6d8a9f1d24b15313`, giving a 63-character combined hostname label. Worker names remain limited to the editor's supported 24 characters.

All 117 unit tests pass, including boundary cases, the exact failed name, same-prefix branches, unchanged short URLs, the actual workflow command, legacy-workflow compatibility, and integration bundle checks. Both browser preview tests pass, including the iframe URL for a long branch. TypeScript, UI release build, and Worker dry-run pass. Browser verification used temporary port 8788 to avoid an existing service; the temporary configuration was removed. The new helper files are included in the generated managed integration bundle.

## Deployed verification (22 September 2026)

Editor source commit `7d5ca0b` was deployed with browser structural preview enabled as Cloudflare version `652a1990-212a-478a-af48-6e515c9f461e`. The served `/assets/index-TYK7w94G.js` SHA-256 matches the local release: `2301c896ec243060e86b6f10fabdf6e085f0efe5aac56dea6c1f5c6697a3eab7`.

Starter main commit `3646379e71afe9a5844d17a9449fbdee215e0050` atomically updates only the preview workflow and the two alias helper files. The annotation rollback remains intact; user source and drafts were preserved. The signed-in editor integration endpoint reports every managed file current. [Main run 35785676981](https://github.com/techiesreviews/astro-editor-starter/actions/runs/35785676981) passed, and the main preview revision endpoint returned the new SHA.

Temporary branch `astro-editor/verify-preview-alias-limit-20260922` passed [run 35785724546](https://github.com/techiesreviews/astro-editor-starter/actions/runs/35785724546), including Upload preview version. Its alias is `astro-editor-verify-previ-9b9edb006076bb4a`; combined with the Worker name and dash, the label is exactly 63 characters. Its revision endpoint returned HTTP 200 with the expected SHA and branch. After verification, the branch was deleted and its absence checked. No permanent feature branch was created.

The fix remains in the detached browser-proof worktree, retained by `archive/2026-09-22/preview-alias-limit-fix`. The separate live button-duplication freeze still requires diagnosis.
