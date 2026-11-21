// The edit bar's notion of "the whole element is bold/italic", shared by Lex's bar (src/page-builder-host.ts)
// and a synced session guest's (src/guest-edits.ts, src/guest-edit-bar.ts). Reads the markup in a browser page.

/** Offsets in `inner` of the one wrapper it is made of. */
export interface WholeWrapper { open: number; openEnd: number; closeAt: number; closeEnd: number }

/** Whether `inner` is exactly one `tags` element (plus whitespace); returns that wrapper's range. */
export function wholeWrapper(inner: string, tags: string[]): WholeWrapper | undefined {
  const template = document.createElement("template");
  template.innerHTML = inner;
  const nodes = [...template.content.childNodes].filter((n) => n.nodeType !== Node.TEXT_NODE || n.textContent?.trim());
  const only = nodes.length === 1 && nodes[0] instanceof Element ? nodes[0] : undefined;
  if (!only || !tags.includes(only.localName)) return undefined;
  const open = inner.search(new RegExp(`<(${tags.join("|")})[\\s>]`, "i"));
  const closeAt = inner.toLowerCase().lastIndexOf(`</${only.localName}`);
  const closeEnd = inner.indexOf(">", closeAt);
  if (open < 0 || closeAt < 0 || closeEnd < 0) return undefined;
  const openEnd = inner.indexOf(">", open);
  return { open, openEnd: openEnd + 1, closeAt, closeEnd: closeEnd + 1 };
}
