---
title: Measure the starter today and find how Lighthouse fits the kit
type: research (AFK)
status: closed
assignee: claude (research subagent)
blocked_by: []
---

## Question

Run Lighthouse (mobile and desktop) on the starter site (`~/Projects/native-site-editor-starter`, served statically) and on one page edited in the editor. Record the scores and every failing audit, with its cause in the starter or the editor's output.

Then find how a Lighthouse run fits the kit without a browser farm:

- Lighthouse CLI or its Node API with the existing Playwright Chromium;
- run time and flakiness;
- score budgets;
- when it runs (`kit pr` for starter or template changes, a weekly sweep, before release).

The kit lives in `scripts/agents/kit`; see `docs/agents/agent-scripts.md`.

## Resolution (2026-10-25)

Findings: `docs/wayfinder/site-quality/research/03-lighthouse-today.md` on branch `research/sq-03-lighthouse-today` (commit `a0026cb3`, never merged; `kit doctor` 7/7; Lighthouse 13.5.0, 48 runs).

- **Accessibility and best practices:** 100 on every run and page. These and SEO never vary between runs, so they can be strict 100 gates.
- **Performance:**
  - desktop 99–100, and mobile 97–99, except the home page on mobile;
  - there, the median is 85, from layout shift (CLS 0.24–0.28 against a 0.1 limit);
  - components draw after first paint, and the header starts at 0 px and pushes content down;
  - hiding not-yet-defined components (`styles/site.css:19-23`) keeps their old size.
- **SEO:**
  - 66 on the starter only because of its deliberate `noindex` (`index.html:8`);
  - a new site scores 92, because `shared/starting-point.ts:192` leaves `rel=canonical href="/"`, which is not a full address;
  - a page edited through the real save path scored the same, and its added image became the LCP element without `fetchpriority`.
- **Kit fit:**
  - the Lighthouse Node API on one Playwright Chromium, about 6 s a run (the CLI takes 11–15 s);
  - skip Lighthouse CI, which is still on Lighthouse 12;
  - budgets checked from the JSON: 100 for accessibility, best practices and SEO, and a performance median of 90+ with mobile CLS ≤ 0.1 and LCP ≤ 2.5 s;
  - runs in `kit pr` when the starter or site-output code changes (about 75 s), in the weekly sweep (including the live deploy), and at release (5 runs, about 5 min);
  - a `kit lighthouse` command is sketched.
