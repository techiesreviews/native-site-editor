#!/usr/bin/env node
// Read-only Cloudflare analytics comparison of two completed windows for one
// Durable Object namespace (ticket 30). No mutations, no files written.
// Output holds analytics aggregates only: never billing counters, never a
// savings claim for windows that are incomplete or not comparable.
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const endpoint = "https://api.cloudflare.com/client/v4/graphql";
const hour = 3_600_000;
const week = 7 * 24 * hour;
const groupLimit = 1000;
/** Kept equal to OBSOLETE_AGENT_ROUTES in worker/app.ts (tests check it): 410 editor-updated, zero DO work. */
export const OBSOLETE_ROUTES = ["/api/agent/hub", "/api/agent/context", "/api/agent/drafts", "/api/agent/claim",
  "/api/agent/ack", "/api/agent/pause", "/api/agent/ask", "/api/agent/answer", "/api/agent/dismiss"];
/** Each maintenance HTTP request makes at most one DO fetch (tickets 27-28). */
export const MAINTENANCE_ROUTES = ["/__maintenance/inventory", "/__maintenance/cleanup"];
export const METRICS = [
  ["requests", "DO requests"], ["errors", "DO errors"], ["rowsRead", "Rows read"],
  ["rowsWritten", "Rows written"], ["duration", "Active duration (GB-s)"], ["storedBytes", "Max stored bytes"],
];

/** `START/END` in ISO-8601 UTC, end exclusive. */
export function parseWindow(text) {
  const [start, end, extra] = String(text ?? "").split("/");
  const at = value => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z$/.test(value ?? "") ? Date.parse(value) : NaN;
  const window = { start: at(start), end: at(end) };
  if (extra !== undefined || !Number.isFinite(window.start) || !Number.isFinite(window.end) || window.end <= window.start)
    throw new Error("A window is START/END in UTC, like 2026-10-15T00:00:00Z/2026-10-16T00:00:00Z");
  return window;
}

/** Complete = ended at least `settleHours` ago, so late analytics have arrived. */
export function windowCompleteness(window, now, settleHours) {
  const ready = window.end + settleHours * hour;
  if (window.end > now) return { complete: false, reason: "the window has not ended yet" };
  if (ready > now) return { complete: false, reason: `analytics may still arrive until ${iso(ready)}` };
  return { complete: true };
}

/** Reasons the two windows' shapes cannot be compared; empty when they can. */
export function shapeReasons(before, after) {
  const reasons = [];
  const length = window => window.end - window.start;
  if (length(before) !== length(after)) reasons.push("the windows have different lengths");
  else if (((after.start - before.start) % week + week) % week !== 0)
    reasons.push("the windows do not start on the same UTC weekday and time");
  if (before.start < after.end && after.start < before.end) reasons.push("the windows overlap");
  if (before.start > after.start) reasons.push("the before window starts after the after window");
  return reasons;
}

const number = value => typeof value === "number" && Number.isFinite(value) && value >= 0;

/** Account datasets. Unknown shape, GraphQL errors and full pages are failures, never zeros. */
export function readAccount(body) {
  if (body?.errors?.length) return { failure: "the analytics query was refused", detail: body.errors.map(error => error?.message).join("; ") };
  const accounts = body?.data?.viewer?.accounts;
  if (!Array.isArray(accounts) || accounts.length !== 1) return { failure: "no account data came back (check the account and token permission)" };
  const { invocations, periodic, storage } = accounts[0] ?? {};
  if (!Array.isArray(invocations) || !Array.isArray(periodic) || !Array.isArray(storage)) return { failure: "the analytics answer had an unknown shape" };
  if (invocations.length >= groupLimit) return { failure: "the invocation groups were cut off at the query limit" };
  // An empty dataset is absent evidence, not zero usage: its metrics stay undefined.
  const totals = { statuses: {} };
  if (invocations.length) Object.assign(totals, { requests: 0, errors: 0 });
  if (periodic.length) Object.assign(totals, { duration: 0, rowsRead: 0, rowsWritten: 0 });
  if (storage.length) totals.storedBytes = 0;
  for (const group of invocations) {
    const { requests, errors } = group?.sum ?? {};
    if (!number(requests) || !number(errors)) return { failure: "the analytics answer had an unknown shape" };
    totals.requests += requests; totals.errors += errors;
    if (errors) {
      const status = typeof group.dimensions?.status === "string" && /^[A-Za-z]{1,40}$/.test(group.dimensions.status) ? group.dimensions.status : "other";
      totals.statuses[status] = (totals.statuses[status] ?? 0) + errors;
    }
  }
  for (const group of periodic) {
    const { duration, rowsRead, rowsWritten } = group?.sum ?? {};
    if (![duration, rowsRead, rowsWritten].every(number)) return { failure: "the analytics answer had an unknown shape" };
    totals.duration += duration; totals.rowsRead += rowsRead; totals.rowsWritten += rowsWritten;
  }
  for (const group of storage) {
    const bytes = group?.max?.storedBytes;
    if (!number(bytes)) return { failure: "the analytics answer had an unknown shape" };
    totals.storedBytes = Math.max(totals.storedBytes, bytes);
  }
  return { totals };
}

/** Zone HTTP datasets, by path family. Only counts leave this function, never raw paths. */
export function readZone(body) {
  if (body?.errors?.length) return { failure: "the zone analytics query was refused", detail: body.errors.map(error => error?.message).join("; ") };
  const zones = body?.data?.viewer?.zones;
  if (!Array.isArray(zones) || zones.length !== 1) return { failure: "no zone data came back (check the zone and token permission)" };
  const counts = { staleClient: 0, staleOther: 0, maintenance: 0, maintenanceRefused: 0, mcp: 0 };
  for (const [field, classify] of [
    ["agent", (path, status) => OBSOLETE_ROUTES.includes(path) ? (status === 410 ? "staleClient" : "staleOther") : undefined],
    ["maintenance", (path, status) => MAINTENANCE_ROUTES.includes(path) ? (status >= 200 && status < 300 ? "maintenance" : "maintenanceRefused") : undefined],
    ["mcp", path => path === "/mcp" ? "mcp" : undefined],
  ]) {
    const groups = zones[0]?.[field];
    if (!Array.isArray(groups)) return { failure: "the zone analytics answer had an unknown shape" };
    if (groups.length >= groupLimit) return { failure: "the zone groups were cut off at the query limit" };
    for (const group of groups) {
      if (!number(group?.count)) return { failure: "the zone analytics answer had an unknown shape" };
      const kind = classify(group.dimensions?.clientRequestPath, group.dimensions?.edgeResponseStatus);
      if (kind) counts[kind] += group.count;
    }
  }
  return { counts };
}

/**
 * Splits one window where the data allows. Steady = DO requests minus the
 * maintenance calls; Watch shares /mcp with every other agent call, so it is
 * never separated from these datasets.
 */
export function attribute(totals, zone) {
  const rows = [];
  if (!zone || zone.failure) {
    const reason = `not measured: ${zone ? zone.failure : "no --zone/--host given"}`;
    return [["Steady operation (DO requests)", reason], ["Migration (maintenance DO calls)", reason],
      ["Watch", "not separable: Watch waits share /mcp with every agent call"], ["Stale-client Worker requests (410 editor-updated)", reason]];
  }
  const { counts } = zone;
  rows.push(["Steady operation (DO requests)", totals?.requests !== undefined
    ? `at most ${format(Math.max(0, totals.requests - counts.maintenance))} (DO requests minus accepted maintenance requests; includes Watch)`
    : "not measured: no DO request data"]);
  rows.push(["Migration (maintenance DO calls)", `at least ${format(counts.maintenance)} (one per accepted maintenance request; nested calls and later retention wakes are not visible here)` +
    (counts.maintenanceRefused ? `; ${format(counts.maintenanceRefused)} other answers, at most one DO call each` : "")]);
  rows.push(["Watch", `not separable: Watch waits share /mcp (${format(counts.mcp)} /mcp Worker requests in total)`]);
  rows.push(["Stale-client Worker requests (410 editor-updated)", `${format(counts.staleClient)} Worker requests, no DO work${counts.staleOther ? `; ${format(counts.staleOther)} other answers on old routes` : ""}`]);
  return rows;
}

/** Metric rows; `change` only when every comparability reason is absent and both windows hold data. */
export function compareMetrics(before, after, reasons) {
  return METRICS.map(([key, label]) => {
    const from = before?.[key], to = after?.[key];
    const change = reasons.length ? "not comparable" : from === undefined || to === undefined ? "no data" : from === to ? "no change" : from === 0 ? "new (was 0)"
      : `${(to - from) / from * 100 >= 0 ? "+" : ""}${((to - from) / from * 100).toFixed(1)}%`;
    return { key, label, before: from, after: to, change };
  });
}

/** Removes every secret and identifier from untrusted text, then caps it. */
export function redact(text, secrets) {
  return scrub(String(text ?? ""), secrets).replace(/[a-f0-9]{32,}/gi, "[redacted]").replace(/[^\x20-\x7e]/g, " ").slice(0, 160);
}

function scrub(text, secrets) {
  let value = text;
  for (const secret of secrets.filter(item => typeof item === "string" && item.length >= 4).sort((a, b) => b.length - a.length))
    value = value.split(secret).join("[redacted]");
  return value;
}
const tag = value => `sha256:${createHash("sha256").update(String(value)).digest("hex").slice(0, 8)}`;
const iso = ms => new Date(ms).toISOString().replace(".000Z", "Z");
const format = value => typeof value !== "number" ? "-" : Number.isInteger(value) ? value.toLocaleString("en-US")
  : value.toLocaleString("en-US", { maximumFractionDigits: 6 });

const accountQuery = `query DurableReport($account: string!, $namespace: string!, $start: Time!, $end: Time!) {
  viewer { accounts(filter: { accountTag: $account }) {
    invocations: durableObjectsInvocationsAdaptiveGroups(limit: ${groupLimit}, filter: { namespaceId: $namespace, datetime_geq: $start, datetime_lt: $end }) { sum { requests errors } dimensions { status } }
    periodic: durableObjectsPeriodicGroups(limit: 1, filter: { namespaceId: $namespace, datetime_geq: $start, datetime_lt: $end }) { sum { duration rowsRead rowsWritten } }
    storage: durableObjectsSqlStorageGroups(limit: 1, filter: { namespaceId: $namespace, datetime_geq: $start, datetime_lt: $end }) { max { storedBytes } }
  } }
}`;
const zoneQuery = `query DurableReportZone($zone: string!, $host: string!, $start: Time!, $end: Time!) {
  viewer { zones(filter: { zoneTag: $zone }) {
    agent: httpRequestsAdaptiveGroups(limit: ${groupLimit}, filter: { clientRequestHTTPHost: $host, clientRequestPath_like: "/api/agent/%", datetime_geq: $start, datetime_lt: $end }) { count dimensions { clientRequestPath edgeResponseStatus } }
    maintenance: httpRequestsAdaptiveGroups(limit: ${groupLimit}, filter: { clientRequestHTTPHost: $host, clientRequestPath_like: "/__maintenance/%", datetime_geq: $start, datetime_lt: $end }) { count dimensions { clientRequestPath edgeResponseStatus } }
    mcp: httpRequestsAdaptiveGroups(limit: ${groupLimit}, filter: { clientRequestHTTPHost: $host, clientRequestPath: "/mcp", datetime_geq: $start, datetime_lt: $end }) { count dimensions { clientRequestPath edgeResponseStatus } }
  } }
}`;

async function graphql(fetcher, token, query, variables) {
  try {
    const response = await fetcher(endpoint, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });
    if (response.status === 401 || response.status === 403) return { errors: [{ message: "permission refused" }] };
    if (!response.ok) return { errors: [{ message: `HTTP ${response.status}` }] };
    return await response.json();
  } catch {
    return { errors: [{ message: "the analytics service could not be reached" }] };
  }
}

/** Runs the read-only comparison. `ports.fetch` and `ports.now` are injectable for tests. */
export async function runReport(options, ports = {}) {
  const env = ports.env ?? process.env;
  const token = env.CLOUDFLARE_API_TOKEN;
  if (!token || token.length < 20) throw new Error("Set CLOUDFLARE_API_TOKEN in the environment (Account Analytics read)");
  if (!options.account || !options.namespace || !options.before || !options.after) throw new Error("Missing arguments; use --help");
  if (Boolean(options.zone) !== Boolean(options.host)) throw new Error("--zone and --host go together");
  const settleHours = options.settleHours ?? 3;
  if (!number(settleHours)) throw new Error("--settle-hours must be a number of hours");
  const now = (ports.now ?? Date.now)();
  const fetcher = ports.fetch ?? fetch;
  const secrets = [token, options.account, options.namespace, options.zone];
  const windows = { before: parseWindow(options.before), after: parseWindow(options.after) };
  const reasons = shapeReasons(windows.before, windows.after);
  const data = {};
  for (const name of ["before", "after"]) {
    const window = windows[name];
    const completeness = windowCompleteness(window, now, settleHours);
    if (!completeness.complete) reasons.push(`${name} window is incomplete: ${completeness.reason}`);
    const variables = { start: iso(window.start), end: iso(window.end) };
    const account = readAccount(await graphql(fetcher, token, accountQuery, { ...variables, account: options.account, namespace: options.namespace }));
    if (account.failure) reasons.push(`${name}: ${account.failure}${account.detail ? ` (${redact(account.detail, secrets)})` : ""}`);
    const zone = options.zone
      ? readZone(await graphql(fetcher, token, zoneQuery, { ...variables, zone: options.zone, host: options.host }))
      : undefined;
    if (zone?.failure && zone.detail) zone.failure = `${zone.failure} (${redact(zone.detail, secrets)})`;
    data[name] = { window, totals: account.totals, zone };
  }
  const metrics = compareMetrics(data.before.totals, data.after.totals, reasons);
  const lines = [
    "Durable Object usage comparison (Cloudflare analytics aggregates, not billing counters)",
    `account ${tag(options.account)}  namespace ${tag(options.namespace)}${options.zone ? `  zone ${tag(options.zone)}` : ""}`,
    `before: ${iso(windows.before.start)} to ${iso(windows.before.end)}`,
    `after:  ${iso(windows.after.start)} to ${iso(windows.after.end)}`,
    "",
    "| Metric | Before | After | Change |", "| --- | ---: | ---: | --- |",
    ...metrics.map(row => `| ${row.label} | ${format(row.before)} | ${format(row.after)} | ${row.change} |`),
  ];
  for (const name of ["before", "after"]) {
    const { totals, zone } = data[name];
    lines.push("", `Attribution, ${name} window:`);
    for (const [label, value] of attribute(totals, zone)) lines.push(`- ${label}: ${value}`);
    const statuses = Object.entries(totals?.statuses ?? {});
    lines.push(`- DO errors by invocation status: ${statuses.length ? statuses.map(([status, count]) => `${status} ${format(count)}`).join(", ") : totals?.errors === undefined ? "no data" : "none"} (a status alone does not prove a quota error)`);
  }
  lines.push("", reasons.length
    ? `Not comparable: ${reasons.join("; ")}. No change or saving is claimed.`
    : "Comparable windows. Changes describe these two windows only; they do not prove the historical quota problem is fixed.");
  if (metrics.some(row => row.change === "no data"))
    lines.push("No data: a dataset returned nothing for a window. That is missing evidence, not zero use; no change is claimed for it.");
  lines.push("Adaptive datasets can be sampled. Max stored bytes is the metric's maximum, not a total of all stored data.");
  const status = reasons.length ? "not-comparable" : "comparable";
  lines.push(`RESULT: ${status} durable-report ${metrics.map(row => `${row.key}=${row.change.replace(/ /g, "-")}`).join(" ")}`);
  // Final guard: nothing printed may contain a secret or identifier.
  const safe = lines.map(line => scrub(line, secrets));
  for (const line of safe) ports.stdout?.(line);
  return { status, reasons, metrics, data, lines: safe };
}

const help = `Usage: durable-report.mjs --account ID --namespace ID --before START/END --after START/END
                          [--zone ID --host editor.techies.tools] [--settle-hours 3]
Windows are UTC, end exclusive, e.g. 2026-10-15T00:00:00Z/2026-10-16T00:00:00Z.
Secret: CLOUDFLARE_API_TOKEN (environment only; Account Analytics read, plus Zone
Analytics read for --zone). Read-only. Prints "not comparable" with the reason when a
window is unfinished, still settling, or not the same length, weekday and time.`;

export function parseArgs(args) {
  const options = {};
  const fields = { "--account": "account", "--namespace": "namespace", "--before": "before", "--after": "after",
    "--zone": "zone", "--host": "host", "--settle-hours": "settleHours" };
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flag === "--help") return { help: true };
    const field = fields[flag];
    if (!field || !args[index + 1] || args[index + 1].startsWith("--")) throw new Error("Invalid report arguments; use --help");
    if (Object.hasOwn(options, field)) throw new Error("Duplicate report argument");
    options[field] = field === "settleHours" ? Number(args[++index]) : args[++index];
  }
  return options;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) console.log(help);
    else {
      const result = await runReport(options, { stdout: line => console.log(line) });
      if (result.status !== "comparable") process.exitCode = 2;
    }
  } catch (error) {
    // Only our own argument messages are shown; anything else could hold secrets.
    const own = error instanceof Error && /^(Set |Missing|Invalid|Duplicate|A window|--)/.test(error.message);
    console.error(`RESULT: failed durable-report; ${own ? error.message : "verify arguments and credentials"}`);
    process.exitCode = 1;
  }
}
