#!/usr/bin/env node
// Opt-in, local-checkpoint-driven cleanup. Discovery belongs to durable-inventory.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  maintenanceBudget, maintenanceBudgetPath, maintenanceLock, manifestPath,
  readManifest, reserveMaintenance, validate, writeManifest,
} from "./durable-inventory.mjs";

const integer = value => Number.isSafeInteger(value) && value >= 0;
const hex = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const utcDay = at => new Date(at).toISOString().slice(0, 10);
const validDay = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) && utcDay(Date.parse(value)) === value;
// Checkpoints need correlation for crash resume/verification, never raw DO ids.
const identity = id => createHash("sha256").update(id).digest("hex");
const statuses = new Set(["reserved", "deleted", "kept", "deferred", "review", "inaccessible"]);
const reasons = new Set(["oversized", "changed", "present", "awaiting-browser-recovery", "budget"]);
const methods = new Set(["deleteAll", "keys"]);

function candidate(entry) {
  const value = entry.classification;
  if (entry.status === "inaccessible" || entry.status === "unknown" || value?.status === "unknown" ||
      value?.records.some(record => record.kind === "unknown" || record.eligibility === "review")) return "review";
  if (entry.status === "deferred" || value?.status === "deferred") return "oversized";
  if (!value?.fingerprint) return entry.status === "empty" ? "kept" : "needs-reinventory";
  if (value.records.some(record => record.eligibility === "legacy-candidate")) return "awaiting-browser-recovery";
  return entry.status === "classified" && value.status === "classified" && value.records.some(record => record.eligibility === "expired")
    ? "eligible" : "kept";
}

function retainedWakeDay(classification) {
  const times = classification.records.filter(record => record.eligibility === "preserve" &&
    ["sign-in-session", "one-time-sign-in", "agent-grant", "legacy-agent-hub", "oauth-client", "oauth-request", "oauth-code", "record-fence"].includes(record.kind))
    .map(record => record.latestExpiresAt).filter(integer);
  return times.length ? utcDay(Math.max(...times)) : undefined;
}

function loadCheckpoint(path, options) {
  const fresh = { schema: "durable-cleanup-checkpoint", version: 1, account: options.account,
    namespace: options.namespace, deployment: options.deployment, canary: [], objects: [], lastBatch: 0 };
  if (!existsSync(path)) return fresh;
  let source;
  try { source = JSON.parse(readFileSync(path, "utf8")); } catch { throw new Error("Unreadable cleanup checkpoint"); }
  if (!source || source.schema !== fresh.schema || source.version !== 1 || source.account !== options.account ||
      source.namespace !== options.namespace || source.deployment !== options.deployment || !integer(source.lastBatch) ||
      !Array.isArray(source.canary) || source.canary.length > 10 || source.canary.some(key => !hex(key)) ||
      new Set(source.canary).size !== source.canary.length || !Array.isArray(source.objects)) throw new Error("Invalid cleanup checkpoint");
  fresh.lastBatch = source.lastBatch;
  fresh.canary = source.canary;
  const seen = new Set();
  fresh.objects = source.objects.map(entry => {
    if (!entry || !hex(entry.key) || seen.has(entry.key) || !hex(entry.expected) || !statuses.has(entry.status) ||
        !integer(entry.deletedKeys) || !integer(entry.unresolvedCommands) ||
        ![1, 2].includes(entry.allowance) || !integer(entry.keys) || entry.keys > 2048 ||
        (entry.wakeDay !== undefined && (!validDay(entry.wakeDay) || entry.allowance !== 2))) throw new Error("Invalid cleanup entry");
    seen.add(entry.key);
    return { key: entry.key, expected: entry.expected, status: entry.status,
      deletedKeys: entry.deletedKeys, unresolvedCommands: entry.unresolvedCommands, allowance: entry.allowance, keys: entry.keys,
      ...(entry.wakeDay !== undefined ? { wakeDay: entry.wakeDay } : {}),
      ...(reasons.has(entry.reason) ? { reason: entry.reason } : {}),
      ...(methods.has(entry.method) ? { method: entry.method } : {}) };
  });
  return fresh;
}

/** Never persist a response body, runtime text or arbitrary response fields. */
function sanitizeResult(value) {
  if (!value || value.schema !== "durable-cleanup" || value.version !== 1 ||
      !["deleted", "kept", "deferred", "review"].includes(value.status) || !hex(value.fingerprint) ||
      !["deletedKeys", "keptKeys", "unresolvedCommands", "invocations"].every(field => integer(value[field])) || value.invocations < 1 ||
      (value.status === "deferred" && !reasons.has(value.reason)) ||
      (value.status === "deleted" && (!["keys", "deleteAll"].includes(value.method) || value.deletedKeys < 1)) ||
      (value.status !== "deleted" && value.deletedKeys !== 0)) throw new Error("Invalid cleanup result");
  return { status: value.status, reason: reasons.has(value.reason) ? value.reason : undefined,
    method: value.status === "deleted" ? value.method : undefined,
    deletedKeys: value.deletedKeys, unresolvedCommands: value.unresolvedCommands, invocations: value.invocations };
}

function reportFor(manifest, checkpoint, verification = false) {
  const report = { scanned: 0, classified: 0, deleted: 0, deferred: 0, unknown: 0, review: 0, inaccessible: 0,
    reappeared: 0, unresolvedCommands: 0, complete: false };
  const previous = new Map(checkpoint.objects.map(entry => [entry.key, entry]));
  const seen = new Set();
  for (const entry of manifest.objects) {
    const key = identity(entry.id);
    seen.add(key);
    const outcome = previous.get(key);
    if (entry.status !== "pending") report.scanned++;
    if (entry.status === "classified") report.classified++;
    if (entry.status === "unknown") report.unknown++;
    const category = candidate(entry);
    if (category === "review" || (!verification && outcome?.status === "review")) report.review++;
    if (entry.status === "inaccessible" || (!verification && outcome?.status === "inaccessible")) report.inaccessible++;
    const handled = !verification && outcome?.expected === entry.classification?.fingerprint &&
      ["deleted", "kept"].includes(outcome?.status);
    if ((category !== "kept" && category !== "review" && !handled) || (!verification && outcome?.status === "reserved") ||
        (!verification && ["deferred", "inaccessible", "review"].includes(outcome?.status))) report.deferred++;
    // The source inventory predates the deletion. Only the subsequent scan can
    // establish reappearance; an old manifest must never report false races.
    // A per-key pass keeps preserved records by design: only expired content
    // found again counts. A deleteAll object must have no stored data left.
    if (verification && outcome?.deletedKeys > 0 && (outcome.method === "keys" ? category === "eligible" :
      entry.hasStoredData && entry.classification?.totalKeys !== 0)) report.reappeared++;
  }
  if (manifest.permission === "inaccessible") report.inaccessible++;
  for (const entry of checkpoint.objects) {
    if (entry.deletedKeys > 0) report.deleted++;
    report.unresolvedCommands += entry.unresolvedCommands;
    if (!verification && !seen.has(entry.key) && entry.status === "reserved") report.deferred++;
  }
  return report;
}

/** Injectable fetch/clock/env/paths/stdout. Dry runs never open a network connection. */
export async function runCleanup(input, ports = {}) {
  const options = { limit: 10, ...input };
  const origin = validate(options);
  if (options.delete && options.verify) throw new Error("Choose delete or verify");
  for (const field of ["rowsPerKey", "rowsPerObject"]) if (options[field] !== undefined && !integer(options[field]))
    throw new Error("Invalid row accounting");
  const accounting = options.rowsPerKey !== undefined && options.rowsPerObject !== undefined;
  const clock = ports.clock ?? (() => Date.now());
  const env = ports.env ?? process.env;
  const path = ports.path ?? manifestPath(options, ports.cwd);
  const cleanupPath = join(dirname(path), `${options.deployment}-${options.namespace}.cleanup.json`);
  const budgetPath = maintenanceBudgetPath(options, ports, path);
  const finish = (status, report, plan) => {
    const line = `RESULT: ${status} durable-cleanup ${JSON.stringify(plan ? { ...report, plan } : report)}`;
    ports.stdout?.(line);
    return { status, report, ...(plan ? { plan } : {}), line };
  };
  if (!existsSync(path)) throw new Error("Inventory manifest required");
  // Even verification uses both writers' namespace lock. No races with a rescan.
  const releaseNamespace = maintenanceLock(budgetPath, "Namespace budget");
  let releaseCleanup, releaseInventory;
  try {
    releaseCleanup = maintenanceLock(cleanupPath, "Cleanup checkpoint");
    releaseInventory = maintenanceLock(path, "Inventory manifest");
    const manifest = readManifest(path, { ...options, rescan: false }, clock());
    const checkpoint = loadCheckpoint(cleanupPath, options);
    if (options.verify) {
      const report = reportFor(manifest, checkpoint, true);
      // scanTime is set only by --rescan. Finished listing alone is insufficient.
      const fresh = existsSync(cleanupPath) && manifest.scanTime > checkpoint.lastBatch && manifest.listComplete && manifest.permission === "confirmed" &&
        manifest.batches.length > 0 && manifest.batches.every(batch => batch.end !== null && batch.end > checkpoint.lastBatch);
      // A failed or reserved outcome must be reclassified in the fresh scan.
      const unresolved = checkpoint.objects.some(outcome => {
        const entry = manifest.objects.find(item => identity(item.id) === outcome.key);
        return entry && candidate(entry) !== "kept";
      });
      report.complete = Boolean(fresh && !unresolved && !report.deferred && !report.review && !report.unknown && !report.inaccessible && !report.reappeared);
      if (report.complete) { rmSync(cleanupPath); rmSync(path); }
      return finish(report.complete ? "complete" : "verification-failed", report);
    }
    const plan = { eligible: 0, deferred: 0, review: 0, "awaiting-browser-recovery": 0, oversized: 0, "needs-reinventory": 0 };
    for (const entry of manifest.objects) {
      const category = candidate(entry);
      if (category === "kept") continue;
      if (category === "eligible" || category === "review") plan[category]++;
      else { plan.deferred++; plan[category]++; }
    }
    if (!options.delete) return finish("plan", reportFor(manifest, checkpoint), plan);
    if (options.canaryVerified && !accounting) return finish("needs-accounting", reportFor(manifest, checkpoint));
    if (!env.MAINTENANCE_CLEANUP_TOKEN || env.MAINTENANCE_CLEANUP_TOKEN.length < 32) throw new Error("Cleanup token required");
    const batchMode = checkpoint.canary.length === 10 && options.canaryVerified;
    if (checkpoint.canary.length === 10 && !options.canaryVerified && !checkpoint.objects.some(entry => entry.status === "reserved"))
      return finish("canary-complete", reportFor(manifest, checkpoint));
    const ledger = maintenanceBudget(budgetPath, options, manifest.budget, clock);
    ledger.save();
    const save = () => { checkpoint.lastBatch = Math.max(checkpoint.lastBatch, clock()); writeManifest(cleanupPath, checkpoint); };
    save(); // An empty pass still needs a checkpoint for a later verified rescan.
    const fetcher = ports.fetch ?? ((...args) => fetch(...args));
    let status = "complete", processed = 0;
    // A reserved entry is retried first, using its original expected digest.
    const entries = [...manifest.objects].sort((a, b) =>
      Number(checkpoint.objects.some(entry => entry.key === identity(b.id) && entry.status === "reserved")) -
      Number(checkpoint.objects.some(entry => entry.key === identity(a.id) && entry.status === "reserved")));
    for (const entry of entries) {
      const key = identity(entry.id);
      let outcome = checkpoint.objects.find(item => item.key === key);
      const retry = outcome?.status === "reserved";
      const category = candidate(entry);
      if (retry && ["review", "oversized"].includes(category)) { status = "needs-reinventory"; break; }
      if (!retry && category !== "eligible") continue;
      if (!retry && outcome && outcome.expected === entry.classification.fingerprint &&
          (["deleted", "kept", "review", "inaccessible"].includes(outcome.status) || outcome.reason)) continue;
      if (clock() < (ledger.budget.notBefore ?? 0)) { status = "paused"; break; }
      if (processed >= options.limit) { status = "limited"; break; }
      if (!batchMode && !checkpoint.canary.includes(key) && checkpoint.canary.length >= 10) { status = "canary-complete"; break; }
      const keys = retry ? outcome.keys : entry.classification.totalKeys;
      if (!batchMode && keys > 128) continue;
      // At most one local retained-session/fence wake. Unbounded lifecycle chains
      // are refused by the handler before mutation; there are no nested fetches.
      const wakeDay = retry ? outcome.wakeDay : retainedWakeDay(entry.classification);
      const allowance = retry ? outcome.allowance : wakeDay ? 2 : 1;
      // Conservatively charge both terms, even when the reply chooses per-key.
      const rows = accounting ? options.rowsPerObject + keys * options.rowsPerKey : 0;
      // Older checkpoints without wakeDay retain their conservative call bound;
      // the handler refuses any unreserved wake before writing.
      if (!integer(rows) || !reserveMaintenance(ledger.budget, clock(), wakeDay ? 1 : allowance, rows, wakeDay)) { status = "limited"; break; }
      ledger.save();
      if (!outcome) {
        outcome = { key, expected: entry.classification.fingerprint, status: "reserved", deletedKeys: 0, unresolvedCommands: 0, allowance, keys };
        checkpoint.objects.push(outcome);
      }
      if (!batchMode && !checkpoint.canary.includes(key)) checkpoint.canary.push(key);
      if (!retry) {
        outcome.expected = entry.classification.fingerprint; outcome.allowance = allowance; outcome.keys = keys;
        outcome.wakeDay = wakeDay;
        const unresolved = entry.classification.records.reduce((sum, record) =>
          sum + (record.commandsByState?.pending ?? 0) + (record.commandsByState?.unknown ?? 0), 0);
        outcome.unresolvedCommands = Math.max(outcome.unresolvedCommands, unresolved);
      }
      outcome.status = "reserved";
      delete outcome.reason;
      checkpoint.lastBatch = clock();
      save(); // A crash after this point retries once on the next explicit run, charged again.
      processed++;
      let result;
      try {
        result = await fetcher(`${origin}/__maintenance/cleanup`, { method: "POST", redirect: "error",
          headers: { Authorization: `Bearer ${env.MAINTENANCE_CLEANUP_TOKEN}`, "Content-Type": "application/json" },
          body: JSON.stringify({ id: entry.id, expected: outcome.expected, allowance, wakeDay }) });
      } catch { status = "interrupted"; save(); break; }
      ledger.cooldown(result, [429, 503].includes(result.status) ? 60_000 : 0);
      if (result.status === 401 || result.status === 403) {
        outcome.status = "inaccessible"; status = "inaccessible"; save(); break;
      }
      if (!result.ok) { outcome.status = "deferred"; status = "paused"; save(); break; }
      let clean;
      try { clean = sanitizeResult(await result.json()); }
      catch { status = "interrupted"; save(); break; }
      const excess = clean.invocations - allowance;
      if (excess > 0) {
        // Actual work must never disappear because a faulty server exceeded its
        // allowance. Record the full overrun, even past the ceiling, and stop.
        ledger.budget.count += excess;
        ledger.save();
        status = "limited";
      }
      outcome.status = clean.status;
      outcome.deletedKeys = Math.max(outcome.deletedKeys, clean.deletedKeys);
      outcome.unresolvedCommands = Math.max(outcome.unresolvedCommands, clean.unresolvedCommands);
      if (clean.reason) outcome.reason = clean.reason;
      if (clean.method) outcome.method = clean.method;
      save();
      if (excess > 0) break;
      if (result.headers.has("Retry-After")) { status = "paused"; break; }
    }
    if (status === "complete" && !batchMode && checkpoint.canary.length === 10) status = "canary-complete";
    return finish(status, reportFor(manifest, checkpoint));
  } finally { releaseInventory?.(); releaseCleanup?.(); releaseNamespace(); }
}

const help = `Usage: durable-cleanup.mjs --account ID --namespace ID --deployment LABEL --maintenance-url https://worker.example [--limit 1..100] [--manifest FILE] [--delete] [--canary-verified --rows-per-key N --rows-per-object N] [--verify]
Without --delete, print a local plan with zero network calls. --delete runs at most
ten canaries across runs (<=128 keys each). Batches require --canary-verified and
preview row accounting. Never escalates automatically. --verify requires a newer,
complete inventory --rescan and removes checkpoints only on passing verification.
After a process crash, inspect stale .lock files before removing them and resuming.
Secret: MAINTENANCE_CLEANUP_TOKEN (environment only).`;
export function parseArgs(args) {
  const options = {};
  const flags = { "--delete": "delete", "--verify": "verify", "--canary-verified": "canaryVerified" };
  const fields = { "--account": "account", "--namespace": "namespace", "--deployment": "deployment",
    "--maintenance-url": "maintenanceUrl", "--limit": "limit", "--manifest": "manifest",
    "--rows-per-key": "rowsPerKey", "--rows-per-object": "rowsPerObject" };
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flag === "--help") return { help: true };
    const boolean = Object.hasOwn(flags, flag);
    const field = boolean ? flags[flag] : Object.hasOwn(fields, flag) ? fields[flag] : undefined;
    if (!field || Object.hasOwn(options, field)) throw new Error("Invalid cleanup arguments; use --help");
    if (boolean) { options[field] = true; continue; }
    if (!args[index + 1] || args[index + 1].startsWith("--")) throw new Error("Missing cleanup argument");
    const value = args[++index];
    options[field] = ["limit", "rowsPerKey", "rowsPerObject"].includes(field) ? Number(value) : value;
  }
  if (options.delete && options.verify) throw new Error("Choose delete or verify");
  return options;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) console.log(help);
    else {
      const result = await runCleanup(options, { stdout: line => console.log(line) });
      if (!["plan", "complete", "canary-complete"].includes(result.status)) process.exitCode = 1;
    }
  } catch {
    console.error('RESULT: failed durable-cleanup {"error":"Verify arguments, credentials and restricted checkpoint"}');
    process.exitCode = 1;
  }
}
