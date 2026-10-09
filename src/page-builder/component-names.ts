import { descendants, parseSource, plainText, startTagAttributes, tagNameProblem } from "./component-model.ts";

export type NameSource = "section" | "card" | "block";

/** Shared component and slot spelling; keep a trailing dash until committed. */
export function normaliseName(value: string, final = false): string {
  const name = value.toLowerCase().replace(/[\s_]+/g, "-").replace(/[^a-z0-9-]/g, "")
    .replace(/-{2,}/g, "-").replace(/^[^a-z]+/, "");
  return final ? name.replace(/-+$/, "") : name;
}

/** Preview the live spelling, choosing the prefix from the committed spelling. */
export function previewComponentTag(value: string, source: NameSource): string {
  const name = normaliseName(value);
  const finalName = normaliseName(value, true);
  return finalName && !finalName.includes("-") ? `${source}-${name}` : name;
}

/** The committed tag and the existing validator's taken/reserved-name problem. */
export function normaliseComponentName(value: string, source: NameSource, taken: Iterable<string>) {
  const tag = previewComponentTag(normaliseName(value, true), source);
  return { tag, problem: tagNameProblem(tag, taken) };
}

/** Map a text offset through normalisation, including a trimmed trailing dash. */
export function normaliseAtCaret(value: string, caret: number, final = false): { value: string; caret: number } {
  const next = normaliseName(value, final);
  const before = normaliseName(value.slice(0, Math.max(0, Math.min(caret, value.length))));
  return { value: next, caret: Math.min(before.length, next.length) };
}

/** Normalise an input or contenteditable chip without moving its text caret. */
export function normaliseField(el: HTMLInputElement | HTMLElement): void {
  if (el.tagName === "INPUT") {
    const input = el as HTMLInputElement;
    const next = normaliseAtCaret(input.value, input.selectionStart ?? input.value.length);
    if (next.value === input.value) return;
    input.value = next.value;
    input.setSelectionRange(next.caret, next.caret);
    return;
  }

  const value = el.textContent ?? "";
  const selection = el.ownerDocument.getSelection();
  const hasCaret = selection && selection.rangeCount > 0 && selection.focusNode && el.contains(selection.focusNode);
  let caret = value.length;
  if (hasCaret) {
    const before = el.ownerDocument.createRange();
    before.selectNodeContents(el);
    before.setEnd(selection.focusNode!, selection.focusOffset);
    caret = before.toString().length;
  }
  const next = normaliseAtCaret(value, caret);
  if (next.value === value) return;
  el.textContent = next.value;
  if (hasCaret) {
    const range = el.ownerDocument.createRange();
    range.setStart(el.firstChild ?? el, next.caret);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }
}

/** A slot name edited in place (the slot chip), as committed: its final spelling, or none when empty or unchanged. */
export function committedSlotName(before: string, typed: string): string | undefined {
  const name = normaliseName(typed, true);
  return name && name !== before ? name : undefined;
}

/** What an element was made from, for its name's prefix (handoff decision 9): a section, a card (an article, a class word "card"), else a block. */
export function madeFrom(tag: string, className = ""): NameSource {
  if (tag === "section") return "section";
  if (tag === "article" || className.split(/\s+/).some((word) => word.split(/[-_]+/).includes("card"))) return "card";
  return "block";
}

/**
 * The name Make component gives the element written as `html` (build slice
 * 22): the prefix for what it was made from and the first three words of its
 * first heading ("Recent work" in a section: `section-recent-work`), else a
 * number (`section-1`); a taken name takes the next free number.
 */
export function automaticComponentName(html: string, taken: Iterable<string>): string {
  const nodes = parseSource(html);
  const all = [...descendants(nodes)];
  const root = all[0];
  const prefix = madeFrom(root?.name ?? "", root ? startTagAttributes(html, root.tag).find((entry) => entry.name === "class")?.value : undefined);
  const heading = all.find((el) => /^h[1-6]$/.test(el.name) && el.close);
  const text = heading ? plainText(html.slice(heading.tag.end, heading.close!.start)).normalize("NFD").replace(/[\u0300-\u036f]/g, "") : "";
  // Normalised behind the prefix, so digits leading the heading stay.
  const words = normaliseName(`${prefix} ${text}`, true).split("-").slice(1);
  if (words[0] === prefix) words.shift();
  const names = [...taken];
  const free = (name: string) => !tagNameProblem(name, names);
  if (words.length) {
    const base = `${prefix}-${words.slice(0, 3).join("-")}`;
    if (free(base)) return base;
    for (let n = 2; ; n++) if (free(`${base}-${n}`)) return `${base}-${n}`;
  }
  for (let n = 1; ; n++) if (free(`${prefix}-${n}`)) return `${prefix}-${n}`;
}
