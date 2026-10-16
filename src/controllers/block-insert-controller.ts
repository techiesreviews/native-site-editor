import { NATIVE_CONFIG_PATH, nativeSitePrefix } from "../../shared/native-project";
// Inserting a block (Section, Div, Heading, Paragraph, Image, Button) into a
// page where HTML allows: one source edit and one undo
// step, with the block selected and its place flashed. The rail's click
// (`click`) picks the place from the selection
// (src/page-builder/block-insert.ts); a drag (`drop`) brings the
// place it was dropped on. In Edit component mode the target is the
// template edited (`template`): its path, a selected part of it, the place
// by the template's rule (`templateClickTarget`).
//
// Each action is one guarded edit (src/guarded-edit.ts): its plan reads the
// page, the templates behind items slots and click targets, and the
// placeholder image through `r`, so all of them are proved before the
// write; the module opens the page, writes the step, selects and flashes.
// The caller's stamp (`since`, taken at the click, drop or press) holds
// across the lazy loads. The insertion painted/typed-inside rules stay here.

import { PLACEHOLDER_IMAGE_PATH, placeholderImageSvg, type NativeElementKind } from "../page-builder/native-elements";
import { blockMarkup, blockNames, clickTarget, itemsSlotRule, templateClickTarget, templateDropRefusal } from "../page-builder/block-insert";
import { applyGuardedSourceEdit, nativeEditInside, nativeMarkupInsertEdit } from "../page-builder/native-operations";
import { STALE_MESSAGE, type GuardedEdits, type Reads, type PlanResult, type Outcome, type Stamp } from "../guarded-edit";

type NodeRequest = { path: string; node: number[] };
/** `template`: `path` is the template of this component, edited in Edit component mode. */
export type RailTarget = { path: string; node?: number[]; painted?: string; template?: string };
export interface BlockInsertPorts {
  /**
   * The page the preview shows, with the selection on it (a body path; a
   * component's part gives its instance) and the page bytes it was painted from.
   */
  readonly target: () => RailTarget | undefined;
  readonly edits: Pick<GuardedEdits, "run" | "stamp" | "peek">;
  /** Shows a refusal or a recorded step's refresh error at the selection. */
  readonly refuse: (reason: string, pointer?: { x: number; y: number }) => void;
  /** Media on a page: the Media picker opens for this gap; Use inserts the chosen file there. */
  readonly media?: (place: { path: string; parent: number[]; index: number; wrap?: boolean; slot?: string }) => void;
}
export interface BlockInsert {
  path: string;
  parent: number[];
  index: number;
  kind: NativeElementKind;
  /** In a new Section made for it, at `index` of `parent`. */
  wrap?: boolean;
  /** `parent` is an instance: the items slot the block goes in ("" the unnamed one). */
  slot?: string;
  /** The flash label ("Into Section › after Heading"). */
  where?: string;
  /** What Undo selects again. */
  before?: NodeRequest;
}

/** Whether `path` is `node` or inside it. */
const within = (path: readonly number[], node: readonly number[]) => node.every((index, at) => path[at] === index);

export function createBlockInsertController(ports: BlockInsertPorts) {
  // A refused or stale outcome flashes its reason; a step written whose page then failed to
  // open again (`ok` with a message) says so the same way, its selection kept.
  function report(outcome: Outcome, pointer?: { x: number; y: number }) {
    if (outcome.message) ports.refuse(outcome.message, pointer);
    return outcome.message;
  }

  /** Shared plan: click's target reads and insertion reads belong to one run. */
  function insertPlan(r: Reads, request: BlockInsert): PlanResult {
    const { path, parent, index, kind, wrap, slot } = request, name = blockNames[kind];
    const source = r.source(path);
    if (source === undefined) return { refuse: `${name} was not added: ${path} is not there any more.` };
    const items = itemsSlotRule(tag => r.template(tag)?.source);
    const edit = nativeMarkupInsertEdit(source, parent, index, blockMarkup(source, kind, parent, wrap, items, nativeSitePrefix(r.source(NATIVE_CONFIG_PATH))), items, slot);
    const next = edit && applyGuardedSourceEdit(source, edit);
    if (!next) return { refuse: `${name} was not added: the HTML around that spot could not be read exactly.` };
    const placeholder = kind === "media" && !r.exists(PLACEHOLDER_IMAGE_PATH);
    const after = { path, node: wrap ? [...parent, index, 0] : [...parent, index] };
    return {
      creates: placeholder ? [{ path: PLACEHOLDER_IMAGE_PATH, content: placeholderImageSvg }] : undefined,
      edits: new Map([[path, next]]),
      done: `${name} added.${request.where ? ` ${request.where}` : ""}`,
      undone: `Undid adding the ${name}.`,
      select: { before: request.before, after, flash: request.where },
    };
  }

  /** Inserts one block; the first Image creates its placeholder in the same step. */
  async function insert(request: BlockInsert, since?: Stamp): Promise<string | undefined> {
    return report(await ports.edits.run(r => insertPlan(r, request), { since, anchor: request.path }));
  }

  /** A rail button clicked: the block goes where the selection (`at`, when the click was) says, or the reason flashes. */
  async function click(kind: NativeElementKind, at = ports.target(), since: Stamp = ports.edits.stamp()) {
    if (!at) { ports.refuse("Open a page to add blocks to it."); return; }
    // Media on a page writes nothing yet: the picker opens for the place, read on the bytes now.
    if (kind === "media" && at.template === undefined && ports.media) {
      const source = ports.edits.peek.source(at.path);
      if (source === undefined) { ports.refuse("Open a page to add blocks to it."); return; }
      if (at.node && at.painted !== undefined && !nativeEditInside(at.painted, source, at.node)) { ports.refuse("The page is still updating. Try again in a moment."); return; }
      const target = clickTarget(source, kind, at.node, tag => ports.edits.peek.template(tag)?.source);
      if (!target.ok) { ports.refuse(target.reason); return; }
      if (since.holds()) ports.media({ path: at.path, parent: target.parent, index: target.index, wrap: target.wrap, slot: target.slot });
      return;
    }
    // The bytes the click's place is read on: those painted around the selection, else
    // the bytes now; the page opening for the step must not change them.
    const clicked = at.node && at.painted !== undefined ? undefined : ports.edits.peek.source(at.path);
    report(await ports.edits.run(r => {
      const source = r.source(at.path);
      if (source === undefined) return { refuse: "Open a page to add blocks to it." };
      if (clicked !== undefined && source !== clicked) return { refuse: STALE_MESSAGE };
      // Only text changed inside the selected element: its position still holds.
      if (at.node && at.painted !== undefined && !nativeEditInside(at.painted, source, at.node)) return { refuse: "The page is still updating. Try again in a moment." };
      const target = at.template === undefined ? clickTarget(source, kind, at.node, tag => r.template(tag)?.source) : templateClickTarget(source, at.template, kind, at.node);
      if (!target.ok) return { refuse: target.reason };
      return insertPlan(r, {
        path: at.path, parent: target.parent, index: target.index, kind, wrap: target.wrap, slot: target.slot, where: target.where,
        before: at.node ? { path: at.path, node: at.node } : undefined,
      });
    }, { since, anchor: at.path }));
  }

  /**
   * A rail block dropped on the canvas at `place` (a body path and index
   * measured on the page's `painted` bytes; `slot` for an instance's items
   * slot): inserted there, or the reason flashes when the page has changed since.
   */
  async function drop(kind: NativeElementKind, place: { parent: number[]; index: number; where: string; slot?: string }, painted: string | undefined, at = ports.target(), pointer?: { x: number; y: number }, since: Stamp = ports.edits.stamp()) {
    if (!at) { ports.refuse("Open a page to add blocks to it.", pointer); return; }
    if (kind === "media" && at.template === undefined && ports.media) {
      const source = ports.edits.peek.source(at.path);
      const typed = painted !== undefined && source !== undefined && at.node !== undefined && !within(place.parent, at.node) && nativeEditInside(painted, source, at.node);
      if (source === undefined || painted !== source && !typed) { ports.refuse("The page is still updating. Try again in a moment.", pointer); return; }
      if (since.holds()) ports.media({ path: at.path, parent: place.parent, index: place.index, slot: place.slot });
      return;
    }
    report(await ports.edits.run(r => {
      const source = r.source(at.path);
      if (source === undefined) return { refuse: "Open a page to add blocks to it." };
      // Typing leaves places around the selection measured, but not those inside it.
      const typed = painted !== undefined && at.node !== undefined && !within(place.parent, at.node) && nativeEditInside(painted, source, at.node);
      if (painted !== source && !typed) return { refuse: "The page is still updating. Try again in a moment." };
      const refused = at.template === undefined ? undefined : templateDropRefusal(source, place.parent);
      if (refused) return { refuse: refused };
      return insertPlan(r, { path: at.path, ...place, kind, before: at.node ? { path: at.path, node: at.node } : undefined });
    }, { since, anchor: at.path }), pointer);
  }

  return { insert, click, drop };
}
