---
title: Project menu rows too small for a finger on a phone
status: ready-for-agent
assignee:
blocked_by: []
---

# Project menu rows too small for a finger on a phone

## What

Found by the first `kit ux` run (2026-10-25, features F-agent-01 and F-agent-02, rule U6 "Touch never sticks"). At 390 px, light and dark, the project menu's rows are 32 px tall and sit tight against each other: the MCP row (`button.text-button.agent-menu__action`), the account and repository actions (`a.text-button.repository-menu__action`, `button.text-button.repository-menu__action`), the search field (`input.repository-menu__search`, 32 px) and the heading button (`button.repository-menu__heading-button`, 24×24 px).

## Fix

On touch (`@media (pointer: coarse)`), give these rows and the search field a 44 px hit area without changing how the menu looks on desktop; use the theme's spacing tokens (load the good-css skill). The heading button gets a 44×44 px hit area.

## Done when

- `kit ux --features F-agent-01,F-agent-02` has no U6 findings at 390 px.
- Desktop at 1280 px unchanged (`kit shots --compare`).
