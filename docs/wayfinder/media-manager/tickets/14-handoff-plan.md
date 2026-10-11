---
title: Write the handoff plan
type: grilling (HITL)
status: open
assignee:
blocked_by: [06-prototype-media-manager-look, 07-one-upload-path, 08-responsive-image-output, 09-prototype-crop-and-focus, 10-safe-clean-up, 11-fix-all-existing-images, 12-video-audio-and-documents, 13-what-agents-may-do]
---

## Question

Turn every decision on this map into a build plan: phases and small slices in a `build/` folder, in an order that keeps the editor working after each slice. Include removing the legacy parts of `media-workspace.ts` and splitting `media-library-view.ts` along the seams from the code research. Say which slices Sol (GPT-6.1 Sol) builds and which Claude builds, and that every code review goes to Sol through read-only `codex exec`. Building happens on `dev` and is deployed with `npm run deploy:preview`, never to production until Lex says. Name the tests per feature (unit tests plus one @smoke e2e spec), the starter changes (on the starter's own `dev` branch), the docs to rewrite (`docs/page-builder/media.md`, `images-pane.md`, `asset-references.md`), and the screenshots shown to Lex after each preview deploy.
