// Conditional parts of a component template, for the static exporter. The
// preview runtime applies the same rules live (`applyEmptyRules` in
// public/native-preview-runtime.js): an element with `data-if="name other"`
// shows only when the page assigned content to every named slot; an element
// that holds slots, none of which has content (assigned by the page or given
// as fallback in the template), and that has no text of its own, does not
// show either. `data-if` on a `<slot>` makes it optional: it shows, fallback
// and all, only when the page fills the named slots (a bare `data-if` names
// the slot itself), and its fallback no longer keeps a wrapper showing. In a
// section component every slot is optional without `data-if`, since each new
// instance gets its own copy of every fallback: a part the page leaves out
// was removed. An instance that fills nothing at all (a bare tag, or the
// component shown by itself) still shows the fallbacks. The runtime hides
// such elements; the exporter leaves them out.

import { VOID_ELEMENTS, isSectionTemplate, startTagAttribute, startTags, type ElementRange, type StartTag } from "./html-source";

const blankOut = (html: string) => html.replace(/<!--[\s\S]*?-->/g, (comment) => " ".repeat(comment.length));
const hasContent = (html: string) => /<[a-zA-Z]/.test(html) || Boolean(html.replace(/<[^>]*>/g, "").trim());

// The outer range of every start tag, from one pass over start and end tags
// with a stack: an end tag closes the nearest open element of its name
// (anything opened after it is closed implicitly there), a void or
// self-closing tag closes at once, and an element left open ends where its
// parent does (or at the end of the source).
function elementRanges(html: string, tags: StartTag[]): ElementRange[] {
  const ranges: ElementRange[] = tags.map((tag) => ({ tag, start: tag.start, end: tag.end }));
  const stack: number[] = [];
  const ends = [...html.matchAll(/<\/([a-zA-Z][^\s>]*)\s*>/g)].map((match) => ({ name: match[1].toLowerCase(), start: match.index, end: match.index + match[0].length }));
  let nextEnd = 0;
  const closeTop = (at: number) => { ranges[stack.pop()!].end = at; };
  const closeWith = (end: { name: string; start: number; end: number }) => {
    const depth = stack.map((index) => tags[index].name).lastIndexOf(end.name);
    if (depth < 0) return;
    while (stack.length > depth + 1) closeTop(end.start);
    const index = stack.pop()!;
    ranges[index].end = end.end;
    ranges[index].close = { start: end.start, end: end.end };
  };
  tags.forEach((tag, index) => {
    while (nextEnd < ends.length && ends[nextEnd].start < tag.start) closeWith(ends[nextEnd++]);
    if (VOID_ELEMENTS.has(tag.name) || html[tag.end - 2] === "/") return;
    stack.push(index);
  });
  while (nextEnd < ends.length) closeWith(ends[nextEnd++]);
  while (stack.length) closeTop(html.length);
  return ranges;
}

/**
 * The slot names an instance's light DOM fills: the `slot` attribute of each
 * top-level element, and "" (the default slot) for top-level text or an
 * element without one.
 */
export function assignedSlotNames(inner: string) {
  const html = blankOut(inner);
  const tags = startTags(html);
  const ranges = elementRanges(html, tags);
  const names = new Set<string>();
  let cursor = 0;
  tags.forEach((tag, index) => {
    if (tag.start < cursor) return;
    if (html.slice(cursor, tag.start).trim()) names.add("");
    cursor = ranges[index].end;
    names.add(startTagAttribute(html, tag, "slot")?.value.trim() ?? "");
  });
  if (html.slice(cursor).trim()) names.add("");
  return names;
}

/**
 * Whether an optional slot (`data-if`, or any slot of a section component
 * whose instance fills some slot) lacks a slot it names; false for any other slot.
 */
function slotConditionUnmet(html: string, slot: StartTag, assigned: Set<string>, optionalSlots: boolean) {
  const condition = startTagAttribute(html, slot, "data-if")?.value ?? (optionalSlots ? "" : undefined);
  if (condition === undefined) return false;
  const names = condition.trim() || (startTagAttribute(html, slot, "name")?.value.trim() ?? "");
  return names.split(/\s+/).some((name) => !assigned.has(name));
}

/** The template without the elements the page's slot content leaves empty. */
export function pruneEmptyTemplate(template: string, assigned: Set<string>) {
  const optionalSlots = assigned.size > 0 && isSectionTemplate(template);
  const html = blankOut(template);
  const tags = startTags(html);
  const ranges = elementRanges(html, tags);
  const removed: { start: number; end: number }[] = [];
  tags.forEach((tag, index) => {
    const range = ranges[index];
    if (removed.some((cut) => tag.start >= cut.start && tag.start < cut.end)) return;
    if (tag.name === "slot") {
      if (slotConditionUnmet(html, tag, assigned, optionalSlots)) removed.push({ start: range.start, end: range.end });
      return;
    }
    const inner = range.close ? html.slice(tag.end, range.close.start) : "";
    let empty: boolean;
    const condition = startTagAttribute(html, tag, "data-if");
    if (condition) {
      empty = condition.value.trim().split(/\s+/).some((name) => !assigned.has(name));
    } else {
      const slots = tags.map((slot, at) => ({ slot, at })).filter(({ slot }) =>
        slot.name === "slot" && slot.start > tag.start && slot.start < range.end);
      empty = slots.length > 0 && !slots.some(({ slot, at }) => {
        const name = startTagAttribute(html, slot, "name")?.value.trim() ?? "";
        const slotRange = ranges[at];
        const fallback = slotRange.close ? html.slice(slot.end, slotRange.close.start) : "";
        return assigned.has(name) || (hasContent(fallback) && !slotConditionUnmet(html, slot, assigned, optionalSlots));
      }) && !slots.reduceRight((text, { at }) => {
        // The element's own text, without what its slots hold.
        const slotRange = ranges[at];
        return text.slice(0, slotRange.start - tag.end) + text.slice(slotRange.end - tag.end);
      }, inner).replace(/<[^>]*>/g, "").trim();
    }
    if (empty) removed.push({ start: range.start, end: range.end });
  });
  let out = template;
  for (const cut of removed.sort((a, b) => b.start - a.start)) {
    // With the element goes the indentation before it and the line break after it.
    let start = cut.start;
    while (start > 0 && (out[start - 1] === " " || out[start - 1] === "\t")) start--;
    let end = cut.end;
    if (out[end] === "\r") end++;
    if (out[end] === "\n") end++;
    else start = cut.start;
    out = out.slice(0, start) + out.slice(end);
  }
  return out;
}

/**
 * The template with the fallback content of every slot the page fills taken
 * out (`<slot name="title">Untitled</slot>` becomes `<slot name="title"></slot>`).
 * The browser never shows that fallback, but a reader of the raw HTML that
 * does not attach declarative shadow roots would take it for page content.
 */
export function dropFilledFallbacks(template: string, assigned: Set<string>) {
  const html = blankOut(template);
  const tags = startTags(html);
  const ranges = elementRanges(html, tags);
  const cuts: { start: number; end: number }[] = [];
  tags.forEach((tag, index) => {
    const close = ranges[index].close;
    if (tag.name !== "slot" || !close || close.start === tag.end) return;
    if (cuts.some((cut) => tag.start >= cut.start && tag.start < cut.end)) return;
    if (assigned.has(startTagAttribute(html, tag, "name")?.value.trim() ?? "")) cuts.push({ start: tag.end, end: close.start });
  });
  let out = template;
  for (const cut of cuts.sort((a, b) => b.start - a.start)) out = out.slice(0, cut.start) + out.slice(cut.end);
  return out;
}
