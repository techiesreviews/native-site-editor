// Block move: one module for "what does this press move, where may it go,
// and move it" (sturdy-base slice 30; design: block-move-design.md sections
// 4, 5, 7). Every way in (drags, Alt+arrows, the Section Move buttons, Page
// Structure rows, MCP move_section) hands it the element pressed and where
// to; it picks the document's rules (block-move-rules.ts: the template
// edited in Edit component mode, else the page's), proves the bytes, writes
// one guarded edit (src/guarded-edit.ts) and names the moved element's path.
// Callers keep their gesture, their stale wording and how they show a refusal.
//
// The mounted page moves now, in the key's event (`edits.now`); any other
// page opens first and the move settles later (`pending`, `edits.run`).

import { isSectionTemplate } from "../../shared/html-source";
import { STALE_MESSAGE, type GuardedEdits, type Outcome, type PlanResult, type Reads, type StaleKey, type Stamp } from "../guarded-edit";
import { itemsSlotRule } from "./block-insert";
import { nativeElementMoveMessage, ownSlot, pageRules, templateRules, type MovePlan, type MoveStep } from "./block-move-rules";
import { nativeEditInside, nativeMovableBlock, nativeOutline } from "./native-operations";
import { isCustomElementName } from "./rules/movable";

export interface BlockMovePorts {
  edits: Pick<GuardedEdits, "run" | "now" | "stamp" | "peek">;
  /** Edit component mode's template edited, if any: every move in that path uses the template rules. */
  editing(): { path: string; tag: string } | undefined;
  /** Whether `path` is the open, mounted file: the move is written now, in the key's event. */
  mounted(path: string): boolean;
  /**
   * A page about to open for a move (it is not mounted): takes what recovery needs now (the editor's
   * kept model of it) and returns the recovery for a move that then goes stale because the bytes
   * changed while the page opened: forget that kept model and refresh the preview.
   */
  forgetOpening(path: string): (painted: string) => void;
}

/** The element pressed: a body path in a file, and the bytes it was painted from. */
export interface MoveAt { path: string; node: number[]; painted: string | undefined }

export interface Grip {
  /** What moves (a template: a named slot it fills alone moves with it). */
  from: number[];
  /** From `from` down to the part pressed: kept selected after the move. */
  inside: number[];
  /** A Section of the page: it snaps between page bands. */
  band: boolean;
  /** A press may drag it (a page: inside `<main>`, rules/movable.ts; keys reach further). */
  drags: boolean;
  /** Why it can't go into `parent` (an instance's items slot `slot`), by the first gap; undefined: it can. */
  refusal(parent: readonly number[], slot?: string): string | undefined;
  /** Whether a step would move it. */
  steps: Record<MoveStep, boolean>;
}

export type MoveTo =
  /** Keys, the Section buttons, Page Structure rows. */
  | { step: MoveStep }
  /** Drags: the place measured on the `painted` bytes; `name` and `where` for the words. */
  | { drop: { parent: number[]; index: number; slot?: string }; painted: string | undefined; name: string; where: string }
  /** MCP: a gap among its own siblings (its own slot kept); `section`: only a Section moves. */
  | { gap: { parent: number[]; index: number }; section?: true };

export interface MoveOptions {
  /** Held from the press, the bar's render, the Structure paint. */
  since?: Stamp;
  /** The caller's own condition (the selection still the one asked for, its model current). */
  guard?: () => boolean;
  /** The caller's words for stale bytes; default STALE_MESSAGE. */
  stale?: string;
}

export type Settled =
  /** The moved element's path (the part pressed, inside its slot); `message`: written, but the page did not open again after it. */
  | { status: "moved"; node: number[]; message?: string }
  /** At an edge or where it already is (`message` said for drops and gaps). */
  | { status: "stayed"; message?: string }
  /** `failed`: planned, but the editor would not write it (an error, not a refusal); `changed`: what the guarded edit found moved. */
  | { status: "refused" | "stale"; message: string; failed?: true; changed?: StaleKey };
export type MoveOutcome = Settled | { status: "pending"; settled: Promise<Settled> };

export interface BlockMoves {
  /**
   * What a press on `at` moves, where it may go and which steps it has, from `at.painted`
   * (templates through `peek`); each answer is worked out when first read and kept, so a drag's
   * hover asks once per container. Painting only: the bar's drag handle and Move buttons, a drag's
   * hover, a Page Structure row press. Undefined: nothing here moves.
   */
  grip(at: MoveAt): Grip | undefined;
  /** Moves it as one undo step: Undo selects `at.node`, Redo the moved element. */
  move(at: MoveAt, to: MoveTo, options?: MoveOptions): MoveOutcome;
}

const STEPS = ["up", "down", "out", "in"] as const;
const NOTHING: PlanResult = { done: "", undone: "" };
const same = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((step, index) => step === b[index]);

function tagAt(source: string, node: readonly number[]) {
  let at = nativeOutline(source);
  for (const step of node) at = at?.children[step];
  return at?.name;
}
/** A whole section: a `<section>`, or a component whose template is one (read through `reads`). */
const isSection = (tag: string | undefined, reads: Reads) =>
  tag === "section" || (tag !== undefined && isCustomElementName(tag) && isSectionTemplate(reads.template(tag)?.source ?? ""));

/** Each value worked out once, when first read. */
function lazy<K extends string, V>(keys: readonly K[], value: (key: K) => V) {
  const out = {} as Record<K, V>;
  for (const key of keys) {
    let known: { value: V } | undefined;
    Object.defineProperty(out, key, { enumerable: true, get: () => (known ??= { value: value(key) }).value });
  }
  return out;
}

/** What one move says: done and undone, by where it went and what moved. */
function words(to: MoveTo, section: boolean, source: string, from: readonly number[]) {
  if ("drop" in to) return { done: `${to.name} moved. ${to.where}`, undone: `Undid moving the ${to.name}.` };
  if ("gap" in to) return { done: "Section moved", undone: "Undid moving the section" };
  const done = section && (to.step === "up" || to.step === "down") ? `Moved ${to.step}` : nativeElementMoveMessage(source, from, to.step);
  return { done, undone: `Undid: ${done}` };
}

export function createBlockMoves(ports: BlockMovePorts): BlockMoves {
  const { edits } = ports;
  // The document's rules: the template edited, else the page's, its items slots read through `reads`.
  const rulesFor = (template: boolean, reads: Reads) => {
    const items = itemsSlotRule(tag => reads.template(tag)?.source);
    return { items, rules: template ? templateRules() : pageRules(items) };
  };

  function grip(at: MoveAt): Grip | undefined {
    const source = at.painted, template = ports.editing()?.path === at.path;
    if (source === undefined || !at.node.length) return undefined;
    const { items, rules } = rulesFor(template, edits.peek);
    const from = rules.subject(source, at.node);
    if (!from) return undefined;
    const refusals = new Map<string, string | undefined>();
    // Worked out when read: a press reads some, the bar others.
    const asked = lazy(["band", "drags"], key => key === "band" ? !template && isSection(tagAt(source, from), edits.peek) : template || nativeMovableBlock(source, from, items));
    return {
      from,
      inside: at.node.slice(from.length),
      get band() { return asked.band; },
      get drags() { return asked.drags; },
      refusal(parent, slot) {
        const key = JSON.stringify([parent, slot ?? null]);
        if (!refusals.has(key)) refusals.set(key, rules.refusal(source, from, parent, slot));
        return refusals.get(key);
      },
      steps: lazy(STEPS, direction => rules.step(source, from, direction).status === "moved"),
    };
  }

  function move(at: MoveAt, to: MoveTo, options: MoveOptions = {}): MoveOutcome {
    if (!at.node.length) throw new Error("Block move: no element to move.");
    const { path } = at, stale = options.stale ?? STALE_MESSAGE;
    const template = ports.editing()?.path === path;
    // The bytes the destination was measured on: a drop's, else the press's.
    const expected = "drop" in to ? to.painted : at.painted;
    // A Section on the page as the press saw it: a template made a Section or not meanwhile is stale.
    const wasSection = !template && at.painted !== undefined && isSection(tagAt(at.painted, at.node), edits.peek);
    // What the plan came to: stale bytes, the moved element's path, the words for staying.
    let staleBytes = false, after: number[] | undefined, stayed: string | undefined;

    const plan = (r: Reads): PlanResult => {
      staleBytes = false; after = undefined; stayed = undefined;
      const source = r.source(path);
      const refuseStale = () => { staleBytes = true; return { refuse: stale }; };
      if (source === undefined || at.painted === undefined || source !== expected) return refuseStale();
      const { rules } = rulesFor(template, r);
      // Unmovable: the rules' own step or place refuses with their words.
      const from = rules.subject(at.painted, at.node) ?? [...at.node];
      // A drop's press may be older than the drop by text typed inside the block.
      if ("drop" in to && !nativeEditInside(at.painted, source, from)) return refuseStale();
      const section = !template && isSection(tagAt(source, from), r);
      if (section !== wasSection) return refuseStale();
      let planned: MovePlan;
      if ("step" in to) planned = rules.step(source, from, to.step);
      else if ("drop" in to) planned = rules.to(source, from, to.drop);
      else if (!same(to.gap.parent, from.slice(0, -1)) || (to.section && !section)) return { refuse: "A section moves among its own siblings only." };
      else planned = rules.to(source, from, { ...to.gap, parent: [...to.gap.parent], slot: ownSlot(source, from) });
      if (planned.status === "refused") {
        if (!("drop" in to)) return { refuse: planned.error };
        return { refuse: `${to.name} was not moved: ${rules.refusal(source, from, to.drop.parent, to.drop.slot) ?? "the HTML there cannot take it."}` };
      }
      if (planned.status === "stayed") {
        // A key at an edge: nothing written, nothing said.
        if ("step" in to) return NOTHING;
        stayed = "drop" in to ? `${to.name} stayed in place` : "Section stayed in place";
        return { stayed };
      }
      const moved = [...planned.selection, ...at.node.slice(from.length)];
      after = moved;
      const { start, end, text, original } = planned.edit;
      return {
        edits: new Map([[path, [{ start, end, text, expected: original }]]]),
        select: { before: { path, node: [...at.node] }, after: { path, node: moved }, ...("drop" in to ? { flash: to.where } : {}) },
        ...words(to, section, source, from),
      };
    };

    const settle = (outcome: Outcome): Settled => {
      if (outcome.ok) {
        if (outcome.status === "applied" && after) return { status: "moved", node: after, ...(outcome.message ? { message: outcome.message } : {}) };
        return { status: "stayed", ...(stayed ? { message: stayed } : {}) };
      }
      if (outcome.reason === "stale") return { status: "stale", message: stale, changed: outcome.changed };
      if (staleBytes) return { status: "stale", message: stale };
      // A refusal the plan made is said; one the editor made on a planned move is an error.
      return { status: "refused", message: outcome.message, ...(after ? { failed: true as const } : {}) };
    };

    if (ports.mounted(path)) return settle(edits.now(plan, { since: options.since, guard: options.guard, anchor: path }));
    // The page opens first. Opening it may leave the page shown and Edit component mode: only the load counts.
    const held = options.since ?? edits.stamp();
    const changed = () => { const key = held.changed(); return key === "route" || key === "edit-mode" ? undefined : key; };
    const since: Stamp = { changed, holds: () => !changed() };
    const forget = ports.forgetOpening(path);
    const settled = edits.run(plan, {
      since, anchor: path, openOnlyIfCurrent: true,
      // The page mounts only on the bytes the move was measured on.
      guard: () => (options.guard?.() ?? true) && edits.peek.source(path) === expected,
    }).then(outcome => {
      const out = settle(outcome);
      const gone = !outcome.ok && outcome.reason === "stale" && (outcome.changed === "scope" || outcome.changed === "generation");
      if (out.status === "stale" && !gone && expected !== undefined) forget(expected);
      return out;
    });
    return { status: "pending", settled };
  }

  return { grip, move };
}
