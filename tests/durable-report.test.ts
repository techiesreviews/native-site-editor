import assert from "node:assert/strict";
import test from "node:test";
import { handle, type Env } from "../worker/app.ts";
// @ts-expect-error Plain Node ESM intentionally has no declarations.
import { MAINTENANCE_ROUTES, OBSOLETE_ROUTES, attribute, parseArgs, parseWindow, readAccount, readZone, redact, runReport, shapeReasons, windowCompleteness } from "../scripts/agents/durable-report.mjs";

const token = "cf-api-token-secret-value";
const account = "acc0unt-tag-0123";
const namespace = "namespace-id-4567";
const zoneId = "zone-tag-89ab";
// Thursday 2026-10-22 12:00 UTC: Thursdays 10-15 and 10-22 (00:00-24:00) are a week apart.
const now = Date.UTC(2026, 9, 23, 12);
const before = "2026-10-15T00:00:00Z/2026-10-16T00:00:00Z";
const after = "2026-10-22T00:00:00Z/2026-10-23T00:00:00Z";
const base = { account, namespace, before, after };

/** Recorded-shape GraphQL answers (values from research/quota-baseline.md for the before day). */
const accountAnswer = (requests: number, rowsRead: number, rowsWritten: number, duration: number, storedBytes: number, extra: object[] = []) => ({
  data: { viewer: { accounts: [{
    invocations: [{ sum: { requests: requests - 1, errors: 0 }, dimensions: { status: "success" } },
      { sum: { requests: 1, errors: 1 }, dimensions: { status: "clientDisconnected" } }, ...extra],
    periodic: [{ sum: { duration, rowsRead, rowsWritten } }],
    storage: [{ max: { storedBytes } }],
  }] } },
});
const zoneAnswer = (stale: number, maintenance: number, mcp: number) => ({
  data: { viewer: { zones: [{
    agent: [
      { count: stale, dimensions: { clientRequestPath: "/api/agent/hub", edgeResponseStatus: 410 } },
      { count: 3, dimensions: { clientRequestPath: "/api/agent/context", edgeResponseStatus: 410 } },
      { count: 40, dimensions: { clientRequestPath: "/api/agent/relay", edgeResponseStatus: 101 } },
    ],
    maintenance: [
      { count: maintenance, dimensions: { clientRequestPath: "/__maintenance/cleanup", edgeResponseStatus: 200 } },
      { count: 2, dimensions: { clientRequestPath: "/__maintenance/inventory", edgeResponseStatus: 401 } },
    ],
    mcp: [{ count: mcp, dimensions: { clientRequestPath: "/mcp", edgeResponseStatus: 200 } }],
  }] } },
});

function fakeFetch(answers: Record<string, unknown[]>) {
  const calls: { url: string; auth: string; body: { query: string; variables: Record<string, string> } }[] = [];
  const fetcher = async (url: string, init: { headers: Record<string, string>; body: string }) => {
    const body = JSON.parse(init.body);
    calls.push({ url, auth: init.headers.Authorization, body });
    const kind = body.query.includes("DurableReportZone") ? "zone" : "account";
    const answer = answers[kind].shift();
    if (answer instanceof Response) return answer;
    return Response.json(answer);
  };
  return { calls, fetcher };
}
async function run(options: object, answers: Record<string, unknown[]>, at = now) {
  const { calls, fetcher } = fakeFetch(answers);
  const out: string[] = [];
  const result = await runReport({ ...base, ...options }, { env: { CLOUDFLARE_API_TOKEN: token }, fetch: fetcher, now: () => at, stdout: (line: string) => out.push(line) });
  return { result, calls, text: out.join("\n") };
}
const assertClean = (text: string) => {
  for (const secret of [token, account, namespace, zoneId]) assert.ok(!text.includes(secret), `output leaks ${secret}`);
};

test("window completeness: open, settling and settled windows", () => {
  const window = parseWindow(after);
  assert.deepEqual(windowCompleteness(window, Date.UTC(2026, 9, 22, 18), 3), { complete: false, reason: "the window has not ended yet" });
  assert.deepEqual(windowCompleteness(window, Date.UTC(2026, 9, 23, 1), 3), { complete: false, reason: "analytics may still arrive until 2026-10-23T03:00:00Z" });
  assert.deepEqual(windowCompleteness(window, Date.UTC(2026, 9, 23, 3), 3), { complete: true });
  for (const bad of ["2026-10-15", "2026-10-16T00:00:00Z/2026-10-15T00:00:00Z", "2026-10-15T00:00:00+02:00/2026-10-16T00:00:00Z", `${before}/x`])
    assert.throws(() => parseWindow(bad), /START\/END/);
});

test("comparable shapes need equal length, same UTC weekday and time, no overlap, before first", () => {
  const w = (text: string) => parseWindow(text);
  assert.deepEqual(shapeReasons(w(before), w(after)), []);
  assert.deepEqual(shapeReasons(w("2026-10-15T09:00:00Z/2026-10-15T17:00:00Z"), w("2026-10-29T09:00:00Z/2026-10-29T17:00:00Z")), []);
  assert.deepEqual(shapeReasons(w(before), w("2026-10-21T00:00:00Z/2026-10-22T00:00:00Z")), ["the windows do not start on the same UTC weekday and time"]);
  assert.deepEqual(shapeReasons(w(before), w("2026-10-22T00:00:00Z/2026-10-22T12:00:00Z")), ["the windows have different lengths"]);
  assert.deepEqual(shapeReasons(w(before), w("2026-10-15T01:00:00Z/2026-10-16T01:00:00Z")),
    ["the windows do not start on the same UTC weekday and time", "the windows overlap"]);
  assert.deepEqual(shapeReasons(w(after), w(before)), ["the before window starts after the after window"]);
});

test("comparable windows: one query per dataset family and window, sanitized table with changes and attribution", async () => {
  const { result, calls, text } = await run({ zone: zoneId, host: "editor.techies.tools" }, {
    account: [accountAnswer(95_517, 185_938, 7_841, 27.622147, 7_229_440), accountAnswer(9_500, 20_000, 900, 3.5, 6_983_680)],
    zone: [zoneAnswer(0, 0, 4_000), zoneAnswer(120, 10, 300)],
  });
  assert.equal(result.status, "comparable");
  assert.equal(calls.length, 4);
  for (const call of calls) {
    assert.equal(call.url, "https://api.cloudflare.com/client/v4/graphql");
    assert.equal(call.auth, `Bearer ${token}`);
  }
  assert.deepEqual(calls.map(call => [call.body.variables.start, call.body.variables.end]), [
    ["2026-10-15T00:00:00Z", "2026-10-16T00:00:00Z"], ["2026-10-15T00:00:00Z", "2026-10-16T00:00:00Z"],
    ["2026-10-22T00:00:00Z", "2026-10-23T00:00:00Z"], ["2026-10-22T00:00:00Z", "2026-10-23T00:00:00Z"]]);
  assert.match(calls[0].body.query, /durableObjectsInvocationsAdaptiveGroups[\s\S]*namespaceId: \$namespace/);
  assert.match(calls[0].body.query, /durableObjectsPeriodicGroups[\s\S]*durableObjectsSqlStorageGroups/);
  assert.match(text, /\| DO requests \| 95,517 \| 9,500 \| -90\.1% \|/);
  assert.match(text, /\| Rows written \| 7,841 \| 900 \| -88\.5% \|/);
  assert.match(text, /\| Max stored bytes \| 7,229,440 \| 6,983,680 \| -3\.4% \|/);
  assert.match(text, /\| DO errors \| 1 \| 1 \| no change \|/);
  // Attribution, after window: 10 accepted maintenance calls; 120 + 3 stale 410s; the relay is neither.
  assert.match(text, /after window:\n- Steady operation \(DO requests\): at most 9,490 /);
  assert.match(text, /- Migration \(maintenance DO calls\): at least 10 .*; 2 other answers, at most one DO call each/);
  assert.match(text, /- Watch: not separable: Watch waits share \/mcp \(300 \/mcp Worker requests in total\)/);
  assert.match(text, /- Stale-client Worker requests \(410 editor-updated\): 123 Worker requests, no DO work/);
  assert.match(text, /DO errors by invocation status: clientDisconnected 1 \(a status alone does not prove a quota error\)/);
  assert.match(text, /do not prove the historical quota problem is fixed/);
  assert.match(text, /^RESULT: comparable durable-report requests=-90\.1% /m);
  assertClean(text);
  assert.match(text, /account sha256:[0-9a-f]{8} {2}namespace sha256:[0-9a-f]{8} {2}zone sha256:[0-9a-f]{8}/);
});

test("not comparable: an unfinished or settling window never gets a change or saving", async () => {
  const answers = () => ({ account: [accountAnswer(95_517, 1, 1, 1, 1), accountAnswer(10, 1, 1, 1, 1)], zone: [] });
  for (const at of [Date.UTC(2026, 9, 22, 18), Date.UTC(2026, 9, 23, 1)]) {
    const { result, text } = await run({}, answers(), at);
    assert.equal(result.status, "not-comparable");
    assert.match(text, /\| DO requests \| 95,517 \| 10 \| not comparable \|/);
    assert.match(text, /Not comparable: after window is incomplete: .*No change or saving is claimed\./);
    assert.doesNotMatch(text, /%/);
  }
});

test("not comparable: different weekday, or a failed, refused, truncated or empty query", async () => {
  const different = await run({ after: "2026-10-21T00:00:00Z/2026-10-22T00:00:00Z" }, { account: [accountAnswer(5, 1, 1, 1, 1), accountAnswer(4, 1, 1, 1, 1)], zone: [] });
  assert.match(different.text, /Not comparable: the windows do not start on the same UTC weekday and time/);
  const cases: [unknown, RegExp][] = [
    [new Response("no", { status: 403 }), /after: the analytics query was refused \(permission refused\)/],
    [new Response("down", { status: 502 }), /after: the analytics query was refused \(HTTP 502\)/],
    [{ data: { viewer: { accounts: [] } } }, /after: no account data came back/],
    [{ data: { viewer: { accounts: [{ invocations: [{ sum: { requests: "7" } }], periodic: [], storage: [] }] } } }, /after: the analytics answer had an unknown shape/],
    [{ data: { viewer: { accounts: [{ invocations: Array.from({ length: 1000 }, () => ({ sum: { requests: 1, errors: 0 } })), periodic: [], storage: [] }] } } },
      /after: the invocation groups were cut off at the query limit/],
  ];
  for (const [answer, reason] of cases) {
    const { result, text } = await run({}, { account: [accountAnswer(5, 1, 1, 1, 1), answer], zone: [] });
    assert.equal(result.status, "not-comparable");
    assert.match(text, reason);
    assert.match(text, /\| DO requests \| 5 \| - \| not comparable \|/);
    assert.doesNotMatch(text, /%/);
  }
});

test("redaction: GraphQL errors that echo the token or ids never reach the output", async () => {
  const echo = { errors: [{ message: `unknown field namespaceId for ${namespace} in account ${account} with token ${token} id ${"ab".repeat(32)}\u001b[31m` }] };
  const { text } = await run({ zone: zoneId, host: "editor.techies.tools" }, {
    account: [accountAnswer(5, 1, 1, 1, 1), echo],
    zone: [zoneAnswer(1, 1, 1), { errors: [{ message: `zone ${zoneId} not authorized for ${token}` }] }],
  });
  assertClean(text);
  assert.ok(!text.includes("ab".repeat(32)));
  assert.match(text, /after: the analytics query was refused \(unknown field namespaceId for \[redacted\] in account \[redacted\] with token \[redacted\] id \[redacted\] \[31m\)/);
  assert.match(text, /Stale-client Worker requests \(410 editor-updated\): not measured: the zone analytics query was refused \(zone \[redacted\] not authorized for \[redacted\]\)/);
  assert.equal(redact("x".repeat(500), []).length, 160);
});

test("attribution without zone data says not measured; Watch is never separated", () => {
  const totals = readAccount(accountAnswer(100, 1, 1, 1, 1)).totals;
  assert.deepEqual(attribute(totals, undefined), [
    ["Steady operation (DO requests)", "not measured: no --zone/--host given"],
    ["Migration (maintenance DO calls)", "not measured: no --zone/--host given"],
    ["Watch", "not separable: Watch waits share /mcp with every agent call"],
    ["Stale-client Worker requests (410 editor-updated)", "not measured: no --zone/--host given"],
  ]);
  const zone = readZone(zoneAnswer(7, 2, 9));
  assert.deepEqual(zone.counts, { staleClient: 10, staleOther: 0, maintenance: 2, maintenanceRefused: 2, mcp: 9 });
  assert.match(attribute(totals, zone)[0][1], /^at most 98 /);
  assert.equal(readZone({ data: { viewer: { zones: [{ agent: [], maintenance: [] }] } } }).failure, "the zone analytics answer had an unknown shape");
});

test("the obsolete route list matches the Worker: each answers 410 editor-updated", async () => {
  for (const path of OBSOLETE_ROUTES) {
    const response = await handle(new Request(`https://editor.example${path}`, { method: "POST" }), {} as Env);
    assert.equal(response.status, 410, path);
    assert.equal((await response.json() as { code: string }).code, "editor-updated");
  }
  for (const path of ["/api/agent/relay", "/api/agent/connections"])
    assert.notEqual((await handle(new Request(`https://editor.example${path}`, { method: "POST" }), {} as Env)).status, 410);
  assert.deepEqual(MAINTENANCE_ROUTES, ["/__maintenance/inventory", "/__maintenance/cleanup"]);
});

test("arguments: token only from the environment; strict flags", async () => {
  assert.deepEqual(parseArgs(["--account", "a", "--namespace", "n", "--before", before, "--after", after, "--settle-hours", "6"]),
    { account: "a", namespace: "n", before, after, settleHours: 6 });
  assert.throws(() => parseArgs(["--token", token]), /Invalid report arguments/);
  assert.throws(() => parseArgs(["--account", "a", "--account", "b"]), /Duplicate/);
  await assert.rejects(runReport(base, { env: {}, fetch: async () => { throw new Error("no network"); } }), /CLOUDFLARE_API_TOKEN/);
  await assert.rejects(runReport({ ...base, zone: zoneId }, { env: { CLOUDFLARE_API_TOKEN: token } }), /--zone and --host/);
});
