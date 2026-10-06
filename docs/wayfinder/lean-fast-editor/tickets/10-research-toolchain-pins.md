---
title: Research the toolchain pins
type: research (AFK)
status: open
assignee:
blocked_by: []
---

## Question

What should each pinned or duplicated tool be?
- Is there a stable Miniflare release to replace the exact alpha pin `5.20261001.0-alpha` (used by 5 test files)?
- Should Node be 24 everywhere? Today `.node-version`, `@types/node` and `engines` say 22, while CI uses 24.
- Can the sealed box for GitHub secrets (`worker/sealed-box.ts`, built on tweetnacl and blakejs) use WebCrypto X25519 in Workers, and can the tests drop `libsodium-wrappers`?
- Is the exact `esbuild` pin and the `undici`/`dompurify` overrides still needed?
