---
title: Improve images freezes when it adds the player
type: task (AFK)
status: in progress
assignee: claude (mm-101 runner)
blocked_by: [74-improve-images-screen]
builder: claude
phase: 6
---

## What

Urgent fix found by the stage-6 screenshot run on dev (~58f46458). In Media → More → **Improve images**, fixing a row whose changes turn a GIF into a looping video, or swap an old YouTube embed for the site's lighter player, freezes the whole editor (more than 10 minutes, never recovers). Rows with only heavy photos or outside pictures save in about 11 s. Both freezing fixes add the site's video player files (`media-player.css` / `media-player.js`); a paused debugger shows the stylesheet reader reading the site's stylesheets page after page, forever.

Slice 68 (18fcdc30) fixed the same freeze for placements ("the stylesheet reader kept re-reading a new media-player.css that never arrived as text; placements now save those files as text"), but Improve images (slices 73/74, and the agent path from slice 75) still add the player files the old way.

- Find the shared root cause and fix it at the source, so no path can add the player files in a form that loops the stylesheet reader.
- Make the stylesheet reader itself robust: it never loops forever on a file it cannot read as text.
- Every writer of the player files (placement, looping video 64, Improve images 73/74, agents 69/75, Replace) uses the same fixed path.

## Done when

- A browser case in `native-improve-images.spec.ts` fixes a row with a GIF and a row with an old YouTube embed on a site without the player files yet, and finishes in normal time (fails on the old code).
- Unit tests cover the reader guard.
