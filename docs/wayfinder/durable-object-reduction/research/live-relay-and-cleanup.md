# Live relay and cleanup research

Researched 2026-10-17. Planning only; no application changes or production experiments. Findings describe the current working tree, including uncommitted WebMCP work, and do not establish deployed behavior.

## Existing behavior

[worker/mcp.ts](../../../../worker/mcp.ts) queues commands and repeatedly reads the hub every 400 ms; `wait_for_requests` repeats storage-backed operations at up to 1.5-second intervals. [agent-store.ts](../../../../worker/agent-store.ts) persists context, drafts, requests and commands, with an aggregate draft cap of 256 MiB. [agent-context.ts](../../../../worker/agent-context.ts) identifies one last-reporting `tabId` for shared context. [agent-controller.ts](../../../../src/controllers/agent-controller.ts) checks restored connections every 30 seconds while visible. These are code observations, not production measurements.

[SessionStore](../../../../worker/index.ts) currently provides HTTP storage operations and an expiry alarm, without a hibernating WebSocket relay. Its class serves multiple record purposes, including sign-in/configuration and agent hubs. [src/webmcp.ts](../../../../src/webmcp.ts) contains experimental browser-local tools and account/repository/branch/commit/generation scope checks. Reusing that executor is a proposal, not evidence of an existing remote relay.

## Last-tab disconnection

Cloudflare delivers `webSocketClose` on detected disconnect. `getWebSockets()` excludes disconnected sockets but can include closing sockets. Proposed clean-close path: count eligible editor sockets, distinguish closing from usable connections, and schedule one cleanup alarm when the last connection ends. MCP clients must not count as editor presence. [State API](https://developers.cloudflare.com/durable-objects/api/state/), [base-class handlers](https://developers.cloudflare.com/durable-objects/api/base/)

Silent network loss has no documented maximum detection latency here. Browser JavaScript cannot directly send WebSocket protocol Ping frames; the standard exposes no Ping/Pong API and lets browsers probe at their discretion. Clean-close behavior cannot establish deletion within five minutes of physical network loss. [WebSockets Standard](https://websockets.spec.whatwg.org/#ping-and-pong-frames)

`setWebSocketAutoResponse` replies to matching application messages without waking the object. `getWebSocketAutoResponseTimestamp(socket)` returns its last automatic response time, or null: observation, not an expiry callback. Browser heartbeats can update that runtime timestamp without per-heartbeat application storage writes, but detecting their absence still needs a later event or scheduled liveness check. Timestamp support alone cannot deliver silent-loss cleanup without recurring checks. [State API](https://developers.cloudflare.com/durable-objects/api/state/)

A heartbeat lease changes product semantics: frozen pages suspend timers, and discarded pages receive no final event. Background visibility alone must not mean disconnection under the accepted Notes. Thresholds therefore need an explicit decision about suspended tabs and false expiry. [Chrome Page Lifecycle API](https://developer.chrome.com/docs/web-platform/page-lifecycle-api)

**Pending choice:** runtime-detected disconnect plus five-minute grace, or a defined liveness lease with checking costs and false-expiry behavior. Neither promises a physical-loss deadline.

## Cleanup, alarms and reconnection

Each object has one alarm. Execution is at least once; uncaught failures retry with exponential backoff from two seconds, up to six retries. Cleanup must be idempotent. Existing expiry purposes need a shared deadline scheduler or separate objects; constructors must not overwrite an existing alarm. [Alarms API](https://developers.cloudflare.com/durable-objects/api/alarms/)

Alarm timestamps have millisecond granularity, but documented maintenance/failover delays reach a minute. Five minutes is eligibility time, not a hard deletion deadline. `deleteAlarm()` does not stop an executing handler. [Storage API](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)

Proposed safeguard: retain minimal `generation` and `disconnectDeadline` metadata; reconnect invalidates them. Serialize the short cleanup transition with connection admission; at execution recheck current eligible sockets and deadline, deleting only the expired generation. Avoid unrelated network awaits between final check and deletion. Cancelling the alarm alone is insufficient. These are design requirements derived from [concurrency controls](https://developers.cloudflare.com/durable-objects/api/state/).

`deleteAll()` clears SQLite storage atomically; legacy KV deletion can partially fail. From compatibility date `2026-02-24`, it also deletes alarms; older dates need the flag or separate alarm deletion. Use it only on an isolated temporary-agent object whose entire contents may be erased, preserving sign-in and GitHub App configuration. Already-running handlers must also be fenced against recreating deleted data. [Storage API](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/), [compatibility change](https://developers.cloudflare.com/changelog/post/2026-02-24-deleteall-deletes-alarms/)

## Event-driven remote MCP

The official `latest` transport URL currently resolves to **2026-07-28**, not 2025-11-25. Current Streamable HTTP remains POST with JSON or request-scoped SSE responses, so awaiting browser results requires no storage polling. It removes protocol sessions and GET streams; closing an SSE response now **must cancel that request**, and `Last-Event-ID` resumability is unsupported. [Current transport](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)

Installed server/client packages are both **2.2.0**. Their READMEs identify v2 as stable and implementing 2026-07-28. Installed `server/dist/src-BHSMhZ_W.mjs` declares modern support `[2026-07-28]` separately from the exported legacy initialization list: `[2025-11-25, 2025-06-18, 2025-03-26, 2024-11-05, 2024-10-07]`. Exported `LATEST_PROTOCOL_VERSION` remains `2025-11-25`; this legacy constant alone does not describe modern support. These are local package observations; see the [official SDK repository](https://github.com/modelcontextprotocol/typescript-sdk).

The application uses `createMcpHandler` with `legacy: "stateless"`, `responseMode: "json"`, `maxSubscriptions: 0`. Proposed bridge: authorize, send a correlated browser WebSocket command, resolve its pending promise on the matching result, and return the HTTP response. Preserve explicit era detection; test modern discovery/per-request metadata and legacy initialization rather than inferring compatibility from package versions. [Versioning and compatibility](https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning)

For legacy 2025-11-25 SSE, disconnection **should not** imply cancellation; explicit cancellation and optional resumability apply. Keep this distinct from modern SSE cancellation; propagate the appropriate cancellation into browser work and discard stale results. JSON response abort behavior needs SDK/runtime testing because this application selects JSON mode. [Legacy transport](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)

An outstanding HTTP handler prevents DO hibernation. Finite command timeouts trade active duration for immediate results; pending promises are not durable recovery. Idle hibernatable sockets can sleep, but requests, timers and unfinished I/O prevent that. Shutdown can terminate sockets and interrupt requests. Attachments restore connection metadata after hibernation, not arbitrary pending executions. [Lifecycle](https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/), [WebSocket hibernation](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)

Proposed bounds: pending count, command/result bytes, per-call deadlines and socket output; reject overload instead of building an offline mailbox. Remove entries on completion, cancellation, timeout and disconnect. After restart, reconstruct attachment identity and require a fresh browser scope handshake; fail lost calls explicitly. Match account, grant, tab, repository, branch, commit and generation before applying commands/results. Mutation replay after ambiguous shutdown needs an explicit idempotency/reconciliation decision. These are proposed constraints, not platform guarantees.

## Minimum experiments and acceptance

In an isolated environment: verify idle hibernation and auto-response timestamps; close the last of two tabs and reconnect around the deadline; simulate silent loss, freeze/discard and deployment restart; force alarm retry/concurrent reconnect; flood bounded requests and stale results. Assert no draft/context mirroring or 400 ms/1.5 s storage polling, no cleanup while another eligible tab remains, preserved browser drafts/sign-in/configuration, and explicit lost-call failures. Record detection, deadline and deletion separately. No reduction percentage or production guarantee follows without measurement.
