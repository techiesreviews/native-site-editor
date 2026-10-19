#!/usr/bin/env node
// Restricted, resumable discovery. No Cloudflare mutations or dependencies.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmodSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const idPattern = /^[a-f0-9]{64}$/;
const integer = value => Number.isSafeInteger(value) && value >= 0;
const object = value => value && typeof value === "object" && !Array.isArray(value);
const utcDay = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const scheduledBudget = value => value === undefined || (object(value) &&
  Object.entries(value).every(([day, count]) => utcDay(day) && integer(count)));
const kinds = new Set(["sign-in-session", "one-time-sign-in", "agent-grant", "legacy-agent-hub", "oauth-client", "oauth-request", "oauth-code", "app-config", "legacy-context", "legacy-drafts", "legacy-requests", "oauth-pending", "registration-limiter", "repository-cache", "relay-metadata", "alarm-deadlines", "agent-lifecycle", "record-fence", "workspace-ledger", "unknown"]);
const eligibilities = new Set(["preserve", "expired", "legacy-candidate", "review"]);
const statuses = new Set(["pending", "empty", "classified", "deferred", "unknown", "inaccessible"]);
const batchStatuses = new Set(["running", "complete", "limited", "paused", "inaccessible", "interrupted"]);

/** Shared with ticket 28: reserve and checkpoint BEFORE invoking maintenance. */
export function reserveMaintenance(budget, now, calls = 1, rows = 0, wakeDay) {
  if (!integer(calls) || !integer(rows) || (wakeDay !== undefined && !utcDay(wakeDay)))
    throw new Error("Invalid maintenance reservation");
  const day = new Date(now).toISOString().slice(0, 10);
  if (budget.day > day) return false;
  if (!scheduledBudget(budget.scheduled)) throw new Error("Invalid maintenance budget");
  if (budget.day !== day) {
    budget.day = day; budget.count = budget.scheduled?.[day] ?? 0;
    if (budget.rows !== undefined) budget.rows = 0;
    if (budget.scheduled) budget.scheduled = Object.fromEntries(Object.entries(budget.scheduled).filter(([at]) => at > day));
  }
  if (!integer(budget.count)) throw new Error("Invalid maintenance budget");
  // One immediate call and an optional retained-record wake must fit together.
  // An old crash reservation cannot authorize a wake on a day already past.
  if (wakeDay !== undefined && wakeDay < day) return false;
  const today = calls + Number(wakeDay === day);
  if (budget.count + today > 1000 || (budget.rows ?? 0) + rows > 5000 ||
      (wakeDay > day && (budget.scheduled?.[wakeDay] ?? 0) + 1 > 1000)) return false;
  budget.count += today;
  if (wakeDay > day) budget.scheduled = { ...budget.scheduled, [wakeDay]: (budget.scheduled?.[wakeDay] ?? 0) + 1 };
  if (rows) budget.rows = (budget.rows ?? 0) + rows;
  return true;
}

/** An authoritative Retry-After (seconds or HTTP date) as an absolute deadline, or 0. */
export function retryDeadline(headers, now) {
  const value = headers.get("Retry-After")?.trim();
  if (!value) return 0;
  if (/^\d+$/.test(value)) return now + Number(value) * 1000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(date, now) : 0;
}

/** Treat the maintenance response as untrusted; persist only this schema. */
export function sanitizeClassification(value) {
  if (!object(value) || value.schema !== "durable-inventory" || value.version !== 1 ||
      !["classified", "deferred", "unknown"].includes(value.status) ||
      !integer(value.totalKeys) || !integer(value.totalBytes) || !Array.isArray(value.records) || value.records.length > 2048 ||
      !(value.alarm === null || integer(value.alarm))) throw new Error("Invalid inventory classification");
  const records = value.records.map(item => {
    if (!object(item) || !kinds.has(item.kind) || !eligibilities.has(item.eligibility) || !integer(item.count) || !integer(item.bytes))
      throw new Error("Invalid inventory record");
    const record = { kind: item.kind, count: item.count, bytes: item.bytes, eligibility: item.eligibility };
    if (record.kind !== "unknown") {
      for (const field of ["earliestExpiresAt", "latestExpiresAt", "generation"])
        if (integer(item[field])) record[field] = item[field];
      if (record.kind === "legacy-agent-hub") {
        if (integer(item.grants)) record.grants = item.grants;
        if (typeof item.inlineContext === "boolean") record.inlineContext = item.inlineContext;
        if (object(item.commandsByState)) record.commandsByState = Object.fromEntries(
          ["pending", "applied", "conflict", "failed", "unknown"].map(state => [state, integer(item.commandsByState[state]) ? item.commandsByState[state] : 0]),
        );
      }
    }
    return record;
  });
  return {
    schema: "durable-inventory", version: 1, status: value.status,
    ...(typeof value.fingerprint === "string" && idPattern.test(value.fingerprint) ? { fingerprint: value.fingerprint } : {}),
    ...(value.status === "deferred" ? { reason: "oversized" } : {}),
    totalKeys: value.totalKeys, totalBytes: value.totalBytes, alarm: value.alarm, records,
  };
}

export function manifestPath(options, cwd = process.cwd()) {
  if (options.manifest) return resolve(cwd, options.manifest);
  const common = execFileSync("git", ["-C", cwd, "rev-parse", "--path-format=absolute", "--git-common-dir"], { encoding: "utf8" }).trim();
  return join(dirname(common), ".scratch", "durable-inventory", `${options.deployment}-${options.namespace}.json`);
}

/** Atomic restricted checkpoint; also used by later cleanup batches. */
export function writeManifest(path, manifest) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  chmodSync(dirname(path), 0o700);
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600, flag: "wx" });
    renameSync(temporary, path);
  } finally { rmSync(temporary, { force: true }); }
}

/** Shared namespace ledger and lock, independent of deployment and manifest overrides. */
export function maintenanceBudgetPath(options, ports, path) {
  return ports.budgetPath ?? join(ports.path ? dirname(path) :
    dirname(manifestPath({ ...options, manifest: undefined }, ports.cwd)), `${options.account}-${options.namespace}.budget.json`);
}
export function maintenanceLock(path, label) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  chmodSync(dirname(path), 0o700);
  let descriptor;
  try { descriptor = openSync(`${path}.lock`, "wx", 0o600); }
  catch { throw new Error(`${label} is locked; inspect the previous run before removing its lock`); }
  return () => { closeSync(descriptor); rmSync(`${path}.lock`, { force: true }); };
}
export function maintenanceBudget(path, options, previous, clock) {
  if (!scheduledBudget(previous.scheduled)) throw new Error("Invalid namespace budget");
  let budget = { account: options.account, namespace: options.namespace, ...previous };
  if (existsSync(path)) {
    let saved;
    try { saved = JSON.parse(readFileSync(path, "utf8")); } catch { throw new Error("Unreadable namespace budget"); }
    if (!object(saved) || saved.account !== options.account || saved.namespace !== options.namespace ||
        typeof saved.day !== "string" || !/^\d{4}-\d{2}-\d{2}$|^$/.test(saved.day) || !integer(saved.count) ||
        (saved.rows !== undefined && !integer(saved.rows)) || (saved.notBefore !== undefined && !integer(saved.notBefore)) ||
        !scheduledBudget(saved.scheduled))
      throw new Error("Invalid namespace budget");
    // Preserve the whole ledger (including fields another maintenance tool owns).
    budget = { ...saved };
    for (const [day, count] of Object.entries(previous.scheduled ?? {})) {
      if (day > budget.day) budget.scheduled = { ...budget.scheduled, [day]: Math.max(budget.scheduled?.[day] ?? 0, count) };
    }
    if (previous.day > saved.day) {
      reserveMaintenance(budget, Date.parse(previous.day), 0);
      budget.count = Math.max(budget.count, previous.count); budget.rows = previous.rows ?? 0;
    }
    else if (previous.day === saved.day) budget.count = Math.max(saved.count, previous.count);
  }
  const save = () => writeManifest(path, budget);
  const cooldown = (result, fallback = 0) => {
    const deadline = retryDeadline(result.headers, clock()) || (fallback ? clock() + fallback : 0);
    if (deadline > (budget.notBefore ?? 0)) { budget.notBefore = deadline; save(); }
  };
  return { budget, save, cooldown };
}

function fresh(options, now, budget = { day: "", count: 0 }) {
  return {
    schema: "durable-inventory-manifest", version: 1,
    account: options.account, deployment: options.deployment, namespace: options.namespace,
    cursor: null, listComplete: false, permission: "unconfirmed", objects: [], batches: [],
    scanTime: now, budget,
  };
}

/** Loading also strips extra fields from checkpoints before they are rewritten. */
export function readManifest(path, options, now) {
  if (!existsSync(path)) return fresh(options, now);
  let source;
  try { source = JSON.parse(readFileSync(path, "utf8")); } catch { throw new Error("Unreadable inventory manifest"); }
  if (!object(source) || source.schema !== "durable-inventory-manifest" || source.version !== 1 ||
      source.account !== options.account || source.namespace !== options.namespace || source.deployment !== options.deployment ||
      !object(source.budget) || typeof source.budget.day !== "string" || !/^\d{4}-\d{2}-\d{2}$|^$/.test(source.budget.day) || !integer(source.budget.count) ||
      !scheduledBudget(source.budget.scheduled) ||
      !Array.isArray(source.objects) || !Array.isArray(source.batches) || !(source.cursor === null || typeof source.cursor === "string"))
    throw new Error("Invalid or mismatched inventory manifest");
  const budget = { day: source.budget.day, count: source.budget.count,
    ...(source.budget.scheduled !== undefined ? { scheduled: { ...source.budget.scheduled } } : {}) };
  if (options.rescan) return fresh(options, now, budget);
  const manifest = fresh(options, now, budget);
  manifest.cursor = source.cursor;
  manifest.listComplete = source.listComplete === true;
  manifest.permission = ["confirmed", "inaccessible"].includes(source.permission) ? source.permission : "unconfirmed";
  manifest.scanTime = integer(source.scanTime) ? source.scanTime : now;
  const ids = new Set();
  manifest.objects = source.objects.map(entry => {
    if (!object(entry) || typeof entry.id !== "string" || !idPattern.test(entry.id) || ids.has(entry.id) || typeof entry.hasStoredData !== "boolean" || !statuses.has(entry.status))
      throw new Error("Invalid manifest object");
    ids.add(entry.id);
    const clean = { id: entry.id, hasStoredData: entry.hasStoredData, status: entry.status };
    if (integer(entry.checkedAt)) clean.checkedAt = entry.checkedAt;
    if (entry.classification) clean.classification = sanitizeClassification(entry.classification);
    if (clean.status === "classified" && !clean.classification) throw new Error("Missing manifest classification");
    if (clean.status === "empty" && clean.hasStoredData) throw new Error("Invalid empty manifest object");
    return clean;
  });
  manifest.batches = source.batches.map(batch => ({
    start: integer(batch.start) ? batch.start : now,
    end: integer(batch.end) ? batch.end : null,
    calls: integer(batch.calls) ? batch.calls : 0,
    status: batchStatuses.has(batch.status) ? batch.status : "interrupted",
  }));
  for (const batch of manifest.batches) if (batch.status === "running") { batch.status = "interrupted"; batch.end = now; }
  return manifest;
}

export function inventoryReport(manifest) {
  const report = { scanned: 0, classified: 0, deferred: 0, unknown: 0, inaccessible: 0, empty: 0, pending: 0, complete: false };
  for (const entry of manifest.objects) {
    if (entry.status !== "pending") report.scanned++;
    report[entry.status]++;
    if (entry.status === "pending") report.deferred++;
  }
  if (manifest.permission === "inaccessible") report.inaccessible++;
  report.complete = manifest.listComplete && manifest.permission === "confirmed" &&
    !report.pending && !report.deferred && !report.unknown && !report.inaccessible;
  return report;
}

export function validate(options) {
  for (const field of ["account", "namespace", "deployment"])
    if (typeof options[field] !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(options[field])) throw new Error(`Invalid --${field}`);
  if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 100) throw new Error("--limit must be between 1 and 100");
  let url;
  try { url = new URL(options.maintenanceUrl); } catch { throw new Error("Invalid --maintenance-url"); }
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash)
    throw new Error("--maintenance-url must be an HTTPS origin");
  return url.origin;
}

/** Injectable network, clock, environment and checkpoint path; never log bodies. */
export async function runInventory(input, ports = {}) {
  const options = { limit: 100, ...input };
  const origin = validate(options);
  const fetcher = ports.fetch ?? ((...args) => fetch(...args));
  const clock = ports.clock ?? (() => Date.now());
  const env = ports.env ?? process.env;
  if (!env.CLOUDFLARE_API_TOKEN || !env.MAINTENANCE_INVENTORY_TOKEN || env.MAINTENANCE_INVENTORY_TOKEN.length < 32)
    throw new Error("CLOUDFLARE_API_TOKEN and a maintenance token of at least 32 characters are required");
  const path = ports.path ?? manifestPath(options, ports.cwd);
  // A namespace has one budget across deployment labels and manifest overrides.
  // Injected test paths isolate the ledger alongside their test manifest.
  const budgetPath = maintenanceBudgetPath(options, ports, path);
  const releaseNamespace = maintenanceLock(budgetPath, "Namespace budget");
  let releaseManifest;
  try {
    releaseManifest = maintenanceLock(path, "Inventory manifest");
    const manifest = readManifest(path, options, clock());
    const ledger = maintenanceBudget(budgetPath, options, manifest.budget, clock);
    manifest.budget = ledger.budget;
    const saveBudget = () => ledger.save();
    const cooldown = result => ledger.cooldown(result);
    saveBudget();
    const batch = { start: clock(), end: null, calls: 0, status: "running" };
    manifest.batches.push(batch);
    const checkpoint = () => writeManifest(path, manifest);
    checkpoint();
    const attempted = new Set();
    let processed = 0, pages = 0;
    const cursors = new Set();
    const pause = status => { batch.status = status; };
    try {
      for (;;) {
        // No network call of any kind before an authoritative Retry-After passes.
        if (clock() < ledger.budget.notBefore) { pause("paused"); break; }
        const entry = manifest.objects.find(item => !attempted.has(item.id) && ["pending", "deferred", "inaccessible"].includes(item.status));
        if (entry) {
          if (processed >= options.limit) { pause("limited"); break; }
          attempted.add(entry.id);
          if (!entry.hasStoredData) {
            entry.status = "empty"; entry.checkedAt = clock(); processed++; checkpoint(); continue;
          }
          if (!reserveMaintenance(manifest.budget, clock())) { pause("limited"); break; }
          batch.calls++;
          saveBudget();
          // Charge even a network failure or a crash before receiving a reply.
          checkpoint();
          let result;
          try {
            result = await fetcher(`${origin}/__maintenance/inventory`, {
              method: "POST", headers: { Authorization: `Bearer ${env.MAINTENANCE_INVENTORY_TOKEN}`, "Content-Type": "application/json" },
              body: JSON.stringify({ id: entry.id }), redirect: "error",
            });
          } catch {
            entry.status = "deferred"; entry.checkedAt = clock(); pause("interrupted"); checkpoint(); break;
          }
          processed++;
          cooldown(result);
          entry.checkedAt = clock();
          delete entry.classification;
          if (result.status === 401 || result.status === 403) {
            entry.status = "inaccessible"; pause("inaccessible"); checkpoint(); break;
          }
          if (!result.ok) {
            entry.status = "deferred";
            // Includes 429 and quota 503. Stop on Retry-After; never spin/retry.
            pause("paused"); checkpoint(); break;
          }
          try {
            const classification = sanitizeClassification(await result.json());
            entry.classification = classification;
            entry.status = classification.status === "deferred" ? "deferred" :
              classification.status === "unknown" || classification.records.some(record => record.kind === "unknown" || record.eligibility === "review") ? "unknown" : "classified";
          } catch { entry.status = "unknown"; }
          checkpoint();
          if (result.headers.has("Retry-After")) { pause("paused"); break; }
          continue;
        }
        if (manifest.listComplete) { pause(inventoryReport(manifest).complete ? "complete" : "paused"); break; }
        if (processed >= options.limit) { pause("limited"); break; }
        if (pages++ >= 100 || cursors.has(manifest.cursor)) { pause("paused"); break; }
        cursors.add(manifest.cursor);
        const url = new URL(`https://api.cloudflare.com/client/v4/accounts/${options.account}/workers/durable_objects/namespaces/${options.namespace}/objects`);
        // The API takes 10 at least; extra IDs wait as pending in the checkpoint.
        url.searchParams.set("limit", String(Math.max(10, options.limit - processed)));
        if (manifest.cursor !== null) url.searchParams.set("cursor", manifest.cursor);
        let result, body;
        try {
          result = await fetcher(url.href, { headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` }, redirect: "error" });
          cooldown(result);
          if (result.status === 401 || result.status === 403) { manifest.permission = "inaccessible"; pause("inaccessible"); break; }
          if (!result.ok) { pause("paused"); break; }
          body = await result.json();
        } catch { pause("interrupted"); break; }
        if (body?.success !== true) {
          // Conservatively report failed discovery as inaccessible; no error
          // text supplied by Cloudflare is ever persisted or printed.
          manifest.permission = "inaccessible"; pause("inaccessible"); break;
        }
        const cursor = body.result_info?.cursor;
        if (!Array.isArray(body.result) || body.result.some(item => !object(item) || typeof item.id !== "string" || !idPattern.test(item.id) || typeof item.hasStoredData !== "boolean") ||
            !(cursor === undefined || cursor === null || typeof cursor === "string")) {
          manifest.permission = "inaccessible"; pause("inaccessible"); break;
        }
        manifest.permission = "confirmed";
        const known = new Set(manifest.objects.map(item => item.id));
        for (const item of body.result) if (!known.has(item.id)) {
          manifest.objects.push({ id: item.id, hasStoredData: item.hasStoredData, status: "pending" }); known.add(item.id);
        }
        // Save the ENTIRE page before advancing its opaque cursor. Interruption
        // resumes these pending IDs before listing the next page.
        const repeated = cursor && cursor === manifest.cursor;
        manifest.cursor = cursor || null;
        manifest.listComplete = !cursor;
        checkpoint();
        if (repeated || result.headers.has("Retry-After")) { pause("paused"); break; }
      }
    } finally { batch.end = clock(); if (batch.status === "running") batch.status = "interrupted"; checkpoint(); }
    const report = inventoryReport(manifest);
    const line = `RESULT: ${batch.status} durable-inventory ${JSON.stringify(report)}`;
    ports.stdout?.(line);
    return { manifest, report, status: batch.status, line };
  } finally {
    releaseManifest?.();
    releaseNamespace();
  }
}

const help = `Usage: durable-inventory.mjs --account ID --namespace ID --deployment LABEL --maintenance-url https://worker.example [--limit 1..100] [--manifest FILE] [--rescan]
Secrets: CLOUDFLARE_API_TOKEN, MAINTENANCE_INVENTORY_TOKEN (environment only).
Resume pending/deferred objects, then the saved cursor. --rescan starts a new
pass and retains the namespace's daily maintenance budget. No deletion.`;

export function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flag === "--help") return { help: true };
    if (flag === "--rescan") { options.rescan = true; continue; }
    if (!["--account", "--namespace", "--deployment", "--maintenance-url", "--limit", "--manifest"].includes(flag) || !args[index + 1] || args[index + 1].startsWith("--"))
      throw new Error("Invalid inventory arguments; use --help");
    const field = flag === "--maintenance-url" ? "maintenanceUrl" : flag.slice(2);
    if (Object.hasOwn(options, field)) throw new Error("Duplicate inventory argument");
    options[field] = flag === "--limit" ? Number(args[++index]) : args[++index];
  }
  return options;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) console.log(help);
    else {
      const result = await runInventory(options, { stdout: line => console.log(line) });
      if (!result.report.complete) process.exitCode = 1;
    }
  } catch {
    // Never echo an exception: fetch, filesystem and parse errors can embed
    // response content, CLI input or secret headers.
    console.error("RESULT: failed durable-inventory; verify arguments, credentials and restricted checkpoint");
    process.exitCode = 1;
  }
}
