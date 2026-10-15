---
title: Picker, Replace everywhere and Site settings: less text, pages named
type: task (AFK)
status: open
assignee:
blocked_by: [104-media-panel-size, 105-editor-toast]
builder: claude
phase: 8
---

## What

From the [UX and UI audit](../ux-ui-audit.md#replace-everywhere-picker-confirm-result-b-05-to-b-07b) and the lead's note 7.

- Replace everywhere confirm: the box names the pages as links ("Shows on: Home, About", up to 5, then "and N more"), then "Same name and address, so links from other sites show it too." and "The old picture goes to Recently removed for 30 days." The other two sentences go (the focus reset is said once in the image popup).
- Replace result as a toast (slice 105): "red-acer.webp now shows the bluebells picture on Home and About" with Undo.
- Picker: the YouTube/Vimeo field hides behind a quiet "Paste a YouTube or Vimeo link" text button in the One bar row; revealed, it is one field, Use, and "Works with YouTube and Vimeo" (Notion Link tab); errors stay inline.
- Picker footer: no "Choose one file" line; "Use" (disabled) until a pick, then "Use image" / "Use video"…; Cancel and Use in one 56 px row on phone.
- Picker height follows its content (`min(850px, fit-content)`, at least 480 px).
- Site settings: the site address wraps on phone (`field-sizing: content`); helper "Like https://name.github.io/my-site/"; "Choose favicon…" becomes a secondary button in the field column with a 32 px favicon preview.

## Done when

- Specs: the confirm lists the page names; the paste field opens from its button and still places a Vimeo video.
- Shots of every screen this slice touched at 390, 768 and 1280, light and dark, before and after, on the real starter (`scripts/agents/shots.sh`).
- `npm run check`, `npm run lint`, unit tests, the touched browser specs; new code stays in the lazy media chunk (boot budget unchanged).
- Review by GPT-6.1 Sol (read-only `codex exec`) recorded.
