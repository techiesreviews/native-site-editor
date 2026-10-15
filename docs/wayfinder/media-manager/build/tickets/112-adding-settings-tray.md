---
title: Adding: settings as choice cards, shorter tray messages
type: task (AFK)
status: open
assignee: claude (mm-112 runner)
blocked_by: [105-editor-toast, 106-touch-dark-fixes]
builder: claude
phase: 8
---

## What

From the [UX and UI audit](../ux-ui-audit.md#adding-settings-and-repository-size-a-23-a-24) and the tray finding.

- Adding settings: each kind (Images, Video, Audio) is one grouped card, 12 px radius, a 1 px line between rows; each choice a 48 px row with title, 13 px hint and a trailing ✓ for the chosen one, with no radio dots, still a radio group for assistive tech (XChat "Upload Quality", WhatsApp "Media quality"). Keep original stays a switch-like row below.
- Reset to defaults becomes a text button, hidden when nothing differs from the defaults.
- Repository size as a storage card: "320 MB" at 20 px semibold, "of 1 GB GitHub Pages allows" in 13 px muted, a fully rounded 8 px bar in the primary colour (amber from 80 %) (WhatsApp storage).
- Tray: title "2 added · 1 couldn't be added"; each failure at most two lines ("phone-export.png couldn't be added. Save it as JPEG or PNG and try again."), with the full reason under Review; Retry as a 36 px secondary button; ✕ in the tray's top-right corner.

## Done when

- Also shot (not in the audit's sets): the picker's own adding progress, ready and error states, and the repository size line at 500 MB and 900 MB.
- Specs for settings choices and the tray's failure line updated; keyboard arrows still move between choices.
- Shots of every screen this slice touched at 390, 768 and 1280, light and dark, before and after, on the real starter (`scripts/agents/shots.sh`).
- `npm run check`, `npm run lint`, unit tests, the touched browser specs; new code stays in the lazy media chunk (boot budget unchanged).
- Review by GPT-6.1 Sol (read-only `codex exec`) recorded.
