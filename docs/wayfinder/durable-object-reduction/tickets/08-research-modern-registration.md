---
label: wayfinder:research
title: Establish modern registration compatibility and safe metadata lookup
type: research (AFK)
status: closed
assignee: Codex subscription researcher
blocked_by: [04, 05]
---

## Question

What support for Client ID Metadata Documents (CIMD), dynamic-registration fallback and expired-client recovery can be established for the project's target remote clients, and what constraints must a safe metadata lookup meet?

Check current primary documentation or first-party source for Claude web/Desktop/Code and Codex, distinguishing documented support from inference or unknown behavior. Do not assume spec support proves an app implements it. Inspect the project's manual MCP OAuth implementation and existing SDK only as needed. Identify required capability advertisement, identifier/redirect validation, bounded fetch/cache behavior and server-side request-forgery protections. Explain what expiry/re-registration can be automated by this server and what remains controlled by a third-party client. No credential, account-connector or production mutations and no app implementation.

Capture a short report with source URLs, verification date, unknowns and compatibility checks that can decide the next ticket. Preserve the report on a research-only branch without a PR, following the map's existing research convention; keep the dirty application work untouched.

## Answer

The [research report](../research/modern-registration.md) establishes documented CIMD and DCR support for Claude web/Desktop/Code and Codex. It does not establish automatic repair of an expired dynamic-registration identifier, fallback after a failed CIMD lookup or compatibility of locally installed versions. Current manual OAuth code is not CIMD-aware; adding discovery advertisement alone would break those authorization attempts. Native callbacks require a narrowly implemented loopback-port exception rather than broad redirect matching.

Safe metadata lookup needs bounded fetch/cache work and destination enforcement, or reviewed exact URLs. An arbitrary-URL implementation requires proof against SSRF and DNS rebinding in the Worker runtime before it can be claimed safe. These findings and proposed bounds are evidence for the next live decision, not accepted product settings. No client/account mutations or application changes were made.

Preserved and pushed on research-only branch `research/durable-object-modern-registration`, commit `409b6e269e708fb8c868b817f789a61ccd2b46d5`. Only the report differs from its parent; the active checkout and index were not changed. No PR was opened.
