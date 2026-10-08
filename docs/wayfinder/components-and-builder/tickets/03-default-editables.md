---
title: Decide the default editables rule
type: grilling (HITL)
status: closed
assignee: Lex + claude (grilling)
blocked_by: []
---

## Question

With slots wrapping the whole element (settled), what exactly becomes a slot when a component is made, from HTML or directly? Candidates: every text element with only inline children (`TEXT_TAGS` in `public/native-preview-runtime.js:2247`), every `<a>`, every `<img>`/`<picture>`, buttons. How are slots named (class, then kind + index, as in `component-model.ts:969`), and which are optional (hidden when empty by `hideEmpty` in `components.js`)? What stays fixed in the template (decorative images, icons, wrappers)? How is a repeated group (a list of cards) handled: as the default slot, as in `section-cards`? Do the slot kind rules in `component-model.ts:286-320` (from fallback content, then from the name) stay as they are? techies-reviews' `card-tutorial` is the reference.

## Resolution (2026-10-08)

Decided with Lex. This rule applies to whatever HTML a component starts from, built HTML or a direct start. In the Make component dialog the user can untick any slot. An unticked element stays fixed in the template.

1. **Text:** each text element (a heading, `p`, `li` outside a list slot, `blockquote`, …) becomes one slot wrapping the whole element. Inline `a`, `strong`, `em` and `br` stay inside it as rich text. A link only becomes a slot of its own when it stands alone.
2. **Link-wrapped card** (`<a class="card">…</a>`): it becomes a stretched link. The heading, or the first text element if there's no heading, becomes `<a slot="link">`, and the template CSS adds `a::after { inset: 0 }` so the whole card stays clickable. The image and texts become their own slots. A wrapper with no text at all becomes one whole slot. The dialog explains the change.
3. **Images:** every `<img>` and `<picture>` becomes a slot, whatever its alt text. Inline `<svg>` icons and CSS backgrounds stay fixed.
4. **Names come from the role:** first heading `title`, paragraph `text`, `image`, `link`, numbered on repeats (`text-2`). The class is used only to break ties. Today's class-first naming changes.
5. **Repeated groups:** two or more siblings with the same tag and the same first class become the unnamed slot. The items stay plain HTML (or component instances) in the page, so Add card works on them. Only the first group gets the unnamed slot; later groups are named (`items-2`). A `<ul>`/`<ol>` becomes one named slot (`list`), edited as a rich list.
6. **Nested component instance:** the whole element becomes a slot, so each page owns that instance and its own slots.
7. **Optional slots:** no marker. Today's behaviour stays: a section component hides a slot the page leaves empty, and other components show its fallback. A new instance starts with every fallback copied into the page.
8. **Slot kind:** read from the fallback element (image, link, text, content). The name-based guess in `slotKindFromName` stays only for empty slots.
9. **Language:** components use **Slot**; no "Editable" term is added. `CONTEXT.md`'s Slot entry now says the page supplies a whole element.

**Changes to `makeComponentPlan`** (`component-model.ts:1095`): wrap the whole element for text (today a text element gets its slot inside it, at `:1137-1144`), name slots by role, detect repeated groups and lists, wrap nested instances, and handle stretched links.
