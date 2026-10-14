---
title: Write the handoff plan
type: grilling (HITL)
status: open
assignee: Lex + claude (grilling)
blocked_by: [06-prototype-media-manager-look, 07-one-upload-path, 08-responsive-image-output, 09-prototype-crop-and-focus, 10-safe-clean-up, 11-fix-all-existing-images, 12-video-audio-and-documents, 13-what-agents-may-do, 15-collections-and-file-names]
---

## Question

Turn every decision on this map into a build plan: phases and small slices in a `build/` folder, in an order that keeps the editor working after each slice. Include removing the legacy parts of `media-workspace.ts` and splitting `media-library-view.ts` along the seams from the code research. Say which slices Sol (GPT-6.1 Sol) builds and which Claude builds, and that every code review goes to Sol through read-only `codex exec`. Building happens on `dev` and is deployed with `npm run deploy:preview`, never to production until Lex says. Name the tests per feature (unit tests plus one @smoke e2e spec), the starter changes (on the starter's own `dev` branch), the docs to rewrite (`docs/page-builder/media.md`, `images-pane.md`, `asset-references.md`), and the screenshots shown to Lex after each preview deploy.

## Comments

- 2026-10-14: Claimed for grilling with Lex (claude). Planning only: no editor code, pushes or deployments; documents committed locally on `dev`.
- 2026-10-14: **What ships first on preview.** Lex chose **the new Media screen**: the selected Tiles look with collections, details and the picker, working on the site's existing images, with better adding, cropping and clean-up in later stages. Declined: better images on pages first (every adding route optimised, old Images tab kept until later); clean-up first (badge, review and Recently removed before the new look).
- 2026-10-14: **Who builds.** Lex chose **Sol builds most, Claude builds the screens**, as in the components-and-builder build: Sol (GPT-6.1 Sol) takes the behind-the-scenes slices (preparing files, page markup, clean-up checks); Claude takes the parts judged by eye (the Media screen, the image popup, the video and audio players). Sol reviews every slice either way. Declined: Claude builds nearly everything with Sol only reviewing; Sol builds everything with Claude only running the work and taking screenshots.
- 2026-10-14: **Screenshots.** Lex chose **once per stage**: one fuller set (starter site, computer and phone) when a whole stage is finished and on preview. For this build that replaces the standing "screenshots after every preview push" habit. Declined: after every preview update (the standing rule, recommended); only when Lex must choose plus one set at the end.
