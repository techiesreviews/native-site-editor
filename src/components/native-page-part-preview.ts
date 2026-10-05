// Editor-only composition: replace one proven header/footer with its actual master root.
// No public source writes or markers; subtree paths start at the master root [0].

import { nativePageBody } from "../../shared/native-project";
import { parseSource, type SourceElement, type SourceNode } from "../page-builder/component-model";
import { pagePartCore } from "../page-builder/native-page-parts";

/** One explicit master editing session, as the host proves it. */
export interface NativePagePartEditInput {
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
  /** `.editor/page-parts/<id>.html`. */
  masterPath: string;
  /** The master file's exact bytes (drafts included); equal to the preview source for `masterPath` when it has one. */
  masterSource: string;
}

/** What the preview renders for a valid session. */
export interface NativePagePartComposition {
  input: NativePagePartEditInput;
  /** The page's `<body>` content with the copy replaced by the master's `<header>` or `<footer>`. */
  pageBody: string;
  /** The master's `<header>` or `<footer>` bytes (its core). */
  masterPart: string;
  /** Canonical root path in the master file. */
  masterNode: [0];
  rootTag: "header" | "footer";
}

export const NATIVE_PAGE_PART_PATH = /^\.editor\/page-parts\/[a-z][a-z0-9_-]*\.html$/;
const FOREIGN = new Set(["template", "noscript", "slot", "svg", "math", "table", "tbody", "thead", "tfoot", "tr", "td", "th", "p", "select", "option", "ruby"]);

const plain = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const indexes = (value: unknown): value is number[] =>
  Array.isArray(value) && value.length > 0 && value.length <= 500 && value.every((index) => Number.isInteger(index) && index >= 0);

/** A shallow, frozen copy of a well-typed input, or an error. Unknown keys are dropped. */
export function readNativePagePartEditInput(value: unknown): NativePagePartEditInput | { error: string } {
  if (!plain(value)) return { error: "The master session is missing." };
  const { session, pagePath, pageSource, node, basis, masterPath, masterSource } = value;
  if (typeof session !== "string" || !session || session.length > 200) return { error: "The master session needs an id." };
  if (typeof pagePath !== "string" || !pagePath.endsWith(".html") || pagePath.startsWith(".editor/")) return { error: "The master session needs its page." };
  if (typeof masterPath !== "string" || !NATIVE_PAGE_PART_PATH.test(masterPath)) return { error: "A master must be a file in .editor/page-parts/." };
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
export function composeNativePagePartEdit(
  raw: unknown,
  current: { sources: Readonly<Record<string, string>>; pagePath: string | undefined; session?: string },
): NativePagePartComposition | { error: string } {
  const input = readNativePagePartEditInput(raw);
  if ("error" in input) return input;
  if (current.session !== undefined && current.session !== input.session) return { error: "The master session changed." };
  if (current.pagePath !== input.pagePath) return { error: "The master's page is not the page on show." };
  if (!Object.hasOwn(current.sources, input.pagePath) || current.sources[input.pagePath] !== input.pageSource) return { error: "The page changed since the master was opened." };
  if (Object.hasOwn(current.sources, input.masterPath) && current.sources[input.masterPath] !== input.masterSource) return { error: "The master changed since it was read." };

  let core: ReturnType<typeof pagePartCore>;
  try {
    core = pagePartCore(input.masterSource);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The master is not one header or footer." };
  }
  // The master's root must be its first element: its path is [0].
  if (elements(parseSource(input.masterSource))[0]?.start !== core.start) return { error: "The master is not one header or footer." };

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
  if (!found || found.name.toLowerCase() !== core.rootTag) return { error: "The copy on the page has a different root tag." };
  if (input.pageSource.slice(found.start, found.end) !== input.basis) return { error: "The copy on the page does not match the master session." };

  const masterPart = input.masterSource.slice(core.start, core.end);
  const pageBody = input.pageSource.slice(body.start, found.start) + masterPart + input.pageSource.slice(found.end, body.end);
  return { input, pageBody, masterPart, masterNode: [0], rootTag: core.rootTag };
}
