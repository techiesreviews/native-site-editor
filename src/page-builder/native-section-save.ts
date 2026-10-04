import { nativePageRoute } from "../../shared/native-routes";
import { parseSource, type SourceElement } from "./component-model";
import { attribute } from "./collection-model";
import { EDITOR_PAGE_BUILDER_PATH } from "./page-builder-document";
import { moveLinkedCopyBasis, sectionCore } from "./native-section-links";
import { checkSavedSectionHtml, planStaticSectionSave, readSectionCatalog, type StaticSectionEntry, type StaticSectionMasterEntry, type StaticSectionOperation, type StaticSectionRecord } from "./static-sections";

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
  /**
   * Exact outer source range of the selected element, from the host's `locateNativeElementRange`
   * for the current page and node. Required: this model never interprets native paths itself,
   * because the host's sanitised/browser tree can count elements differently from source.
   * The host must still pin the same page bytes and node when applying.
   */
  range: { start: number; end: number };
  /** Loaded editor JSON. Undefined means no saved sections exist, so there is nothing to update. */
  documentText: string | undefined;
  /** Complete file graph, when known; compared again by the host before applying. */
  files?: readonly string[];
  /** Explicit record id; otherwise exactly one saved rootClass must match the section's classes. */
  recordId?: string;
  /**
   * The loaded source of the record's master file, for a saved section with one (v2). The save
   * then replaces only the master's `<section>` (its padding and comments stay) and, when the
   * selected copy is linked, moves that link's basis to the new section in the same operation.
   */
  master?: string;
}
export type NativeSectionSavePlan =
  | { noop: true; recordId: string }
  | { noop: false; recordId: string; operation: StaticSectionOperation; expectedFiles?: readonly string[] };

function reject(message: string): never { throw new Error(message); }

const unsupportedAncestors = ["template", "noscript", "slot", "svg", "math", "foreignobject"];

function selectedElement(source: string, range: { start: number; end: number } | undefined): SourceElement {
  if (!range || !Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.end) || range.start < 0 || range.end <= range.start || range.end > source.length) reject("Select a section on the page.");
  const stack = parseSource(source);
  while (stack.length) {
    const node = stack.pop()!;
    if (node.type !== "element") continue;
    if (node.start === range.start && node.end === range.end) return node;
    if (node.start <= range.start && node.end >= range.end) stack.push(...node.children);
  }
  return reject("The selection no longer matches the page source.");
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
    const element = selectedElement(input.pageSource, input.range);
    if (element.name !== "section") reject("Select the section itself, not an element inside it.");
    for (let parent = element.parent; parent; parent = parent.parent) {
      if (unsupportedAncestors.includes(parent.name.toLowerCase()) || parent.name.includes("-")) reject("Sections inside components or templates cannot be saved here.");
    }
    if (!element.close) reject("The selected section needs an explicit closing tag.");
    const html = input.pageSource.slice(element.start, element.end);
    const classes = new Set((attribute(input.pageSource, element, "class") ?? "").split(/[\t\n\f\r ]+/).filter(Boolean));
    const records = readSectionCatalog(input.documentText);
    const lowered = new Set([...classes].map((name) => name.toLowerCase()));
    const carried = Object.values(records).filter((record) => lowered.has(record.rootClass.toLowerCase()));
    let old: StaticSectionEntry;
    if (input.recordId !== undefined) {
      if (!Object.hasOwn(records, input.recordId)) reject("That saved section no longer exists.");
      old = records[input.recordId];
      if (!classes.has(old.rootClass)) reject(`The selected section does not carry the class ${old.rootClass}.`);
      if (carried.some((record) => record.id !== old.id)) reject("This section also carries another saved section's class. Remove it before saving.");
    } else {
      const matches = carried;
      if (!matches.length) reject("This section does not match a saved section. Only sections added from the section list can be saved back.");
      if (matches.length > 1) reject("This section matches more than one saved section. Choose which one to update.");
      old = matches[0];
    }
    if (Object.hasOwn(old, "htmlPath")) return saveIntoMaster(input, old as StaticSectionMasterEntry, html);
    const record: StaticSectionRecord = { ...structuredClone(old as StaticSectionRecord), html };
    const save = planStaticSectionSave({ documentText: input.documentText, files: input.files, record, overwrite: { expected: old as StaticSectionRecord } });
    if ("error" in save) return save;
    if ((old as StaticSectionRecord).html === html) return { noop: true, recordId: old.id };
    const expectedSources = new Map(save.operation.expectedSources);
    expectedSources.set(input.pagePath, input.pageSource);
    return { noop: false, recordId: old.id, operation: { ...save.operation, expectedSources }, ...(save.expectedFiles ? { expectedFiles: save.expectedFiles } : {}) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function saveIntoMaster(input: NativeSectionSaveInput, entry: StaticSectionMasterEntry, html: string): NativeSectionSavePlan {
  const path = entry.htmlPath;
  if (typeof input.master !== "string") reject(`Load ${path} before saving into this section's master.`);
  if (!input.files) reject("A complete file graph is needed to save into a master.");
  if (!input.files.includes(path)) reject(`The master ${path} is missing; restore it or remove the saved section.`);
  const core = sectionCore(input.master);
  const master = input.master.slice(0, core.start) + html + input.master.slice(core.end);
  checkSavedSectionHtml(entry, master);
  const json = moveLinkedCopyBasis({ documentText: input.documentText, pagePath: input.pagePath, pageSource: input.pageSource, range: input.range, basis: html, recordId: entry.id });
  if (master === input.master && json === undefined) return { noop: true, recordId: entry.id };
  const edits = new Map<string, string>();
  if (master !== input.master) edits.set(path, master);
  if (json !== undefined) edits.set(EDITOR_PAGE_BUILDER_PATH, json);
  return {
    noop: false,
    recordId: entry.id,
    operation: {
      expectedSources: new Map<string, string | undefined>([[EDITOR_PAGE_BUILDER_PATH, input.documentText], [input.pagePath, input.pageSource], [path, input.master]]),
      edits,
      done: `Saved ${entry.label} to its master`,
      undone: `Reverted ${entry.label}'s master`,
    },
    ...(input.files ? { expectedFiles: [...input.files].sort() } : {}),
  };
}
