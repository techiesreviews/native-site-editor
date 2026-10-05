# Memory Index

## Handoffs

- [Reviewed listings continuation and preview release](handoffs/t3-listings-continuation-2026-10-05.md): migration action removed, visibility eye follows Edit, collection Code refresh and settings/delete races fixed; Claude approved application `634d69f`, released through `dev@abb5566` to preview version `e574d5aa`. Human screen-reader testing remains open.

- [Reviewed performance cleanup and preview release](handoffs/t3-performance-preview-2026-10-05.md): start here for the latest component reuse release, passing Node 24 CI, public asset checks, and owner-authentication verification limit.

- [5 October transfer to T3 thread 0865866a](handoffs/t3-page-builder-transfer-2026-10-05.md): frozen green demo, three measured refactors awaiting independent review, helper cleanup and preview release next.

- [T3 Page Builder Handoff - 2026-10-03](handoffs/t3-page-builder-2026-10-03.md): transfer from source thread `c50a9d9b-846d-4e67-9250-ae10a18bc7b4` to destination thread `da5eb845-2cdf-4f84-8736-2704ec23f3ad` for the native visual page builder work.
- [Recovered page-builder reviews](handoffs/t3-page-builder-review-findings-2026-10-03.md): complete components, canvas, and palette findings with source-log paths; consult when completing or reviewing these slices.

## Component implementation permission

Web Components are permitted in both the editor UI and generated sites (explicit user choice, 2026-10-05). This supersedes earlier native-only or no-custom-element assumptions. Use them where they improve reuse or behavior; no wholesale migration is required. Preserve relevant validation and source/output compatibility checks for each implementation.
