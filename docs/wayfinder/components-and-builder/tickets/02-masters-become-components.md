---
title: Decide how masters and page parts become components
type: grilling (HITL)
status: open
assignee:
blocked_by: [01-research-masters-and-components]
---

## Question

With masters and Save shared retired (settled while charting), how does each existing master and page part become a component: an automatic conversion when the editor opens a repo, a one-time offer the user accepts, an agent prompt, or by hand? What is the header/footer component's markup, given the no-JS finding in ticket 01: nav links slotted into the page, or kept in the template? What happens to the sidecar keys (`reusableSections`, `pageParts`, page `sections`), and in what order are the editor and Worker code paths removed?
