// Optional parts of a component that hide themselves (clean-up ticket 60):
// one rule for the editor (component-model.ts over the template's source)
// and the preview runtime (over each shadow root, which it marks
// data-native-empty), tested in tests/rules-empty-parts.test.ts. Empty
// parts behave exactly as the site's own loader hides them (`hideEmpty` in
// the starter's components/components.js, a copy per ADR 0001); the parity
// test there runs the loader's copy against this rule on every fixture
// component, so the two cannot drift. It follows the starter's loader as
// shipped (fixtures/actual-starter), not a site's own edited copy of it:
//   - in a section component the page fills at all, a slot the page does
//     not fill is hidden with its fallback; a bare tag shows every fallback;
//   - an element that holds slots, has no text of its own and whose slots
//     all show nothing is hidden too.
// Blank text is the loader's reading (`trim()`, so U+00A0 is blank here),
// not tree.ts's `meaningful`.

import type { RuleView } from "./tree";

/** An element, or text that is not just white space, as the site's loader reads it. */
export const isContent = <N>(node: N, view: RuleView<N>) => {
  const kind = view.kind(node);
  return kind === "element" || (kind === "text" && view.text(node).trim() !== "");
};

/** One instance of a component, as the empty-parts rule reads it. */
export interface EmptyPartsInstance<N> {
  /** The template is a section component's (one `<section>` and nothing else). */
  section: boolean;
  /** The instance holds an element or text (`isContent`), whatever slot it names. */
  hostHasContent: boolean;
  /** Whether the page fills `slot`: content assigned to it, its fallback not counted. Only the first slot of a name is ever assigned. */
  filled(slot: N): boolean;
}

/** The slots inside `node`, in tree order. */
function slotsIn<N>(node: N, view: RuleView<N>, out: N[] = []): N[] {
  for (const child of view.children(node)) {
    if (view.kind(child) !== "element") continue;
    if (view.name(child) === "slot") out.push(child);
    slotsIn(child, view, out);
  }
  return out;
}

/** An element's text outside its slots (a slot's fallback is the slot's). */
function ownText<N>(el: N, view: RuleView<N>): boolean {
  return view.children(el).some((node) => {
    const kind = view.kind(node);
    if (kind === "text") return view.text(node).trim() !== "";
    return kind === "element" && view.name(node) !== "slot" && ownText(node, view);
  });
}

/** The empty-parts rule for one instance: `empty(el)` for each element of its template. */
export function emptyParts<N>(view: RuleView<N>, instance: EmptyPartsInstance<N>) {
  /** A slot hidden with its fallback: unfilled in a section component the page fills. */
  const unmet = (slot: N) => instance.section && instance.hostHasContent && !instance.filled(slot);
  /** A slot that shows something: what the page gave it, else its fallback. */
  const showsSomething = (slot: N) =>
    instance.filled(slot) || (!unmet(slot) && view.children(slot).some((node) => isContent(node, view)));
  /** Whether a template element is an empty optional part, hidden on this instance. */
  const empty = (el: N): boolean => {
    const name = view.name(el);
    if (name === "style" || name === "link") return false;
    if (name === "slot") return unmet(el);
    const inner = slotsIn(el, view);
    return inner.length > 0 && !inner.some(showsSomething) && !ownText(el, view);
  };
  return { unmet, showsSomething, empty };
}
