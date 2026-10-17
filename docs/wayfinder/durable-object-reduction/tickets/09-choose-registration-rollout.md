---
label: wayfinder:grilling
title: Choose registration compatibility and retention rollout
type: grilling (HITL)
status: closed
assignee: Codex lead with Lex
blocked_by: [08-research-modern-registration]
---

## Question

Given verified client compatibility, how should modern app identification roll out, and when may fallback registration retention be shortened?

Choose the target clients, compatibility checks and fallback behavior. Decide whether to retain the existing fixed 180-day lifetime initially or adopt the proposed thirty-day inactivity rule, including renewal/write limits and expired-identifier recovery. Define bounds for rebuildable metadata caching and lookup failures; preserve consent, redirect validation, PKCE and the separate five-minute agent cleanup. Specify migration of existing registrations and whether this long-term work ships separately from the primary polling/request reductions. The research supplies evidence, not user decisions.

## Context

The [completed registration research](../research/modern-registration.md) confirms documented target-client support but not automatic expired-identifier recovery. Choose between constrained reviewed metadata URLs and arbitrary URL support that needs Worker-runtime destination-enforcement evidence; capability advertisement must not silently break other existing clients. Native loopback callbacks need a port-only matching exception. Research cache/fetch bounds remain proposals until this decision.

## Answer

- Ship the primary polling/relay/storage mitigations first. Add CIMD separately after versioned compatibility checks for Claude web/Desktop/Code and Codex. Preserve existing registration and token connection paths, grants and registered identifiers. Leave new capability advertisement off if supported setup paths cannot be shown to work; do not rely on unverified automatic fallback.
- Keep the existing fixed 180-day lifetime for current and fallback DCR registrations initially, within the accepted registration size/count budgets. CIMD connections do not create DCR registrations. Shorter fallback retention requires demonstrated expired-identifier recovery in each affected client and a separate explicit decision; the proposed thirty-day inactivity cutoff is not part of this rollout.
- Start with reviewed exact metadata URLs for the verified clients. Preserve a documented working path for other clients. Apply exact identifier/redirect binding and the narrow native-loopback port exception. Arbitrary metadata destinations remain a later expansion requiring Worker-runtime destination-enforcement evidence.
- Perform metadata lookup only as needed during authorization, never ordinary tool traffic or a periodic refresh. Allow one HTTPS GET per coalesced miss, five seconds including the response body and at most 5 KiB of decoded body bytes. Follow no redirects or automatic retries; forward no cookies/private authorization headers and fetch no referenced resources. Validate the response and binding completely before accepting it; failure offers clear retry/reconnect guidance rather than accepting invalid/expired identity or callbacks.
- Cache validated metadata only in memory, keyed by exact identifier, up to 100 entries and 500 KiB of decoded document bytes per Worker isolate. Respect source cache directives/no-store and cap freshness at one hour. Coalesce misses, evict within bounds and never use expired metadata after refresh failure or cache invalid/error documents. No DO mirror or background keepalive. These are per-isolate resource caps, not a global fetch quota; normal authorization admission limits still apply.

Lex accepted the first round with "k" and the final resource round with "k". Registration rollout is decided; implementation remains separate from this planning work. Preserve the existing registration lifetime during initial mitigation, and ship modern identification later behind the stated compatibility gates.

## Comments

- First registration-rollout round, pending acceptance:
  1. Ship the main polling/relay/storage mitigations first. Deliver CIMD as a separate subsequent change, enabling it only after versioned compatibility tests for Claude web/Desktop/Code and Codex pass. Keep dynamic registration and the existing token connection available. Preserve existing grants and registered identifiers during migration; a failed modern lookup must not silently replace an identity or claim the client will retry another mechanism. Capability advertisement must not regress any supported setup path; if that cannot be demonstrated, leave CIMD disabled until corrected. Additional clients require a documented working path, not an assumption of automatic fallback.
  2. Preserve the existing fixed 180-day lifetime for current and fallback DCR registrations initially, subject to the accepted 16 KiB/10,000-record bounds. Do not impose the proposed thirty-day inactivity cutoff during this rollout. Successful CIMD authorization does not allocate a DCR registration, so modern-client uptake can reduce future retained registrations without forcing existing users to set up their connector again. A later shorter-lifetime proposal requires observed expired-identifier recovery in every affected supported client and a separate explicit decision.
  3. Start CIMD lookup with reviewed exact metadata URLs used by the supported clients, not arbitrary user-provided hosts. Validate each document and redirect binding, including the narrow native-loopback port exception. Before enabling, show a working existing registration or token path for clients outside that reviewed set; do not advertise support while allowing unrelated supported-client connections to fail unexpectedly. General arbitrary-URL lookup remains a later expansion requiring proof of destination enforcement in the Worker runtime. Fetch/cache resource budgets are the next round if this direction is accepted.
- Accepted by Lex ("k"): all three proposals in the first registration-rollout round. Incorporated above.
- Final registration resource round, pending acceptance:
  1. Resolve metadata only as needed for actual authorization, never on ordinary tool calls or a periodic refresh. Permit one HTTPS GET per coalesced cache miss, a five-second total deadline including the body and at most 5 KiB of decoded body bytes. Follow no redirects and perform no automatic fetch retries. Forward no browser cookies, authorization tokens or private headers; do not fetch referenced logos or other resources as part of public-client identification. Require a successful validated JSON document and reject unsupported identifiers before network work. On failure, show a clear retry/reconnect path without accepting an expired identity, invalid callback or unverified client-controlled replacement.
  2. Cache validated metadata in memory only, keyed by exact identifier, with at most 100 entries and 500 KiB of aggregate decoded document bytes per Worker isolate. Respect HTTP cache directives, including no-store; cap otherwise-cacheable freshness at one hour and never use expired entries after a failed refresh. Evict oldest/least-recently-used entries within bounds, coalesce concurrent misses and do not cache invalid/error documents. These are local resource caps, not a global network request guarantee; isolate eviction can trigger fresh lookups. No Durable Object metadata mirror or cache keepalive is added. Existing authorization admission limits remain applicable, and reviewed URLs bound destination variety.
- Accepted by Lex ("k"): both proposals in the final resource round. Incorporated into the answer; the ticket is resolved.
