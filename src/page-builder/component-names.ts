import { tagNameProblem } from "./component-model.ts";

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
