// Editor-only composition for editing a native section master on its page.
//
// While a master session is open, the preview shows the page it was opened
// from with exactly one native `<section>` copy swapped for the master's own
// `<section>` (`.editor/sections/<id>.html`). Nothing here writes a source:
// the composed page exists only inside the sandboxed preview frame. Every
// other byte of the page, its shell, text and comments, is rendered as it is.
//
// The swap is refused, never guessed: the page must be the one on show with
// exactly the bytes the host proved, the copy must sit at the given element
// path, be a complete ordinary `<section>` equal to the proved basis, and the
// master must hold exactly one `<section>` with only whitespace and comments
// around it. Element paths inside the swapped subtree count from the master
// file's root (the master's `<section>` is `[0]`), never from the page.

import { nativePageBody } from "../../shared/native-project";
import { parseSource, type SourceElement, type SourceNode } from "../page-builder/component-model";
import { sectionCore } from "../page-builder/native-section-links";

/** One explicit master editing session, as the host proves it. */
export interface NativeMasterEditInput {
  /** Opaque host session id; a new id (or none) ends the session and refuses its stale messages. */
  session: string;
  /** The page file the master was opened from: it must be the page on show. */
  pagePath: string;
  /** That page's exact bytes; they must equal the preview's current source for `pagePath`. */
  pageSource: string;
  /** Element-child indexes of the copy from the page's `<body>` content, as the preview reports them. */
  node: number[];
  /** The copy's exact outer bytes in `pageSource` (its link basis or painted copy). */
  basis: string;
  /** `.editor/sections/<id>.html`. */
  masterPath: string;
  /** The master file's exact bytes (drafts included); equal to the preview source for `masterPath` when it has one. */
  masterSource: string;
}

/** What the preview renders for a valid session. */
export interface NativeMasterComposition {
  input: NativeMasterEditInput;
  /** The page's `<body>` content with the copy replaced by the master's `<section>`. */
  pageBody: string;
  /** The master's `<section>` bytes (its core). */
  masterSection: string;
}

export const NATIVE_MASTER_PATH = /^\.editor\/sections\/[a-z][a-z0-9_-]*\.html$/;
const FOREIGN = new Set(["template", "noscript", "slot", "svg", "math", "table", "tbody", "thead", "tfoot", "tr", "td", "th", "p", "select", "option", "ruby"]);

const plain = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const indexes = (value: unknown): value is number[] =>
  Array.isArray(value) && value.length > 0 && value.length <= 500 && value.every((index) => Number.isInteger(index) && index >= 0);

/** A shallow, frozen copy of a well-typed input, or an error. Unknown keys are dropped. */
export function readNativeMasterEditInput(value: unknown): NativeMasterEditInput | { error: string } {
  if (!plain(value)) return { error: "The master session is missing." };
  const { session, pagePath, pageSource, node, basis, masterPath, masterSource } = value;
  if (typeof session !== "string" || !session || session.length > 200) return { error: "The master session needs an id." };
  if (typeof pagePath !== "string" || !pagePath.endsWith(".html") || pagePath.startsWith(".editor/")) return { error: "The master session needs its page." };
  if (typeof masterPath !== "string" || !NATIVE_MASTER_PATH.test(masterPath)) return { error: "A master must be a file in .editor/sections/." };
  if (typeof pageSource !== "string" || typeof masterSource !== "string" || typeof basis !== "string" || !basis) return { error: "The master session needs its exact sources." };
  if (!indexes(node)) return { error: "The master session needs the copy's place on the page." };
  return Object.freeze({ session, pagePath, pageSource, node: Object.freeze([...node]) as number[], basis, masterPath, masterSource });
}

const elements = (nodes: SourceNode[]) => nodes.filter((child): child is SourceElement => child.type === "element");

/**
 * Checks a session against what the preview shows now and composes its page.
 * `sources` are the preview's current sources; `pagePath` is the page on show
 * (undefined for a component shown by itself).
 */
export function composeNativeMasterEdit(
  raw: unknown,
  current: { sources: Readonly<Record<string, string>>; pagePath: string | undefined },
): NativeMasterComposition | { error: string } {
  const input = readNativeMasterEditInput(raw);
  if ("error" in input) return input;
  if (current.pagePath !== input.pagePath) return { error: "The master's page is not the page on show." };
  if (!Object.hasOwn(current.sources, input.pagePath) || current.sources[input.pagePath] !== input.pageSource) return { error: "The page changed since the master was opened." };
  if (Object.hasOwn(current.sources, input.masterPath) && current.sources[input.masterPath] !== input.masterSource) return { error: "The master changed since it was read." };

  let core: { start: number; end: number };
  try {
    core = sectionCore(input.masterSource);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The master is not one section." };
  }
  // The master's section must be its first element: its path is [0].
  if (elements(parseSource(input.masterSource))[0]?.start !== core.start) return { error: "The master is not one section." };

  const body = nativePageBody(input.pageSource);
  let level = elements(parseSource(input.pageSource, body.start, body.end));
  let found: SourceElement | undefined;
  for (const index of input.node) {
    const next = level[index];
    // Every ancestor must be complete and ordinary, so the browser builds the same tree.
    if (!next || !next.close || next.name.includes("-") || FOREIGN.has(next.name.toLowerCase())) return { error: "The copy is not at that place on the page." };
    found = next;
    level = elements(next.children);
  }
  if (!found || found.name.toLowerCase() !== "section") return { error: "The copy on the page is not a section." };
  if (input.pageSource.slice(found.start, found.end) !== input.basis) return { error: "The copy on the page does not match the master session." };

  const masterSection = input.masterSource.slice(core.start, core.end);
  const pageBody = input.pageSource.slice(body.start, found.start) + masterSection + input.pageSource.slice(found.end, body.end);
  return { input, pageBody, masterSection };
}
