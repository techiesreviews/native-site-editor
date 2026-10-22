---
title: Sites made in the editor follow the Lighthouse rules
status: needs-triage
assignee:
blocked_by: []
---

# Sites made in the editor follow the Lighthouse rules

## What

Lex (2026-10-22): "the site, created in the editor, should take into account the Lighthouse rules." Backlog only: after the clean-up, the atomic design catalogue and multiplayer, unless Lex moves it up.

Lighthouse scores a page on performance, accessibility, best practices and SEO. A site built in the editor (pages, components, media, the starter) should score well by default, and the editor should keep it that way as Lex edits: for example image sizes and formats, alt text, heading order, colour contrast, link names, page titles and descriptions, `lang`, layout shift, render-blocking CSS or JS, and caching hints for the hosts in the publishing plan.

## To decide when picked up

- Which categories and which target scores (for example 90+ in all four).
- Where the rules live: in the starter and component templates, as checks while editing (warnings in the editor or an agent review), as a check before Publish, or all three.
- Whether a Lighthouse run (or its open-source audits) becomes part of the kit for the starter and the preview, so regressions show up automatically.
- Overlap with existing work: the media manager already makes trimmed copies and alt text fields; "Prebuilts are CSS-first" already favours CSS over JS.

## Comments
