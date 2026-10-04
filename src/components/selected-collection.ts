import { node } from "../ui/dom";
import { mountCollectionsPanel, type CollectionsDeps, type CollectionsPanel } from "./collections-panel";

export interface SelectedCollection { key: string; path: string; start: number }
export interface SelectedCollectionDeps extends CollectionsDeps {
  target(): SelectedCollection | undefined;
  prepare(target: SelectedCollection): Promise<void>;
}

/** Keeps the collection form alive through CSS rerenders and canvas repainting. */
export function mountSelectedCollection(host: HTMLElement, deps: SelectedCollectionDeps) {
  const details = node("details", "selected-collection");
  details.append(node("summary", "", "Collection"));
  const content = node("div");
  details.append(content); host.append(details);
  let panel: CollectionsPanel | undefined;
  let preparedKey: string | undefined;
  let loading = false, destroyed = false;
  async function load(target: SelectedCollection) {
    if (loading || destroyed || panel?.dirty()) return;
    loading = true;
    panel?.destroy(); panel = undefined; preparedKey = undefined;
    content.textContent = "Loading pages…";
    try {
      await deps.prepare(target);
      if (destroyed) return;
      if (deps.target()?.key !== target.key) throw new Error("The selection changed. Open this collection again.");
      content.replaceChildren();
      preparedKey = target.key;
      panel = mountCollectionsPanel(content, deps, { grid: () => deps.target() });
    } catch (error) {
      if (!destroyed) content.textContent = error instanceof Error ? error.message : "The collection could not be loaded.";
    } finally {
      loading = false;
      const next = deps.target();
      if (!destroyed && details.open && next && next.key !== target.key) void load(next);
    }
  }
  function update() {
    if (destroyed) return;
    const target = deps.target();
    host.hidden = !target && !panel?.dirty();
    panel?.update();
    if (target && details.open && !panel?.dirty() && target.key !== preparedKey) void load(target);
  }
  details.addEventListener("toggle", () => {
    const target = deps.target();
    if (details.open && target && (!panel || preparedKey !== target.key)) void load(target);
  });
  content.addEventListener("click", () => queueMicrotask(update));
  update();
  return { update, destroy() { destroyed = true; panel?.destroy(); details.remove(); } };
}
