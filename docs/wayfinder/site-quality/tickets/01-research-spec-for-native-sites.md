---
title: Find which website rules apply to native sites and who can meet them
type: research (AFK)
status: open
assignee: claude (research subagent)
blocked_by: []
---

## Question

Go through every topic in [specification.website](https://specification.website) (its `llms-full.txt` or MCP server) and Lighthouse's audits. For a native site (plain HTML, CSS and browser JS on a static host: GitHub Pages or Cloudflare) made in this editor, sort each rule into one of:

- does not apply;
- the starter or templates already meet it;
- the editor can meet it automatically (say how and where in the code, for example the Media pipeline, page details, Site settings, Save);
- it needs words from Lex;
- it depends on the host (headers, caching, redirects, per host).

Note what the editor does today. Group the output so a build can follow it.
