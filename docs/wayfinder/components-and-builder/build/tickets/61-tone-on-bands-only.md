---
title: Tone in the edit bar, on page bands only
type: task (AFK)
status: closed
assignee:
blocked_by: [13-edit-bar-variant-controls]
builder: sol
phase: 7
---

## What

Ticket [08](../../tickets/08-accessible-tone-text.md) §2–3, narrowing [07](../../tickets/07-variant-contract.md) §2 for tone.

- The edit bar offers Tone (`data-tone`, from the site's `[data-tone]` rules) on section components, plain `<section>`s (the Section block included), the header and the footer; not on cards, buttons or anything inside a band. Other global attributes keep 07's rule.
- Light (the default) removes the attribute. There is no contrast warning.

## Done when

- `@smoke` spec (for example `tests/native-save/native-tone.spec.ts`): pick Brand on a section, `data-tone="brand"` is written; pick Light, it is removed; a card inside the section offers no Tone.

## Done (2026-10-09)

- A band (plain `<section>`, a component whose template root is `<section>`, the page's header/footer or a component rooted in `<header>`/`<footer>`, on a page file, with no band or instance around it) shows Tone from the site's `[data-tone]` rules; "Light (default)" removes the attribute unless the CSS declares another default. Non-band instances and buttons drop `data-tone`; other global attributes stay on every component. Rule: `isToneBand`/`toneDefault` in `src/page-builder/variant-fields.ts` (lazy).
- Commit `2ca3384` (built by Sol). The native-variants fixture's card-tip site-CSS variant is now `data-emphasis`; new page `tones.html`.
- Tests: `tests/tone-band.test.ts` (5), `tests/native-save/native-tone.spec.ts` (@smoke + 1 nightly).
