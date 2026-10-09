// Inserting a block (Section, Div, Heading, Paragraph, Image, Button) into a
// page: one source edit and one undo step, with the new block selected and
// its place flashed. The rail's click (`click`) picks the place from the
// selection (src/page-builder/block-insert.ts); a drag (`drop`) brings the
// place it was dropped on; templates pass their own place to `insert`.

import { PLACEHOLDER_IMAGE_PATH, placeholderImageSvg, type NativeElementKind } from "../page-builder/native-elements";
import { blockMarkup, blockNames, clickTarget, itemsSlotRule } from "../page-builder/block-insert";
import { applyGuardedSourceEdit, nativeMarkupInsertEdit } from "../page-builder/native-operations";

type NodeRequest = { path: string; node: number[] };
export type RailTarget = { path: string; node?: number[]; painted?: string };
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
  /** Selects this element once the page renders `source`, flashing `where` at it; undefined cancels. */
  readonly select: (request: (NodeRequest & { source: string }) | undefined, where?: string) => void;
  /** Flashes the red reason at the selection; nothing is inserted. */
  readonly refuse: (reason: string) => void;
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
    // A selection painted from other bytes names another element now.
    if (at.node && at.painted !== undefined && at.painted !== source) { ports.refuse("The page is still updating. Try again in a moment."); return; }
    const target = clickTarget(source, kind, at.node, (tag) => ports.template(tag)?.source);
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
  async function drop(kind: NativeElementKind, place: { parent: number[]; index: number; where: string; slot?: string }, painted: string | undefined, at = ports.target()) {
    const source = at && ports.source(at.path);
    if (!at || source === undefined) { ports.refuse("Open a page to add blocks to it."); return; }
    if (painted !== source) { ports.refuse("The page is still updating. Try again in a moment."); return; }
    const error = await insert({ path: at.path, ...place, kind, before: at.node ? { path: at.path, node: at.node } : undefined });
    if (error) ports.refuse(error);
  }

  return { insert, click, drop };
}
export type BlockInsertController = ReturnType<typeof createBlockInsertController>;
