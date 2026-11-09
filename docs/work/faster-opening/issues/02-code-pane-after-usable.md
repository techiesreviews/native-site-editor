---
title: "The code pane loads after the page is usable"
status: needs-info
assignee:
blocked_by: []
---

## Goal

Lex chose (option c, 2026-11-09): the code pane (Monaco) loads after the page is usable, so it never holds up the first screen.

## Finding before building (2026-11-09)

Measured on dev (see [the spec](../spec.md)): the code pane already waits for the page. Nothing of Monaco is in the bytes before the first screen (354 KB, 35 requests, none of them Monaco), the pane says "The code loads once the page is on screen", and "usable" equals the first screen in every run (normal 1098 ms; slow 4414 ms). The code pane itself shows at 1.9 s (normal) and 10.7 s (slow) because Monaco is large, but it does not delay the page.

So the gain this option promised (0.5 to 1 s on a slow connection) is already there. Left for the lead and Lex to decide: close this ticket, or change it to something that still helps, for example the code pane's download giving way to the page's own pictures on a slow connection, or the pane loading only when it is opened.
