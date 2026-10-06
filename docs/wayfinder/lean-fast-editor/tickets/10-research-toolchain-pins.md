---
title: Research the toolchain pins
type: research (AFK)
status: closed
assignee: claude (research subagent)
blocked_by: []
---

## Question

What should each pinned or duplicated tool be?
- Is there a stable Miniflare release to replace the exact alpha pin `5.20261001.0-alpha` (used by 5 test files)?
- Should Node be 24 everywhere? Today `.node-version`, `@types/node` and `engines` say 22, while CI uses 24.
- Can the sealed box for GitHub secrets (`worker/sealed-box.ts`, built on tweetnacl and blakejs) use WebCrypto X25519 in Workers, and can the tests drop `libsodium-wrappers`?
- Is the exact `esbuild` pin and the `undici`/`dompurify` overrides still needed?

## Resolution (2026-10-06)

Full findings: branch `research/10-toolchain-pins` (commit cabcefa), file `docs/wayfinder/lean-fast-editor/research/10-toolchain-pins.md`.

1. Miniflare: no stable 5.x exists. npm `latest` is this alpha, and Wrangler pins the same exact version. Keep the exact pin and always bump it together with Wrangler.
2. Node 24 everywhere (`.node-version`, `engines`, `@types/node ^24`). Node 22 is in Maintenance and reaches end of life in 2027-04. Revisit Node 26 after it becomes LTS on 2026-10-28.
3. Keep tweetnacl and blakejs. WebCrypto in Workers has no XSalsa20 or BLAKE2b, and GitHub requires the libsodium sealed-box format. Keep libsodium-wrappers in `tests/sealed-box.test.ts` as an independent check.
4. esbuild: pin it to Wrangler's version (0.28.1) so one binary is installed instead of two. Keep it as a direct dependency, since about 12 tests import it.
5. Drop the `undici` override, which Miniflare already covers. Keep the `dompurify` 3.4.16 override (GHSA-p98j-92pf-mc4p). There is a separate high `source-map-js` advisory, dev-only, pulled in through Vite.
