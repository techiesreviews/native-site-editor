import { startTagAttribute } from "../../shared/html-source";
import { parseSource, startTagAttributes, type SourceElement, type SourceNode } from "./component-model";
import { decodeHtmlEntities } from "./html-entities";

/**
 * Finding one authored element of a page again after the page changed: the
 * target recorded by a shared section copy or page part in
 * `.editor/page-builder.json`. A target is the element's authored `id` when it
 * has one, else its tag and exact opening tag; the element-child path is only
 * a record of where it was.
 */

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export interface SectionTarget { authoredId?: string; path: number[]; tag: string; openingTagFingerprint: string; [key: string]: JsonValue | undefined }
export interface LocatedSectionTarget { element: SourceElement; target: SectionTarget; rebound: boolean }
export type SectionTargetLocation = LocatedSectionTarget | { error: string };

/** An attribute's decoded value on an element's start tag, or undefined when it has none. */
export function attribute(source: string, el: SourceElement, name: string): string | undefined {
  const found = startTagAttribute(source, el.tag, name);
  return found ? decodeHtmlEntities(found.value, true) : undefined;
}

const fingerprint = (source: string, element: SourceElement) => source.slice(element.tag.start, element.tag.end);

// Unknown JSON keys are preserved except these globally reserved prototype names.
const unsafeKeys = new Set(["__proto__", "prototype", "constructor"]);
function fail(message: string): never { throw new Error(message); }
function object(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(`${label} must be a plain object.`);
}
/** Throws unless `value` is plain JSON data without prototype-named keys. */
export function assertJsonValue(value: unknown): void {
  if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value)) return;
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype || Object.keys(value).length !== value.length) fail("JSON arrays must be dense ordinary arrays.");
    value.forEach(assertJsonValue); return;
  }
  object(value, "JSON value");
  for (const [key, item] of Object.entries(value)) { if (unsafeKeys.has(key)) fail(`Unsafe JSON key: ${key}.`); assertJsonValue(item); }
}
/** Throws unless `value` is a well-formed target. */
export function assertSectionTarget(value: unknown): asserts value is SectionTarget {
  object(value, "Section target");
  if (!Array.isArray(value.path) || !value.path.length || value.path.some((index) => !Number.isSafeInteger(index) || index < 0)) fail("Section target needs an element-child path.");
  if (typeof value.tag !== "string" || !/^[a-z][a-z0-9-]*$/.test(value.tag) || value.tag === "template") fail("Invalid section target tag.");
  if (value.authoredId !== undefined && (typeof value.authoredId !== "string" || !value.authoredId || /[\s\x00-\x1f]/.test(value.authoredId))) fail("Invalid authored target id.");
  if (typeof value.openingTagFingerprint !== "string") fail("Missing opening tag fingerprint.");
  const nodes = parseSource(value.openingTagFingerprint);
  const element = nodes[0];
  if (nodes.length !== 1 || element?.type !== "element" || element.name !== value.tag || element.tag.end !== value.openingTagFingerprint.length || !value.openingTagFingerprint.endsWith(">")) fail("Fingerprint must be one opening tag of the target kind.");
  if ((attribute(value.openingTagFingerprint, element, "id") || undefined) !== value.authoredId) fail("Target id and fingerprint must agree.");
}

function elements(nodes: SourceNode[]): SourceElement[] { return nodes.filter((node): node is SourceElement => node.type === "element"); }
function candidates(source: string): { element: SourceElement; path: number[] }[] {
  const result: { element: SourceElement; path: number[] }[] = [];
  const walk = (nodes: SourceNode[], parent: number[]) => elements(nodes).forEach((element, index) => {
    const path = [...parent, index];
    if (element.name === "template") return;
    result.push({ element, path }); walk(element.children, path);
  });
  walk(parseSource(source), []); return result;
}

/** The target of the complete element starting at `target` (an offset, or the element). */
export function makeSectionTarget(source: string, target: number | SourceElement): SectionTarget {
  const start = typeof target === "number" ? target : target.start;
  const found = candidates(source).find(({ element }) => element.start === start);
  if (!found || !found.element.close) fail("Section target must be a complete authored element.");
  if (startTagAttributes(source, found.element.tag).filter((attr) => attr.name === "id").length > 1) fail("Duplicate authored target id attributes.");
  const authoredId = attribute(source, found.element, "id");
  return { ...(authoredId ? { authoredId } : {}), path: found.path, tag: found.element.name, openingTagFingerprint: fingerprint(source, found.element) };
}

/** The one element a target names in `source` (with the target as it is now), or why there is none. */
export function locateSectionTarget(source: string, target: SectionTarget): SectionTargetLocation {
  try {
    assertJsonValue(target); assertSectionTarget(target);
    const all = candidates(source);
    const matching = target.authoredId ? all.filter(({ element }) => attribute(source, element, "id") === target.authoredId) : all.filter(({ element }) => element.name === target.tag && fingerprint(source, element) === target.openingTagFingerprint);
    if (matching.length !== 1) fail("Section target is missing or ambiguous.");
    const found = matching[0];
    if (found.element.name !== target.tag || !found.element.close) fail("Section target kind changed or is incomplete.");
    const current = makeSectionTarget(source, found.element);
    return { element: found.element, target: { ...target, ...current }, rebound: JSON.stringify(found.path) !== JSON.stringify(target.path) };
  } catch (error) { return { error: error instanceof Error ? error.message : String(error) }; }
}
