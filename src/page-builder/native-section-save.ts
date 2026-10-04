import { nativePageRoute } from "../../shared/native-routes";
import { parseSource, type SourceElement, type SourceNode } from "./component-model";
import { attribute } from "./collection-model";
import { EDITOR_PAGE_BUILDER_PATH } from "./page-builder-document";
import { planStaticSectionSave, readStaticSectionRecords, type StaticSectionOperation, type StaticSectionRecord } from "./static-sections";

/**
 * Saves the exact current markup of one selected ordinary `<section>` back into its existing
 * reusable section record (editor JSON only). The page and every stylesheet stay untouched:
 * the public stylesheet remains the authority and `record.css` is kept as the seed it was.
 * Saved records only shape future inserts; earlier inserted copies are not linked.
 */
export interface NativeSectionSaveInput {
  pagePath: string;
  /** Exact loaded page bytes; the host must still hold them when applying. */
  pageSource: string;
  /** Native body-relative element-child path of the selected section. */
  node: readonly number[];
  /** Optional outer source range of the selection; must match the resolved element exactly. */
  range?: { start: number; end: number };
  /** Loaded editor JSON. Undefined means no saved sections exist, so there is nothing to update. */
  documentText: string | undefined;
  /** Complete file graph, when known; compared again by the host before applying. */
  files?: readonly string[];
  /** Explicit record id; otherwise exactly one saved rootClass must match the section's classes. */
  recordId?: string;
}
export type NativeSectionSavePlan =
  | { noop: true; recordId: string }
  | { noop: false; recordId: string; operation: StaticSectionOperation; expectedFiles?: readonly string[] };

function reject(message: string): never { throw new Error(message); }
const elements = (nodes: SourceNode[]) => nodes.filter((node): node is SourceElement => node.type === "element");

function selectedElement(source: string, path: readonly number[]): SourceElement {
  const html = elements(parseSource(source)).find((element) => element.name === "html");
  const body = html && elements(html.children).find((element) => element.name === "body");
  if (!body) reject("The page needs explicit <html> and <body> elements.");
  if (!path.length || path.some((index) => !Number.isInteger(index) || index < 0)) reject("Select a section on the page.");
  let current = body;
  for (const index of path) {
    const next = elements(current.children)[index];
    if (!next) reject("The selected section is no longer on the page.");
    current = next;
  }
  return current;
}

export function planSelectedStaticSectionSave(input: NativeSectionSaveInput): NativeSectionSavePlan | { error: string } {
  try {
    if (nativePageRoute(input.pagePath) === undefined || typeof input.pageSource !== "string") reject("Open a native HTML page before saving a section.");
    const files = input.files && new Set(input.files);
    if (files && !files.has(input.pagePath)) reject("Loaded sources do not match the file graph.");
    if (input.documentText === undefined) {
      if (files?.has(EDITOR_PAGE_BUILDER_PATH)) reject(`Load ${EDITOR_PAGE_BUILDER_PATH} before saving a section.`);
      reject("There is no saved section to update. Add a saved section first.");
    }
    const element = selectedElement(input.pageSource, input.node);
    if (input.range && (input.range.start !== element.start || input.range.end !== element.end)) reject("The selection no longer matches the page source.");
    if (element.name !== "section") reject("Select the section itself, not an element inside it.");
    for (let parent = element.parent; parent; parent = parent.parent) {
      if (["template", "noscript", "slot"].includes(parent.name) || parent.name.includes("-")) reject("Sections inside components or templates cannot be saved here.");
    }
    if (!element.close) reject("The selected section needs an explicit closing tag.");
    const html = input.pageSource.slice(element.start, element.end);
    const classes = new Set((attribute(input.pageSource, element, "class") ?? "").split(/[\t\n\f\r ]+/).filter(Boolean));
    const records = readStaticSectionRecords(input.documentText);
    let old: StaticSectionRecord;
    if (input.recordId !== undefined) {
      if (!Object.hasOwn(records, input.recordId)) reject("That saved section no longer exists.");
      old = records[input.recordId];
      if (!classes.has(old.rootClass)) reject(`The selected section does not carry the class ${old.rootClass}.`);
    } else {
      const matches = Object.values(records).filter((record) => classes.has(record.rootClass));
      if (!matches.length) reject("This section does not match a saved section. Only sections added from the section list can be saved back.");
      if (matches.length > 1) reject("This section matches more than one saved section. Choose which one to update.");
      old = matches[0];
    }
    const record: StaticSectionRecord = { ...structuredClone(old), html };
    const save = planStaticSectionSave({ documentText: input.documentText, files: input.files, record, overwrite: { expected: old } });
    if ("error" in save) return save;
    if (old.html === html) return { noop: true, recordId: old.id };
    const expectedSources = new Map(save.operation.expectedSources);
    expectedSources.set(input.pagePath, input.pageSource);
    return { noop: false, recordId: old.id, operation: { ...save.operation, expectedSources }, ...(save.expectedFiles ? { expectedFiles: save.expectedFiles } : {}) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
