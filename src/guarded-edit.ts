// Guarded edit: one module for "nothing changed since I read it, then one
// undo step" (design: sturdy-base guarded-edit-design.md; tickets 10-18 in
// docs/wayfinder/sturdy-base/tickets/).
//
// A caller hands `run` (or `now`) a plan: a function that reads the files it
// needs through the tracking reader `r` and returns what to write. The module
// records every read, re-proves all of it (and the repository, branch, page
// shown, Edit component mode entry and the anchor page's open editor) after
// every wait and right before writing, then writes everything as one undo
// step with the selection before and after. If anything moved, nothing is
// written and the Outcome names what moved.
//
// Depth: the interface is `run`, `now`, `stamp` and `peek`; the staleness,
// undo and selection rules live here (locality), so callers keep only their
// HTML rules. The seam below is `EditorWorkspace`, with two adapters: the
// production one (src/editor-workspace.ts) and the memory one
// (tests/fakes/memory-workspace.ts), which this module's suite runs on.
//
// Slice 10: the port's `change` and `operation` are today's write paths
// (applyNativeChange's editor calls and applyNativeOperation), handed the
// tracked reads as `expectedSources` and the stamp, guard and anchor as
// `current`. Slice 17 moves those bodies behind the seam and narrows it.

import type { NativeSite } from "../shared/native-project";

/** A preview element: a body path in a file. */
export interface NodeRef { path: string; node: number[] }
/** A byte range of the bytes read, replaced by `text`; `expected`, when given, must be that slice. */
export interface RangeEdit { start: number; end: number; text: string; expected?: string }

export interface Reads {
  /** The bytes as edited now (mounted model, draft, branch); absence is recorded too. */
  source(path: string): string | undefined;
  /** A draft, a branch file or a folder. */
  exists(path: string): boolean;
  /** The component map's template for `tag` and its bytes (both recorded). */
  template(tag: string): { path: string; source: string } | undefined;
  /** Routes and components, recorded as the route graph. */
  site(): NativeSite | undefined;
}

export interface RunOptions {
  /** The action began earlier (a click, a press, a dialog opening): its stamp must still hold. */
  since?: Stamp;
  /** Caller-only conditions (the selection still the one asked for), proved with the stamp. */
  guard?: () => boolean;
  /** The page whose history takes the step (default: the open file); `run` opens it when needed. */
  anchor?: string;
  /** `now` only: consecutive edits with this key (typing in a field) stay one undo step. */
  group?: string;
}

export interface Planned {
  /** Full text, or ranges against the bytes read; by the path a file has after the moves. */
  edits?: Map<string, string | RangeEdit[]>;
  /** New files: the module proves they do not exist. */
  creates?: { path: string; content: string }[];
  /** Files read through `r` that must still exist. */
  deletes?: string[];
  /** `from` read through `r`; `to` must not exist. */
  moves?: { from: string; to: string }[];
  /** Selected once the preview renders the new bytes (`after`, flashed with `flash`); Undo selects `before`, Redo `after`. */
  select?: { before?: NodeRef; after?: NodeRef; flash?: string };
  done: string;
  undone: string;
  /** The file to open after. */
  open?: string;
  /** The Pages tab's row to show and focus after. */
  focus?: { file?: string; route?: string };
}

export type PlanResult = Planned | { refuse: string } | { stayed: string };

export type StaleKey =
  | "scope" | "generation" | "version-view" | "route" | "edit-mode" | "anchor" | "guard" | "site"
  | { file: string } | { exists: string };

export type Outcome =
  | { ok: true; status: "applied" | "unchanged" | "stayed" }
  | { ok: false; reason: "stale"; changed: StaleKey; message: string }
  | { ok: false; reason: "refused"; message: string };

export interface Stamp { holds(): boolean; changed(): StaleKey | undefined }

export interface GuardedEdits {
  /** Runs a plan, re-proves every read and the stamp after every wait, writes one undo step. */
  run(plan: (r: Reads) => PlanResult | Promise<PlanResult>, options?: RunOptions): Promise<Outcome>;
  /** The same, synchronously: the plan is sync, it writes only its anchor, and the anchor is open and mounted. */
  now(plan: (r: Reads) => PlanResult, options?: RunOptions): Outcome;
  /** The workspace now: hold it across a click, a drag, a dialog; `holds()` until anything in it moved. */
  stamp(): Stamp;
  /** Untracked reads for painting and menus. Banned inside plans (guard test, slice 18). */
  readonly peek: Reads;
}

/** One operation over several files, as one undo step (today's `applyNativeOperation`). */
export interface OperationRequest {
  expectedSources: Map<string, string | undefined>;
  edits: Map<string, string>;
  creates: { path: string; content: string }[];
  deletes: string[];
  moves: { from: string; to: string }[];
  open?: string;
  focus?: { file?: string; route?: string };
  done: string;
  undone: string;
  /** The stamp, guard, anchor and every read still hold: checked after each of its waits. */
  current: () => boolean;
  selection: { before?: NodeRef; after?: NodeRef };
}

/**
 * The seam below the module: the editor's state and its two write paths.
 * Wide on purpose; it is the module's private dependency, not its interface.
 */
export interface EditorWorkspace {
  /** The account, repository and branch, as one key. */
  scope(): string;
  generation(): number;
  versionView(): boolean;
  /** The route the preview shows. */
  route(): string | undefined;
  /** Edit component mode's entry: undefined outside it, a new object each time it is entered. */
  editModeEntry(): object | undefined;
  site(): NativeSite | undefined;
  source(path: string): string | undefined;
  exists(path: string): boolean;
  /** Proof of a mounted file's model (document, history session, revision); undefined when not mounted. */
  modelState(path: string): { isCurrent(): boolean } | undefined;
  openFile(): string | undefined;
  /** Opens `path` in the editor (its history takes the step). */
  open(path: string): Promise<void>;
  /** Proof that `path` is the open file, mounted in this editor and session, at this revision; undefined when it is not. */
  anchor(path: string): { isCurrent(): boolean } | undefined;
  /** Replaces ranges of the mounted file `path` as one editor step (`group`: joins the open typing group). Throws on failure. */
  change(path: string, edits: Required<RangeEdit>[], group: boolean): void;
  /** Ends the open typing group of `path`. */
  closeGroup(path: string): void;
  /** Writes several files as one undo step: an error message, or nothing. */
  operation(request: OperationRequest): Promise<string | undefined>;
  /** Selects `request` once the preview renders it (flashed with `flash`); undefined cancels. */
  select(request: (NodeRef & { source?: string }) | undefined, flash?: string): void;
  announce(message: string): void;
}

/** What stale outcomes say; callers that need other words switch on `changed`. */
export const STALE_MESSAGE = "The page changed meanwhile. Try again.";

// The route graph a plan read: routes and components, in order.
const siteKey = (site: NativeSite | undefined) => site ? JSON.stringify([site.routes, site.components]) : "";
const componentPath = (site: NativeSite | undefined, tag: string) => site && Object.hasOwn(site.components, tag) ? site.components[tag] : undefined;

function misuse(message: string): never {
  throw new Error(`Guarded edit: ${message}`);
}

export function createGuardedEdits(workspace: EditorWorkspace): GuardedEdits {
  const ws = workspace;
  // The typing group `now` left open, by key and file.
  let group: { key: string; path: string } | undefined;

  function stamp(): Stamp {
    const scope = ws.scope(), generation = ws.generation(), route = ws.route(), entry = ws.editModeEntry();
    const changed = (): StaleKey | undefined =>
      ws.scope() !== scope ? "scope" : ws.generation() !== generation ? "generation" : ws.versionView() ? "version-view"
        : ws.route() !== route ? "route" : ws.editModeEntry() !== entry ? "edit-mode" : undefined;
    return { holds: () => !changed(), changed };
  }

  const peek: Reads = {
    source: path => ws.source(path),
    exists: path => ws.exists(path),
    template: tag => {
      const path = componentPath(ws.site(), tag), source = path === undefined ? undefined : ws.source(path);
      return path === undefined || source === undefined ? undefined : { path, source };
    },
    site: () => ws.site(),
  };

  /** A tracking reader: every read is recorded with its own re-proof; sealed once the plan returns. */
  function track() {
    const sources = new Map<string, string | undefined>();
    const checks = new Map<string, () => StaleKey | undefined>();
    const seen = new Set<string>();
    let sealed = false;
    const open = () => { if (sealed) misuse("`r` was used after the plan returned."); };
    const source = (path: string) => {
      open();
      const key = `source:${path}`;
      if (!checks.has(key)) {
        const text = ws.source(path), model = ws.modelState(path);
        sources.set(path, text);
        checks.set(key, () => ws.source(path) !== text || model && !model.isCurrent() ? { file: path } : undefined);
      }
      seen.add(path);
      return sources.get(path);
    };
    const r: Reads = {
      source,
      exists(path) {
        open();
        const value = ws.exists(path), key = `exists:${path}`;
        if (!checks.has(key)) checks.set(key, () => ws.exists(path) !== value ? { exists: path } : undefined);
        seen.add(path);
        return value;
      },
      template(tag) {
        open();
        const path = componentPath(ws.site(), tag), key = `component:${tag}`;
        if (!checks.has(key)) checks.set(key, () => componentPath(ws.site(), tag) !== path ? "site" : undefined);
        const text = path === undefined ? undefined : source(path);
        return path === undefined || text === undefined ? undefined : { path, source: text };
      },
      site() {
        open();
        const site = ws.site(), value = siteKey(site);
        if (!checks.has("site")) checks.set("site", () => siteKey(ws.site()) !== value ? "site" : undefined);
        return site;
      },
    };
    const changed = () => { for (const check of checks.values()) { const key = check(); if (key) return key; } return undefined; };
    return { r, sources, seen, changed, seal: () => { sealed = true; } };
  }

  type Tracked = ReturnType<typeof track>;

  /** The planned writes, checked against the reads: programmer errors throw. */
  function prepare(planned: Planned, reads: Tracked) {
    const moves = planned.moves ?? [], deletes = planned.deletes ?? [], creates = planned.creates ?? [];
    const written = new Set<string>();
    const write = (path: string) => { if (written.has(path)) misuse(`${path} is written twice.`); written.add(path); };
    const read = (path: string, what: string) => { if (!reads.seen.has(path)) misuse(`${what} ${path}, which the plan never read through r.`); };
    for (const move of moves) { read(move.from, "moves"); write(move.from); write(move.to); }
    for (const path of deletes) { read(path, "deletes"); write(path); }
    for (const file of creates) write(file.path);
    const arriving = new Map(moves.map(move => [move.to, move.from]));
    const edits = new Map<string, string>();
    const ranges = new Map<string, Required<RangeEdit>[]>();
    for (const [path, edit] of planned.edits ?? []) {
      const from = arriving.get(path) ?? path;
      if (written.has(path) && !arriving.has(path)) misuse(`${path} is written twice.`);
      if (!reads.sources.has(from)) misuse(`edits ${path}, whose bytes the plan never read through r.`);
      const base = reads.sources.get(from);
      if (base === undefined) misuse(`edits ${path}, which the plan read as absent.`);
      if (typeof edit === "string") { edits.set(path, edit); continue; }
      const sorted = [...edit].sort((a, b) => a.start - b.start);
      let text = "", at = 0;
      for (const range of sorted) {
        if (range.start < at || range.end < range.start || range.end > base.length) misuse(`a range of ${path} overlaps another or lies outside the bytes read.`);
        const slice = base.slice(range.start, range.end);
        if (range.expected !== undefined && range.expected !== slice) misuse(`a range of ${path} expects bytes the plan did not read.`);
        text += base.slice(at, range.start) + range.text;
        at = range.end;
      }
      edits.set(path, text + base.slice(at));
      ranges.set(path, sorted.map(range => ({ ...range, expected: base.slice(range.start, range.end) })));
    }
    const unchanged = !moves.length && !deletes.length && !creates.length && [...edits].every(([path, text]) => reads.sources.get(path) === text);
    return { moves, deletes, creates, edits, ranges, unchanged };
  }
  type Prepared = ReturnType<typeof prepare>;

  const stale = (changed: StaleKey): Outcome => ({ ok: false, reason: "stale", changed, message: STALE_MESSAGE });
  const refused = (message: string): Outcome => ({ ok: false, reason: "refused", message });

  /** Existence the writes need, proved now: the first refusal, or nothing. */
  function existence(writes: Prepared) {
    const vacated = new Set([...writes.moves.map(move => move.from), ...writes.deletes]);
    for (const path of [...writes.moves.map(move => move.from), ...writes.deletes]) if (!ws.exists(path)) return `${path} is not there any more.`;
    for (const path of [...writes.moves.map(move => move.to), ...writes.creates.map(file => file.path)])
      if (!vacated.has(path) && ws.exists(path)) return `${path} already exists. No files were changed.`;
    return undefined;
  }

  /** The range path: one mounted file, its anchor, ranges only; the editor's own step. */
  const rangePath = (writes: Prepared, anchor: string, planned: Planned) =>
    !writes.moves.length && !writes.deletes.length && !writes.creates.length && planned.open === undefined
    && writes.edits.size === 1 && writes.edits.has(anchor);

  /**
   * The ranges for the one file: the plan's own, or the smallest range that turns the bytes read
   * into the text (always one range for a typing group, which takes one at a time).
   */
  function rangesFor(path: string, writes: Prepared, reads: Tracked, one: boolean): Required<RangeEdit>[] {
    const own = writes.ranges.get(path);
    if (own && (own.length === 1 || !one)) return own;
    const before = reads.sources.get(path)!, after = writes.edits.get(path)!;
    let start = 0;
    while (start < before.length && start < after.length && before[start] === after[start]) start++;
    let end = 0;
    while (end < before.length - start && end < after.length - start && before[before.length - 1 - end] === after[after.length - 1 - end]) end++;
    return [{ start, end: before.length - end, text: after.slice(start, after.length - end), expected: before.slice(start, before.length - end) }];
  }

  function closeGroup() {
    if (group) ws.closeGroup(group.path);
    group = undefined;
  }

  function writeRanges(path: string, writes: Prepared, reads: Tracked, planned: Planned, key?: string): Outcome {
    if (group && (group.key !== key || group.path !== path)) closeGroup();
    const after = planned.select?.after;
    ws.select(after && { path: after.path, node: after.node }, planned.select?.flash);
    try {
      ws.change(path, rangesFor(path, writes, reads, key !== undefined), key !== undefined);
    } catch (error) {
      ws.select(undefined);
      group = undefined;
      return refused(error instanceof Error ? error.message : "The change could not be made.");
    }
    group = key === undefined ? undefined : { key, path };
    ws.announce(planned.done);
    return { ok: true, status: "applied" };
  }

  async function run(plan: (r: Reads) => PlanResult | Promise<PlanResult>, options: RunOptions = {}): Promise<Outcome> {
    if (options.group !== undefined) misuse("`group` is for now() only.");
    closeGroup();
    const held = options.since ?? stamp();
    const guard = options.guard ?? (() => true);
    // The stamp and the guard: what the action began with.
    const proved = (): StaleKey | undefined => held.changed() ?? (guard() ? undefined : "guard");
    let changed = proved();
    if (changed) return stale(changed);
    const anchor = options.anchor ?? ws.openFile();
    if (anchor === undefined) return refused("Open a page before changing these files.");
    if (ws.openFile() !== anchor || !ws.anchor(anchor)) {
      await ws.open(anchor);
      changed = proved();
      if (changed) return stale(changed);
    }
    // The anchor's editor and model, proved from here to the record.
    const opened = ws.anchor(anchor);
    if (!opened) return stale("anchor");
    const reads = track();
    let result: PlanResult;
    try { result = await plan(reads.r); }
    finally { reads.seal(); }
    const writes = "done" in result ? prepare(result, reads) : undefined;
    const current = (): StaleKey | undefined => proved() ?? (opened.isCurrent() ? undefined : "anchor") ?? reads.changed();
    changed = current();
    if (changed) return stale(changed);
    if ("refuse" in result) return refused(result.refuse);
    if ("stayed" in result) { ws.announce(result.stayed); return { ok: true, status: "stayed" }; }
    if (writes!.unchanged) return { ok: true, status: "unchanged" };
    const missing = existence(writes!);
    if (missing) return refused(missing);
    if (rangePath(writes!, anchor, result)) return writeRanges(anchor, writes!, reads, result);
    const after = result.select?.after;
    if (after) ws.select({ ...after, ...writes!.edits.has(after.path) ? { source: writes!.edits.get(after.path) } : {} }, result.select?.flash);
    const error = await ws.operation({
      expectedSources: new Map(reads.sources), edits: writes!.edits, creates: writes!.creates, deletes: writes!.deletes, moves: writes!.moves,
      open: result.open, focus: result.focus, done: result.done, undone: result.undone,
      current: () => !current(), selection: { before: result.select?.before, after },
    });
    if (error === undefined) return { ok: true, status: "applied" };
    if (after) ws.select(undefined);
    changed = current();
    return changed ? stale(changed) : refused(error);
  }

  function now(plan: (r: Reads) => PlanResult, options: RunOptions = {}): Outcome {
    const held = options.since ?? stamp();
    const guard = options.guard ?? (() => true);
    const proved = (): StaleKey | undefined => held.changed() ?? (guard() ? undefined : "guard");
    const fail = (changed: StaleKey) => { closeGroup(); return stale(changed); };
    let changed = proved();
    if (changed) return fail(changed);
    const anchor = options.anchor ?? ws.openFile();
    const opened = anchor !== undefined && ws.openFile() === anchor ? ws.anchor(anchor) : undefined;
    if (anchor === undefined || !opened) misuse(`now() needs its anchor ${anchor ?? "(none)"} open and mounted; use run().`);
    const reads = track();
    let result: PlanResult;
    try {
      result = plan(reads.r);
      if (typeof (result as { then?: unknown }).then === "function") misuse("now() takes a synchronous plan; use run().");
    } finally { reads.seal(); }
    const writes = "done" in result ? prepare(result, reads) : undefined;
    if ("done" in result && (writes!.creates.length || writes!.moves.length || writes!.deletes.length || result.open !== undefined))
      misuse("now() cannot create, delete, move or open files (they need async reads); use run().");
    if (writes && [...writes.edits.keys()].some(path => path !== anchor))
      misuse(`now() writes only its anchor ${anchor} (until slice 17); use run().`);
    changed = proved() ?? (opened.isCurrent() ? undefined : "anchor") ?? reads.changed();
    if (changed) return fail(changed);
    if ("refuse" in result) return refused(result.refuse);
    if ("stayed" in result) { ws.announce(result.stayed); return { ok: true, status: "stayed" }; }
    if (writes!.unchanged) return { ok: true, status: "unchanged" };
    return writeRanges(anchor, writes!, reads, result, options.group);
  }

  return { run, now, stamp, peek };
}
