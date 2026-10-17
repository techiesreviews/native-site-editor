---
label: wayfinder:research
title: Establish available quota evidence and a repeatable usage baseline
type: research (AFK)
status: closed
assignee: Codex research subagent (gpt-6.1-sol, low)
blocked_by: []
---

## Question

Which allowance actually failed, and what measured baseline can later distinguish a successful mitigation from moving usage into another dimension?

Capture the exact Cloudflare error or usage label, date window, Free/Paid plan and relevant namespace/account totals. Distinguish Worker requests, Durable Object requests, rows read, rows written, duration and stored bytes. Define repeatable scenarios for idle editing, waiting remote agents, active edits, multiple tabs, reconnects and quota errors. Identify what can be measured locally without production traffic and what still needs authenticated Cloudflare access. Do not exhaust a live quota to reproduce the problem.

## Comments

- The user remembers a daily allowance being exhausted; its label remains unknown. Existing code confirms polling paths, but does not establish their share of the production incident.
- Read-only `wrangler whoami` succeeded on 2026-10-17, confirming an existing local Cloudflare login. This does not identify the failed allowance or supply production usage measurements. No credentials, account identifiers or token values are recorded here; login settings were not changed.
- Classified as research because the work consisted of primary-source documentation and read-only production analytics, rather than provisioning or account changes.

## Answer (2026-10-17)

The [quota baseline report](../research/quota-baseline.md) records seven complete UTC days plus a clearly marked partial day, deployment-level request attribution, dataset limitations and repeatable comparison scenarios.

The account returned 95,517 Durable Object requests on October 15, versus 185,938 rows read and 7,841 rows written. These are analytics aggregates, not guaranteed billing counters. The request total approaches the published Free request allowance but does not establish exhaustion or identify the remembered incident. Actual Free/Paid status, the original failed allowance and validated total stored bytes remain unknown. The billing-subscription read returned 403 once and was not retried; no access settings were changed.

The report is preserved on [`research/durable-object-quota-baseline`](https://github.com/techiesreviews/native-site-editor/tree/research/durable-object-quota-baseline) at `f357a2aba2d52242f17273f19ae5ac041a973bb1`. Only the redacted report was committed; the active checkout and index were unchanged. No live Worker/DO load test, deployment or paid change occurred.

This resolves the available evidence and baseline method. Incident attribution remains explicitly unknown. Later validation must not claim that the original failure was fixed without identifying its quota/error; conservative request/storage reductions can be designed from the evidence already available.
