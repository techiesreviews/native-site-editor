// Edit component mode: one module for "is the mode on, on what, and for how long"
// (design: sturdy-base edit-component-mode-design.md; tickets 60-63 in
// docs/wayfinder/sturdy-base/tickets/).
//
// The mode frames one instance on the page shown, opens its template in the
// code pane and edits it in place; nested components open in place (the
// chain), the component is renamed from the bar, Done leaves. This module owns
// the mode's state and its rules: the opening (one object per enter, open and
// followed rename, which the guarded edit's stamps hold under `edit-mode`),
// its repository/branch/version-view check, "the latest entry wins", every
// history share's lifetime (the entry's, the mode's, each nested level's, each
// rename's), the chain, rename pairs followed across Undo/Redo, kept slot
// names, the Make component notes, the frame message, and the one rule for
// when the mode lasts (`now()`).
//
// Depth: callers ask `now()`, `entry()` and `opened()` and make transitions
// with `enter`, `open`, `rename`, `sync` and `leave`; the proofs, shares and
// leaving live here. No DOM: the bar's view draws what `now()` says. The seam
// below is `ComponentModePorts`, with two adapters: the editor's (built in
// components.ts from its deps) and the memory one (tests/component-mode.test.ts
// on tests/fakes/memory-workspace.ts).

import type { EditComponentFrameMode } from "../components/native-preview";
import type { GuardedEdits, Stamp } from "../guarded-edit";
import { readPage } from "../native-source-location";
import type { SourceTree } from "./source-tree";

export interface ComponentModePorts {
  /** Stamps for each opening; templates and pages read through `peek` (never inside a plan). */
  edits: Pick<GuardedEdits, "stamp" | "peek">;
  /** The file open in the code pane and the page the preview shows (routes → path). */
  shown(): { open: string | undefined; page: string | undefined };
  /** Opens `path` in the code pane: true once it is mounted there. */
  open(path: string): Promise<boolean>;
  /** Records `path`'s undo steps in `page`'s journal from its next opening; returns the release. */
  share(path: string, page: string): () => void;
  /** Tells the preview's frame the mode; `undefined` ends it there. */
  frame(mode: EditComponentFrameMode | undefined): void;
  /** The mode changed (entered, a level opened, a rename followed, notes dismissed, left): draw again. */
  changed(): void;
  /** A page's source as the preview counts its elements (default: the browser's parser, `readPage`). */
  read?(source: string): SourceTree<unknown>;
}

/** A level of the chain: `node` addresses its instance in the level before (level 0: on the page). */
export interface Level { tag: string; template: string; node: readonly number[] }

export interface Mode {
  /** The page the instance is framed on, and the instance on it. */
  page: string;
  node: readonly number[];
  /** Outermost first; the last is edited. */
  chain: readonly Level[];
  /** chain.at(-1)'s. */
  tag: string;
  template: string;
  /** This opening: a new object at each enter, open and followed rename; the stamps hold it. */
  entry: object;
  notes: readonly string[];
}

/** What a rename's `run` resolves to when the step was written: where the template went. */
export interface Renamed { tag: string; template: string; notes: readonly string[] }

export type EnterResult = { status: "mode" | "opened" } | { status: "stale" } | { status: "failed"; error: unknown };

export interface ComponentMode {
  /**
   * The mode, or undefined. On while: the template edited is the file open, the framed page is the
   * page shown, the opening's repository, branch and version view hold, and a `tag` element is at
   * `node` on the page (memoised per page source). Pure: no state, frame or listener changes;
   * frozen objects, the same one until a transition.
   */
  now(): Mode | undefined;
  /**
   * The opening the guarded edit's stamps hold (EditorWorkspace.editModeEntry): the mode's entry
   * while its template is the file open. Reads no stamp and follows nothing.
   */
  entry(): object | undefined;
  /** The template Edit component opened (framed or not) while it is the file open and its opening holds. */
  opened(): string | undefined;
  /**
   * Opens `template` in the code pane and, with an `instance` on the page shown, frames it once
   * `ready` settles. A later enter supersedes this one; the entry's history share is released
   * unless the mode starts; past ENTER_DEADLINE from the call it gives up ("failed" with an
   * EnterTimeout) and nothing late is written (a late mount sets no opening and runs no `mounted`).
   * "opened": no instance, the code pane only.
   */
  enter(request: { tag: string; template: string; instance?: { path: string; node: readonly number[] };
    notes?: readonly string[]; ready?: Promise<unknown> },
  hooks?: {
    /** The template is open and the opening set (`opened()` answers), before `ready`. */
    mounted?(): void;
  }): Promise<EnterResult>;
  /**
   * Opens a nested instance's template (`step`, its node in the template edited; a tag already in
   * the chain goes back to it) or goes back to level `back`, on the same frame: true when it did.
   * Refused while another transition is in flight.
   */
  open(to: { step: Level } | { back: number }): Promise<boolean>;
  /**
   * Renames the component edited: `run` writes the rename step and resolves to where the template
   * went (undefined when nothing was written). While it runs, `sync` neither follows nor leaves.
   * After it, the levels that edit it follow, a new entry keeps the opening's stamp, the pair is
   * kept for Undo/Redo and the new path shares the page's journal. Resolves to `run`'s result;
   * refused (undefined, `run` never called) with the mode off or another transition in flight.
   */
  rename<T extends Renamed | undefined>(run: () => Promise<T>): Promise<T | undefined>;
  /** The name a slot made fixed in this mode had, while the template reads as that change left it. */
  keep(source: string, node: readonly number[], name: string): void;
  kept(source: string, node: readonly number[]): string | undefined;
  /** The bar's × on the notes: they go, the opening stays (no new entry). */
  dismissNotes(): void;
  /**
   * The host's open file, page shown or sources changed: follow a rename's Undo/Redo (the file
   * open is the other side of a kept pair), or leave when `now()` says off. Idempotent; does
   * nothing while a transition is in flight (each runs it once it settles).
   */
  sync(): void;
  /** Ends the mode (Done) and any entry still loading: every share released, the frame told; the instance it was on. */
  leave(): { page: string; node: number[]; tag: string; template: string } | undefined;
  /** Ends everything: the mode (frame told, nothing drawn), pending transitions (they settle "stale"), the opening. */
  destroy(): void;
}

/** How long `enter` waits for the open and `ready`, from the call. */
export const ENTER_DEADLINE = 8000;

export class EnterTimeout extends Error {
  constructor() {
    super("Edit component mode did not load in time.");
    this.name = "EnterTimeout";
  }
}

/** The repository, branch and version view are still the stamp's; the page shown and the mode's entry may have moved. */
export function scopeHolds(stamp: Stamp) {
  const changed = stamp.changed();
  return changed === undefined || changed === "route" || changed === "edit-mode";
}

/** Reopening a tag already in the chain returns to it instead of recursing. */
export function drillChain(chain: readonly Level[], step: Level): Level[] {
  const index = chain.findIndex((level) => level.tag === step.tag);
  return index < 0 ? [...chain, { ...step, node: [...step.node] }] : backChain(chain, index);
}

export function backChain(chain: readonly Level[], index: number): Level[] {
  if (!Number.isInteger(index) || index < 0 || index >= chain.length) return [...chain];
  return chain.slice(0, index + 1);
}

/** An opening of a template: the object the stamps hold, with the stamp it was opened under. */
type Opening = Readonly<{ template: string; stamp: Stamp }>;
type Wait = { kind: "mounted" | "refused" | "ready" | "timeout" | "cancelled" } | { kind: "error"; error: unknown };
/** A pending enter: `cancel` settles it "stale" and releases its share at once. */
type Entry = { cancel(): void; share?: () => void };

const once = (release: () => void) => {
  let done = false;
  return () => { if (!done) { done = true; release(); } };
};

function make(page: string, node: readonly number[], chain: readonly Level[], notes: readonly string[], entry: Opening): Mode & { entry: Opening } {
  const levels = Object.freeze(chain.map(({ tag, template, node }) => Object.freeze({ tag, template, node: Object.freeze([...node]) })));
  const last = levels.at(-1)!;
  return Object.freeze({ page, node: Object.freeze([...node]), chain: levels, tag: last.tag, template: last.template, entry, notes: Object.freeze([...notes]) });
}

const message = (mode: Mode): EditComponentFrameMode => ({
  path: mode.page, node: [...mode.node], tag: mode.chain[0].tag,
  nested: mode.chain.slice(1).map(({ tag, node }) => ({ tag, node: [...node] })),
});

export function createComponentMode(ports: ComponentModePorts): ComponentMode {
  const peek = ports.edits.peek;
  const read = (source: string) => ports.read ? ports.read(source) : readPage(source);
  let state: (Mode & { entry: Opening }) | undefined;
  let opening: Opening | undefined;
  // The newest enter: only it may start the mode.
  let latest: Entry | undefined;
  // Transitions in flight (enter, open, rename): `sync` waits for them.
  let busy = 0;
  let destroyed = false;
  // Shares of the page's history: the mode's (its entry's, promoted), each nested level's (level 1 first).
  let ownShare: (() => void) | undefined;
  const nestedShares: (() => void)[] = [];
  // A level's share taken before its open settles (destroy releases it at once).
  const pending = new Set<() => void>();
  // Renames made in the mode, followed across their Undo and Redo; each holds the renamed template's share.
  const renames: { from: { tag: string; template: string }; to: { tag: string; template: string }; notes: readonly string[]; release: () => void }[] = [];
  // Slots made fixed in the mode: the name each had, by the template's source and the part.
  const fixedNames = new Map<string, string>();
  const keptKey = (source: string, node: readonly number[]) => JSON.stringify([source, node]);
  // The instance check of the last page source read (M3).
  let placed: { source: string; key: string; at: boolean } | undefined;


  /** A `tag` element is still at `node` of the page's bytes. */
  function framed(page: string, node: readonly number[], tag: string) {
    const source = peek.source(page);
    if (source === undefined) return false;
    const key = JSON.stringify([tag, node]);
    if (placed?.source !== source || placed.key !== key) {
      const tree = read(source), at = tree.at(node);
      placed = { source, key, at: at !== undefined && tree.view.name(at) === tag };
    }
    return placed.at;
  }

  function now(): Mode | undefined {
    const mode = state;
    if (!mode || !opening || mode.entry !== opening) return undefined;
    const shown = ports.shown();
    if (shown.open !== mode.template || shown.page !== mode.page || !scopeHolds(opening.stamp)) return undefined;
    return framed(mode.page, mode.node, mode.chain[0].tag) ? mode : undefined;
  }

  function entry(): object | undefined {
    const mode = state;
    return mode && opening && mode.entry === opening && ports.shown().open === mode.template ? opening : undefined;
  }

  function opened(): string | undefined {
    return opening && ports.shown().open === opening.template && scopeHolds(opening.stamp) ? opening.template : undefined;
  }

  /** The mode now edits `to` where it edited `from` (a rename, its Undo or Redo): a new entry under `stamp`. */
  function retarget(from: string, to: { tag: string; template: string }, notes: readonly string[], stamp: Stamp) {
    const mode = state!;
    opening = Object.freeze({ template: to.template, stamp });
    state = make(mode.page, mode.node, mode.chain.map((level) => level.template === from ? { ...level, ...to } : level), notes, opening);
    ports.frame(message(state));
    ports.changed();
  }

  /** Lets go of every share the mode holds and forgets it; `tell`: the host draws again. */
  function end(tell: boolean) {
    const was = state;
    if (!was) return undefined;
    state = undefined;
    placed = undefined;
    for (const release of nestedShares.splice(0)) release();
    ownShare?.();
    ownShare = undefined;
    for (const each of renames.splice(0)) each.release();
    fixedNames.clear();
    ports.frame(undefined);
    if (tell) ports.changed();
    return { page: was.page, node: [...was.node], tag: was.chain[0].tag, template: was.chain[0].template };
  }

  /** A transition settled: what `now()` says is made real, unless another is still in flight. */
  function settle() {
    busy--;
    sync();
  }

  async function enter(request: Parameters<ComponentMode["enter"]>[0], hooks: Parameters<ComponentMode["enter"]>[1] = {}): Promise<EnterResult> {
    const stamp = ports.edits.stamp();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<Wait>((done) => { timer = setTimeout(() => done({ kind: "timeout" }), ENTER_DEADLINE); });
    // Handled at once: a rejection after this entry gave up is never unhandled.
    const loaded = Promise.resolve(request.ready).then((): Wait => ({ kind: "ready" }), (error: unknown): Wait => ({ kind: "error", error }));
    const { tag, template, instance } = request;
    const templateSource = peek.source(template), pageSource = instance && peek.source(instance.path);
    if (destroyed) { clearTimeout(timer); return { status: "stale" }; }
    let cancel!: () => void;
    const cancelled = new Promise<Wait>((done) => { cancel = () => done({ kind: "cancelled" }); });
    const me: Entry = { cancel: () => { me.share?.(); me.share = undefined; cancel(); } };
    latest?.cancel();
    latest = me;
    if (templateSource === undefined) { clearTimeout(timer); return { status: "stale" }; }
    const timeout = { status: "failed", error: new EnterTimeout() } as const;
    // Still the latest entry, under the same repository, over the template as read.
    const holds = () => !destroyed && latest === me && scopeHolds(stamp) && ports.shown().open === template && peek.source(template) === templateSource;
    busy++;
    try {
      // The template's edits are undo steps of the framed page from this opening on.
      if (instance) me.share = once(ports.share(template, instance.path));
      const opens = ports.open(template).then((ok): Wait => ({ kind: ok ? "mounted" : "refused" }), (error: unknown): Wait => ({ kind: "error", error }));
      const first = await Promise.race([opens, deadline, cancelled]);
      // A mount after the deadline writes nothing (no opening, no `mounted`): the entry gave up.
      if (first.kind === "timeout") return timeout;
      if (first.kind === "error") return { status: "failed", error: first.error };
      if (first.kind !== "mounted" || !holds()) return { status: "stale" };
      const mine = opening = Object.freeze({ template, stamp });
      hooks.mounted?.();
      if (!instance) return { status: "opened" };
      const second = await Promise.race([loaded, deadline, cancelled]);
      if (second.kind === "timeout") return timeout;
      if (second.kind === "error") return { status: "failed", error: second.error };
      if (second.kind !== "ready" || !holds() || opening !== mine
        || ports.shown().page !== instance.path || peek.source(instance.path) !== pageSource) return { status: "stale" };
      // A mode already on gives way: its level and mode shares go (renames and kept names stay until leave).
      for (const release of nestedShares.splice(0)) release();
      ownShare?.();
      ownShare = me.share;
      me.share = undefined;
      state = make(instance.path, instance.node, [{ tag, template, node: instance.node }], request.notes ?? [], mine);
      ports.frame(message(state));
      ports.changed();
      return { status: "mode" };
    } finally {
      clearTimeout(timer);
      me.share?.();
      me.share = undefined;
      settle();
    }
  }

  async function open(to: { step: Level } | { back: number }): Promise<boolean> {
    const mode = now();
    if (!mode || busy || destroyed) return false;
    const next = "step" in to ? drillChain(mode.chain, to.step) : backChain(mode.chain, to.back);
    const target = next.at(-1)!;
    if ("back" in to && next.length !== to.back + 1 || peek.template(target.tag)?.path !== target.template) return false;
    const before = opening!, stamp = ports.edits.stamp();
    const paths = [...new Set([mode.page, ...mode.chain.map((level) => level.template), target.template])];
    const sources = paths.map((path) => peek.source(path));
    const deeper = next.length > mode.chain.length;
    busy++;
    // A nested template's edits are undo steps of the framed page too (shared before it opens).
    let share = deeper ? once(ports.share(target.template, mode.page)) : undefined;
    if (share) pending.add(share);
    try {
      if (!(await ports.open(target.template))) return false;
      if (destroyed || !state || state.entry !== before || opening !== before || !scopeHolds(stamp)
        || ports.shown().open !== target.template || ports.shown().page !== mode.page
        || paths.some((path, index) => peek.source(path) !== sources[index])) return false;
      if (share) { pending.delete(share); nestedShares.push(share); share = undefined; }
      else for (const release of nestedShares.splice(next.length - 1)) release();
      opening = Object.freeze({ template: target.template, stamp });
      state = make(mode.page, mode.node, next, state.notes, opening);
      ports.frame(message(state));
      ports.changed();
      return true;
    } finally {
      if (share) { pending.delete(share); share(); }
      settle();
    }
  }

  async function rename<T extends Renamed | undefined>(run: () => Promise<T>): Promise<T | undefined> {
    const mode = now();
    if (!mode || busy || destroyed) return undefined;
    const before = opening!, stamp = ports.edits.stamp();
    busy++;
    try {
      const result = await run();
      // The template moved from under the mode: it follows while nothing else moved.
      const shown = ports.shown();
      if (result && !destroyed && state?.entry === before && opening === before && scopeHolds(stamp)
        && shown.open === result.template && shown.page === mode.page) {
        const to = { tag: result.tag, template: result.template };
        renames.push({ from: { tag: mode.tag, template: mode.template }, to, notes: [...result.notes], release: once(ports.share(result.template, mode.page)) });
        retarget(mode.template, to, result.notes, before.stamp);
      }
      return result;
    } finally {
      settle();
    }
  }

  /** The mode's template went elsewhere by a rename's Undo or Redo (the file now open): the mode follows it. */
  function follow() {
    const mode = state, path = ports.shown().open;
    if (!mode || !opening || mode.entry !== opening || !path || path === mode.template || !scopeHolds(opening.stamp)) return;
    const pair = renames.find((each) => each.from.template === mode.template && each.to.template === path)
      ?? renames.find((each) => each.to.template === mode.template && each.from.template === path);
    if (!pair) return;
    const back = pair.from.template === path, level = back ? pair.from : pair.to;
    const components = peek.site()?.components;
    if (!components || !Object.hasOwn(components, level.tag) || components[level.tag] !== path) return;
    // Only onto a mode that reads on: its page still shown, its instance (renamed or not) still there.
    const outer = mode.chain[0].template === mode.template ? level.tag : mode.chain[0].tag;
    if (ports.shown().page !== mode.page || !framed(mode.page, mode.node, outer)) return;
    retarget(mode.template, level, back ? [] : pair.notes, opening.stamp);
  }

  function sync() {
    if (busy || destroyed) return;
    follow();
    if (opening && (ports.shown().open !== opening.template || !scopeHolds(opening.stamp))) opening = undefined;
    if (state && !now()) end(true);
  }

  return {
    now,
    entry,
    opened,
    enter,
    open,
    rename,
    keep(source, node, name) { if (state) fixedNames.set(keptKey(source, node), name); },
    kept: (source, node) => fixedNames.get(keptKey(source, node)),
    dismissNotes() {
      const mode = state;
      if (!mode?.notes.length) return;
      state = make(mode.page, mode.node, mode.chain, [], mode.entry);
      ports.changed();
    },
    sync,
    leave() {
      // Done also ends an entry or a level still loading: nothing it started frames later, no share stays.
      latest?.cancel();
      latest = undefined;
      for (const release of pending) release();
      pending.clear();
      return end(true);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      latest?.cancel();
      latest = undefined;
      for (const release of pending) release();
      pending.clear();
      end(false);
      opening = undefined;
    },
  };
}
