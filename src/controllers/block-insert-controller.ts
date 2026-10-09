// Inserting a block (Section, Div, Heading, Paragraph, Image, Button) into a
// page: one source edit and one undo step, with the new block selected and
// its place flashed. The rail's click (`click`) picks the place from the
// selection (src/page-builder/block-insert.ts); dragging and templates pass
// their own place to `insert`.

import { PLACEHOLDER_IMAGE_PATH, placeholderImageSvg, type NativeElementKind } from "../page-builder/native-elements";
import { blockMarkup, blockNames, clickTarget } from "../page-builder/block-insert";
import { applyGuardedSourceEdit, nativeMarkupInsertEdit } from "../page-builder/native-operations";

type NodeRequest = { path: string; node: number[] };
export interface BlockInsertPorts {
  /** The page the preview shows, with the selection on it (a body path; a component's part gives its instance). */
  readonly target: () => { path: string; node?: number[] } | undefined;
  readonly source: (path: string) => string | undefined;
  readonly exists: (path: string) => boolean;
  /** Proof of the repository, branch and session now; false once any changed. */
  readonly proof: () => () => boolean;
  /** Opens the page in the editor, whose history takes the step; false when it could not. */
  readonly open: (path: string) => Promise<boolean>;
  /** One operation over drafts and one undo step (src/main.ts `applyNativeOperation`); resolves to an error. */
  readonly apply: (op: {
    expectedSources: Map<string, string | undefined>; creates?: { path: string; content: string }[]; edits: Map<string, string>;
    done: string; undone: string; current: () => boolean; selection: { before?: NodeRequest; after: NodeRequest };
  }) => Promise<string | undefined>;
  /** Selects this element after the next render, flashing `where` at it; undefined cancels. */
  readonly select: (request: NodeRequest | undefined, where?: string) => void;
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
    const { path, parent, index, kind, wrap } = request, name = blockNames[kind];
    const current = ports.proof();
    const source = ports.source(path);
    if (source === undefined) return `${name} was not added: ${path} is not there any more.`;
    if (!await ports.open(path) || !current() || ports.source(path) !== source) return "The page changed meanwhile. Try again.";
    const edit = nativeMarkupInsertEdit(source, parent, index, blockMarkup(source, kind, parent, wrap));
    const next = edit && applyGuardedSourceEdit(source, edit);
    if (!next) return `${name} was not added: the HTML around that spot could not be read exactly.`;
    const placeholder = kind === "image" && !ports.exists(PLACEHOLDER_IMAGE_PATH);
    const after = { path, node: wrap ? [...parent, index, 0] : [...parent, index] };
    ports.select(after, request.where);
    const error = await ports.apply({
      expectedSources: new Map([[path, source]]),
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

  /** A rail button clicked: the block goes where the selection says, or the reason flashes. */
  async function click(kind: NativeElementKind) {
    const at = ports.target();
    const source = at && ports.source(at.path);
    if (!at || source === undefined) { ports.refuse("Open a page to add blocks to it."); return; }
    const target = clickTarget(source, kind, at.node);
    if (!target.ok) { ports.refuse(target.reason); return; }
    const error = await insert({
      path: at.path, parent: target.parent, index: target.index, kind, wrap: target.wrap, where: target.where,
      before: at.node ? { path: at.path, node: at.node } : undefined,
    });
    if (error) ports.refuse(error);
  }

  return { insert, click };
}
export type BlockInsertController = ReturnType<typeof createBlockInsertController>;
