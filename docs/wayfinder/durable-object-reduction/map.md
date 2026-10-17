---
label: wayfinder:map
title: Browser-owned agent work with bounded Durable Object usage
charted: 2026-10-17
status: complete
tracker: local markdown; follows the existing docs/wayfinder convention
---

## Destination

A decided, measurable plan for reducing Durable Object requests, storage operations and retained data while preserving browser drafts and existing sign-in. The plan must specify browser-local agent work, opt-in event-driven remote MCP, and automatic cleanup after the last editor tab disconnects. Implementation begins only after planning is complete and the user requests it.

## Notes

- Planning only: application changes, deployment and plan upgrades remain outside this map's execution.
- All nine decision/research tickets are closed. The [implementation handoff](handoff.md) records the dependency order and validation gates; application implementation awaits a subsequent user request.
- The user reported an exhausted daily Cloudflare allowance. Its exact dimension, account totals and production cause are not yet verified; code-based traffic estimates are not production measurements.
- **Accepted while charting:** retain remote MCP compatibility without requiring an extension, but make remote connections explicit opt-in. Browser-local agents use browser drafts; remote agents use an event-driven relay.
- Keep the existing GitHub sign-in/session design. The accepted scope puts a local subscription companion and embedded agent chat in separate follow-up work.
- Skills: use `lex-coding`; use `grilling` and `domain-modeling` for live decisions; use `research` with primary sources for external facts. Product choices belong to the user, not research agents.
- Language: [session terms](../../../GLOSSARY.md) and [existing editor vocabulary](../../../CONTEXT.md).
- Each ticket lives in `tickets/`. Select the first open, unassigned ticket whose `blocked_by` tickets are closed; claim it by setting `assignee` and `status: claimed` before work.
- Research findings are separate from accepted product decisions. Scope them to the current working tree, which already contains unrelated application changes and uncommitted WebMCP work.

## Decisions so far

- [Define disconnect, grace and reconnect behavior](tickets/01-define-disconnect-and-reconnect.md): five-minute eligibility after detected last-tab loss; reconnect revalidates the workspace; no offline queue or blind replay; cleanup expires agent permissions while preserving sign-in and browser drafts.
- [Establish available quota evidence and a repeatable usage baseline](tickets/02-establish-quota-baseline.md): seven days of read-only analytics and comparison scenarios captured; requests approached the Free allowance, but the original failed dimension and actual billing plan remain unverified.
- [Research live relay and reliable cleanup mechanisms](tickets/03-research-live-relay-and-cleanup.md): event-driven relay is feasible with bounded waits; alarm/reconnect races require fencing; current and legacy MCP cancellation differ. Primary-source findings are preserved on a research-only branch.
- [Choose agent connection modes and tab ownership](tickets/04-choose-connection-and-tab-ownership.md): pin connections to account/repository/branch; one receiving tab with explicit takeover; browser-local tools and opt-in remote MCP; embedded chat and local companion are follow-ups.
- [Set server data budgets and retention rules](tickets/05-set-storage-budgets-and-lifetimes.md): browser-owned content, bounded agent metadata/relay/cache, capped shared registrations and unfinished authorizations, and migration cleanup that verifies browser recovery. Modern registration compatibility and fallback retention now have separate research and decision tickets.
- [Establish modern registration compatibility and safe metadata lookup](tickets/08-research-modern-registration.md): target clients document CIMD/DCR support; expired-registration recovery remains unproven. Manual OAuth needs a complete resolver, narrow loopback callback matching and bounded, destination-safe metadata lookup.
- [Define browser persistence and command recovery](tickets/06-define-browser-recovery.md): atomic draft/receipt acknowledgement, bounded local receipts/history, fenced tab takeover, explicit cancellation outcomes and export/recovery without deleting unsaved work.
- [Choose registration compatibility and retention rollout](tickets/09-choose-registration-rollout.md): quota mitigation ships first; modern identification follows verified client tests, with existing registration lifetimes preserved and bounded metadata lookup/cache.
- [Set traffic budgets, quota recovery and rollout checks](tickets/07-set-request-budgets-and-rollout.md): zero remote-off hub traffic, bounded Watch/reconnects, quota pause, staged validation, quota-bounded legacy cleanup and rollback that preserves browser work.

## Not yet specified

- None for the accepted scope. Runtime permission checks, client-version compatibility, deletion accounting and metered savings remain explicit implementation/release gates in the linked decisions, not claims that have already been verified.

## Out of scope

- Application implementation, deployment and paid-plan changes during Wayfinder planning.
- Full offline editing, unattended delivery and a cloud mailbox.
- Automatic Save to GitHub or publication.
- Built-in agent chat and a local subscription companion in this mitigation; tracked as follow-up scope in the connection decision.
- Deleting browser drafts, GitHub sign-in or GitHub App configuration as temporary-agent cleanup.
- Reworking unrelated icon, component, OAuth or WebMCP changes already present in the working tree.
- Redesigning GitHub authentication if later measurements show it is necessary; that would require a new scope decision. The current map preserves the existing architecture.
