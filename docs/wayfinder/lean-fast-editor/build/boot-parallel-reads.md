# Concurrent boot reads: preparation

The measured warm boot serializes session (118–222 ms), repository listing
(232–337), branches/snapshot (340–447), shown files (449–555), then a second
file level (557–662). Starting the first two reads together can remove one
network latency interval. This preparation does not hook `main.ts`, change
endpoints, or claim a measured timing improvement.

`startBootReads` in `src/boot-reads.ts` starts session and repository readers
synchronously. Repository failures settle privately, including a signed-out
401, while session failures retain the normal error path. The caller passes
its exact resolved `BootResponse<S>` envelope to `takeRepositories`; a foreign
session envelope is rejected. Adoption requires a signed-in user, nonempty
matching server session tags, and a still-current source/epoch both before and
after waiting for the repository result. An undefined result requests the
normal fresh read. The helper writes no application state.

The GET session and repository responses carry `X-Editor-Session`, SHA-256 of
`boot:` plus the authenticated random session ID. This opaque correlation tag
is not accepted as a credential. Raw session IDs and OAuth tokens never enter
the response. Signed-out or missing-ID sessions have no tag. JSON shapes,
repository onboarding headers and the existing server authorization checks
stay intact; the response wrapper continues applying `Cache-Control: no-store`.

## Adapter contract

- `BootResponse<T>`: `{ value: T; sessionTag?: string | null }`.
- `BootReadScope`: `{ source: string; epoch: number }`.
- `BootSession`: `{ user: { login: string } | null }`.
- `startBootReads<S extends BootSession, R>` accepts `readSession`,
  `readRepositories`, `scope` and `isCurrent(scope)` callbacks.
- It returns `session: Promise<BootResponse<S>>` and
  `takeRepositories(session): Promise<BootResponse<R> | undefined>`.

The adapters retain response headers alongside the parsed body; repository
metadata such as onboarding belongs inside `R`, without applying globals in
the speculative reader. The caller applies it only after adoption. Installation
or refresh return flows may ignore the prefetch and use their required fresh
listing. Each boot creates a new helper; never reuse results across accounts,
sources or generations. Read adapters keep the existing cookies, no-store and
retry behavior.

## Validation

Node 24; `npm run check`, `npm test` (1005 passed), `npm run build:ui` and
`git diff --check` passed. Tests cover concurrency, speculative rejection,
session errors, missing/mismatched tags, foreign session envelopes, stale
source/epoch, metadata retention, and actual worker routes for same-session,
new-session/same-account, other-account and signed-out responses. Targeted test
TypeScript checking uses `tsc --ignoreConfig --noEmit --strict --target ES2022 --lib ES2022 --module
ESNext --moduleResolution Bundler --allowImportingTsExtensions --skipLibCheck
--types node,@cloudflare/workers-types tests/boot-reads.test.ts
tests/boot-session-route.test.ts`.

Browser and performance checks await the separate main adapter. No deployment
or external writes ran. The observed final-files-to-paint gap remains separate
work; this change alone does not meet the 0.4 s warm paint budget.
