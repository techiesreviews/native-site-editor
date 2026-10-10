// Inserting a block (Section, Div, Heading, Paragraph, Image, Button) into a
// page, or moving any of the page's elements (or the template's parts in
// Edit component mode) where HTML allows: one source edit and one undo
// step, with the block selected and its place flashed. The rail's click
// (`click`) picks the place from the selection
// (src/page-builder/block-insert.ts); a drag (`drop`, `move`) brings the
// place it was dropped on; templates pass their own place to `insert`.
// In Edit component mode the target is the template edited (`template`):
// its path, a selected part of it, the place by the template's rule
// (`templateClickTarget`); each insert is one step on the template file.

import { PLACEHOLDER_IMAGE_PATH, placeholderImageSvg, type NativeElementKind } from "../page-builder/native-elements";
import { blockMarkup, blockNames, clickTarget, itemsSlotRule, templateClickTarget, templateDropRefusal, templateMoveRefusal } from "../page-builder/block-insert";
import { applyGuardedSourceEdit, nativeEditInside, nativeMarkupInsertEdit, nativeMoveRefusal } from "../page-builder/native-operations";
import { nativeElementMovePlan } from "../page-builder/native-move-choices";

type NodeRequest = { path: string; node: number[] };
/** `template`: `path` is the template of this component, edited in Edit component mode. */
export type RailTarget = { path: string; node?: number[]; painted?: string; template?: string };
export interface BlockInsertPorts {
  /**
   * The page the preview shows, with the selection on it (a body path; a
   * component's part gives its instance) and the page bytes it was painted from.
   */
  readonly target: () => RailTarget | undefined;
  readonly source: (path: string) => string | undefined;
  readonly exists: (path: string) => boolean;
  /** A component's template file by its tag (for its items slots). */
  readonly template: (tag: string) => { path: string; source: string } | undefined;
  /** Proof of the repository, branch and session now; false once any changed. */
  readonly proof: () => () => boolean;
  /** Opens the page in the editor, whose history takes the step: a proof it stays open there, or nothing when it could not. */
  readonly open: (path: string) => Promise<(() => boolean) | undefined>;
  /** One operation over drafts and one undo step (src/main.ts `applyNativeOperation`); resolves to an error. */
  readonly apply: (op: {
    expectedSources: Map<string, string | undefined>; creates?: { path: string; content: string }[]; edits: Map<string, string>;
    done: string; undone: string; current: () => boolean; selection: { before?: NodeRequest; after: NodeRequest };
  }) => Promise<string | undefined>;
  /** Selects this element once the page renders `source`, flashing it when `where` is given (an insert or move); undefined cancels. */
  readonly select: (request: (NodeRequest & { source: string }) | undefined, where?: string) => void;
  /** Flashes the red reason at the selection; nothing is inserted. */
  readonly refuse: (reason: string, pointer?: { x: number; y: number }) => void;
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
  /**
   * Inserts the block as one step; the first Image also writes the site's
   * placeholder image in that step, later ones reuse whatever it holds.
   * Resolves to an error message, or nothing.
   */
  async function insert(request: BlockInsert): Promise<string | undefined> {
    const { path, parent, index, kind, wrap, slot } = request, name = blockNames[kind];
    const proof = ports.proof();
    const source = ports.source(path);
    if (source === undefined) return `${name} was not added: ${path} is not there any more.`;
    const opened = await ports.open(path);
    if (!opened || !proof() || ports.source(path) !== source) return "The page changed meanwhile. Try again.";
    // The step's undo belongs to this page's history: another file opened meanwhile stops it.
    const current = () => proof() && opened();
    // An instance's seal opens only at its items slots: the templates that say so are part of the step's proof.
    const templates = new Map<string, string>();
    const items = itemsSlotRule((tag) => {
      const file = ports.template(tag);
      if (file) templates.set(file.path, file.source);
      return file?.source;
    });
    const edit = nativeMarkupInsertEdit(source, parent, index, blockMarkup(source, kind, parent, wrap, items), items, slot);
    const next = edit && applyGuardedSourceEdit(source, edit);
    if (!next) return `${name} was not added: the HTML around that spot could not be read exactly.`;
    const placeholder = kind === "image" && !ports.exists(PLACEHOLDER_IMAGE_PATH);
    const after = { path, node: wrap ? [...parent, index, 0] : [...parent, index] };
    ports.select({ ...after, source: next }, request.where);
    const error = await ports.apply({
      expectedSources: new Map([...templates, [path, source]]),
      creates: placeholder ? [{ path: PLACEHOLDER_IMAGE_PATH, content: placeholderImageSvg }] : undefined,
      edits: new Map([[path, next]]),
      done: `${name} added.${request.where ? ` ${request.where}` : ""}`,
      undone: `Undid adding the ${name}.`,
      current,
      selection: { before: request.before, after },
    });
    if (error) ports.select(undefined);
    return error;
  }

  /** A rail button clicked: the block goes where the selection (`at`, when the click was) says, or the reason flashes. */
  async function click(kind: NativeElementKind, at = ports.target()) {
    const source = at && ports.source(at.path);
    if (!at || source === undefined) { ports.refuse("Open a page to add blocks to it."); return; }
    // Only text changed inside the selected element: its position still holds.
    if (at.node && at.painted !== undefined && !nativeEditInside(at.painted, source, at.node)) { ports.refuse("The page is still updating. Try again in a moment."); return; }
    const templateOf = (tag: string) => ports.template(tag)?.source;
    const target = at.template === undefined ? clickTarget(source, kind, at.node, templateOf) : templateClickTarget(source, at.template, kind, at.node);
    if (!target.ok) { ports.refuse(target.reason); return; }
    const error = await insert({
      path: at.path, parent: target.parent, index: target.index, kind, wrap: target.wrap, slot: target.slot, where: target.where,
      before: at.node ? { path: at.path, node: at.node } : undefined,
    });
    if (error) ports.refuse(error);
  }

  /**
   * A rail block dropped on the canvas at `place` (a body path and index
   * measured on the page's `painted` bytes; `slot` for an instance's items
   * slot): inserted there, or the reason flashes when the page has changed since.
   */
  async function drop(kind: NativeElementKind, place: { parent: number[]; index: number; where: string; slot?: string }, painted: string | undefined, at = ports.target(), pointer?: { x: number; y: number }) {
    const source = at && ports.source(at.path);
    if (!at || source === undefined) { ports.refuse("Open a page to add blocks to it.", pointer); return; }
    // Text typed into the selection since leaves the places around it as measured, not those inside it.
    const typed = painted !== undefined && at.node !== undefined && !within(place.parent, at.node) && nativeEditInside(painted, source, at.node);
    if (painted !== source && !typed) { ports.refuse("The page is still updating. Try again in a moment.", pointer); return; }
    // The frame measured the place; the template's own rule says whether it takes blocks.
    const refused = at.template === undefined ? undefined : templateDropRefusal(source, place.parent);
    if (refused) { ports.refuse(refused, pointer); return; }
    const error = await insert({ path: at.path, ...place, kind, before: at.node ? { path: at.path, node: at.node } : undefined });
    if (error) ports.refuse(error, pointer);
  }

  /**
   * The page's block at `from` (named `name`, measured on the `pressed`
   * bytes) dragged to `place` (measured on the `painted` bytes; `slot` for
   * an instance's items slot): moved there as one step, or the reason
   * flashes when the page has changed since or the HTML there cannot take
   * it. `current`: the drag's own proof (its page still on show); `inside`:
   * the path from the moved slot down to the part pressed in it.
   */
  async function move(request: { from: number[]; name: string; pressed: string | undefined; place: { parent: number[]; index: number; where: string; slot?: string }; painted: string | undefined; current?: () => boolean; inside?: number[] }, at = ports.target()) {
    const { from, name, place } = request;
    const proof = ports.proof(), still = () => proof() && (request.current?.() ?? true);
    const source = at && ports.source(at.path);
    if (!at || source === undefined) { ports.refuse("Open a page to move blocks in it."); return; }
    // The press's bytes, or with only text typed into the block since (the bar's name commits typing as it is pressed).
    const pressed = request.pressed !== undefined && nativeEditInside(request.pressed, source, from);
    if (request.painted !== source || !pressed) { ports.refuse("The page is still updating. Try again in a moment."); return; }
    // An instance's seal opens only at its items slots: the templates that say so are part of the step's proof.
    const templates = new Map<string, string>();
    const items = itemsSlotRule((tag) => {
      const file = ports.template(tag);
      if (file) templates.set(file.path, file.source);
      return file?.source;
    });
    // In Edit component mode, the template's own rule: never into a named slot or a nested component.
    const refused = at.template === undefined ? undefined : templateMoveRefusal(source, from, place.parent);
    if (refused) { ports.refuse(`${name} was not moved: ${refused}`); return; }
    const plan = nativeElementMovePlan(source, from, place, items);
    // Where it already is (the drag says so): nothing to write.
    if (plan.status === "stayed") return;
    const next = plan.status === "moved" ? applyGuardedSourceEdit(source, plan.edit) : undefined;
    if (plan.status !== "moved" || next === undefined) {
      ports.refuse(`${name} was not moved: ${nativeMoveRefusal(source, from, place.parent, items, place.slot) ?? "the HTML there cannot take it."}`);
      return;
    }
    const { path } = at;
    const opened = await ports.open(path);
    if (!opened || !still() || ports.source(path) !== source) { ports.refuse("The page changed meanwhile. Try again."); return; }
    // A template's part moved with its slot stays selected inside it.
    const after = { path, node: [...plan.selection, ...request.inside ?? []] };
    ports.select({ ...after, source: next }, place.where);
    const error = await ports.apply({
      expectedSources: new Map([...templates, [path, source]]), edits: new Map([[path, next]]),
      done: `${name} moved. ${place.where}`, undone: `Undid moving the ${name}.`,
      // The step's undo belongs to this page's history: another file opened meanwhile stops it.
      current: () => still() && opened(),
      selection: { before: { path, node: [...from, ...request.inside ?? []] }, after },
    });
    if (error) { ports.select(undefined); ports.refuse(error); }
  }

  return { insert, click, drop, move };
}
export type BlockInsertController = ReturnType<typeof createBlockInsertController>;
