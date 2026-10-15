---
title: Make the MCP sign-out smoke test reliable on CI
type: task (AFK)
status: in progress
assignee: claude (mm-99 runner)
blocked_by: []
builder: claude
phase: 5
---

## What

The `@smoke` case `tests/native-save/native-mcp.spec.ts:307` ("Disconnect MCP revokes the agent's token, and Cancel drops a token no agent used") failed on dev CI twice (run 38666119384 on 5e4389e5, run 38673062230 on 18fcdc30): `connectAgent` waits 15 s for **Disconnect MCP** and the editor still shows **Waiting for connection…**. It passes locally.

- Find the real cause from the CI logs and traces (race, timeout, shared state, port…) and fix it where it lives: in the test if the test is wrong, in the product if the product has a race.
- No blind timeout raises, no skip, no `known-failures.json` entry unless it is proven to be the environment.

## Done when

- The spec passes many times in a row locally (`--repeat-each`), also under load beside another suite.
- Dev CI's smoke job passes on the landing.
