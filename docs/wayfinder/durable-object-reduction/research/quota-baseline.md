# Quota baseline

Research captured 2026-10-17, approximately 12:12–12:15 UTC. Read-only Cloudflare control-plane/analytics requests only; no requests to the deployed editor or its Durable Objects, no load test, deployment, configuration change or credential copying. The working tree includes uncommitted application/WebMCP work; local code observations do not establish the deployed revision.

## What failed remains unknown

The exact exhausted allowance, incident date, dashboard label and original error are **unknown**. Existing authenticated GraphQL access works. One subscription-list GET returned **403**; it was not retried. Therefore the account's actual Workers Free/Paid subscription remains **unknown**. The endpoint requires Billing Read or Write; deployment login alone does not establish billing access. [Subscription API](https://developers.cloudflare.com/api/resources/accounts/subresources/subscriptions/methods/get/)

The figures below are observed production analytics, not invoice counters or proof of the remembered incident. In particular, 95,517 DO requests on October 15 is near the published Free limit, but does not establish exhaustion or identify the failed dimension.

## Observed account baseline

Each complete day is `[00:00:00 UTC, next 00:00:00 UTC)`. Queries aggregate across the account without object/account identifiers. Units came from live GraphQL schema descriptions: `duration` is GB-s; rows are SQLite-backed DO rows. Raw request/error counters come from adaptive datasets. The seven-day query returned seven date groups per dataset, below its limit of ten.

| UTC day | Worker requests | Worker errors | DO requests | DO errors | DO duration GB-s | DO rows read | DO rows written |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2026-10-10 | 2,023 | 1 | 2,865 | 0 | 0.871002 | 6,430 | 202 |
| 2026-10-11 | 9,199 | 3 | 17,005 | 0 | 6.775428 | 41,302 | 3,173 |
| 2026-10-12 | 7,526 | 9 | 27,815 | 0 | 10.958852 | 41,615 | 1,618 |
| 2026-10-13 | 7,572 | 0 | 9,203 | 21 | 1,626.691122 | 24,926 | 1,431 |
| 2026-10-14 | 23,973 | 0 | 60,807 | 1 | 21.650122 | 132,276 | 7,332 |
| 2026-10-15 | 27,734 | 70 | 95,517 | 1 | 27.622147 | 185,938 | 7,841 |
| 2026-10-16 | 26,585 | 0 | 60,370 | 1 | 17.072317 | 154,312 | 6,230 |

Partial October 17, `[00:00:00, 12:12:13 UTC)`: Worker requests **1,645**, Worker errors **0**; DO requests **14**, DO errors **0**; duration **1.444888 GB-s**; rows read **37**, rows written **23**. This is an incomplete day and may be affected by ingestion lag.

October 16 project-related breakdown, using `dimensions.scriptName`:

| Deployment | Worker requests/errors | DO requests/errors |
| --- | ---: | ---: |
| `native-site-editor-sessions` | 24,150 / 0 | 59,402 / 1 |
| `native-site-editor-preview` | 960 / 0 | 968 / 0 |

These two deployments account for all DO requests returned that day; account Worker totals also contain other scripts. The one sessions DO error has invocation status `clientDisconnected`; it is not an identified quota error. Namespace-specific row/duration attribution was not established and should remain unknown rather than inferred from names or request proportions.

`durableObjectsSqlStorageGroups.max.storedBytes` returned **7,229,440 bytes** for October 16 and **6,983,680 bytes** for the October 17 partial window. These are the queried maximum metric values, **not a validated sum of all simultaneously stored account bytes**. Account/namespace total stored bytes and exact quota headroom remain unknown.

## Meaning and reproducibility

Use POST `https://api.cloudflare.com/client/v4/graphql` with account scope retained only in process memory. Query `workersInvocationsAdaptive.sum { requests errors }`, `durableObjectsInvocationsAdaptiveGroups.sum { requests errors }`, `durableObjectsPeriodicGroups.sum { duration rowsRead rowsWritten }`, and `durableObjectsSqlStorageGroups.max { storedBytes }`; filter `datetime_geq` and `datetime_lt`. Add `dimensions { date }` for daily groups, or `scriptName` for invocation attribution. Discover field availability/units through introspection before changing queries. This follows Cloudflare's [Workers query tutorial](https://developers.cloudflare.com/analytics/graphql-api/tutorials/querying-workers-metrics/) and [DO metrics documentation](https://developers.cloudflare.com/durable-objects/observability/metrics-and-analytics/).

Adaptive datasets may return sampling-derived estimates; the capture did not establish sample rates/confidence intervals. Periodic/storage nodes lack the Adaptive designation, but their returned values are still analytics aggregates, not independently audited billing totals. Do not treat exact-looking integers as guaranteed exact event counts. [Sampling](https://developers.cloudflare.com/analytics/graphql-api/sampling/)

Wrangler 4.146.0's top-level help exposes no general Workers/DO analytics command; supported GraphQL is the repeatable path used here. Repeat completed UTC days after allowing ingestion time, retain query shape/time/scope, and separate account totals from deployment totals. Dataset retention, interval and field limits vary by plan; discover settings before requesting older windows. [GraphQL limits](https://developers.cloudflare.com/analytics/graphql-api/limits/)

## Relevant published limits, conditional on Free

Workers Free allows **100,000 requests/day**, resetting at midnight UTC. This is separate from DO requests. [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)

DO Free includes **100,000 requests/day**, **13,000 GB-s/day**, **5 million rows read/day**, **100,000 rows written/day**, and **5 GB total SQLite data**. Daily limits reset at 00:00 UTC; exceeding a dimension fails subsequent operations of that type. SQLite KV operations count as rows; deletes and `setAlarm` also write rows. Paid allowances differ. Request analytics are not automatically billable equivalents: incoming WebSocket messages have a billing-only 20:1 ratio. [DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)

## Local scenarios for the later comparison

No scenario below was run against production or measured locally in this research.

| Repeatable scenario | Local evidence to record |
| --- | --- |
| Idle editor, remote off; visible then hidden, 10 min each | Browser API requests and fake DO/storage counters; no remote work |
| Connected remote agent waiting, 10 min | MCP calls, DO reads/writes, elapsed handler duration |
| One command awaiting application, 10 s | Command/result latency, retries and storage operations |
| Ten controlled edits | Context/draft bytes uploaded, rows/operations, browser draft preservation |
| Two tabs, then close one/last | Per-tab traffic, routing identity, cleanup deadline and preserved data |
| Reconnect before/after grace | Alarm/generation races, restored state, no cross-tab command application |
| Injected quota errors in fake storage/transport | Clear failure, bounded retries, no draft loss or retry storm |

Code-derived estimates only: the controller's 30-second restore interval permits approximately 20 checks per ten visible minutes; a continuously pending 400 ms command loop permits approximately 25 reads per ten seconds; a 1.5-second wait loop permits approximately 400 checks per ten minutes of repeated waiting. Actual scheduling, initial calls and nested storage work vary. The agent menu additionally schedules a two-second poll with slower hidden handling. These are independent paths, not additive measured production totals. See [controller](../../../../src/controllers/agent-controller.ts), [MCP](../../../../worker/mcp.ts), and [agent menu](../../../../src/components/agent-menu.ts).

A successful mitigation must compare all dimensions for identical scenarios and comparable completed production windows, preserving authentication and browser drafts. Identifying the historic failure still requires its original error/usage label and incident date, plus an authorized billing-plan view; current analytics alone cannot supply them.
