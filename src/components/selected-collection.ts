import { node } from "../ui/dom";
import { mountCollectionsPanel, type CollectionsDeps, type CollectionsPanel } from "./collections-panel";

export interface SelectedCollection { key: string; path: string; start: number }
export interface SelectedCollectionDeps extends CollectionsDeps {
  target(): SelectedCollection | undefined;
  prepare(target: SelectedCollection): Promise<void>;
  /** Recovery for listings whose cards were edited by hand; each action is one undo step. */
  generated?: {
    state(target: SelectedCollection): "clean" | "edited" | "unbuilt" | "unchecked" | undefined;
    keepManual(target: SelectedCollection): Promise<string | undefined>;
    rebuild(target: SelectedCollection): Promise<string | undefined>;
  };
}

/** Keeps the collection form alive through CSS rerenders and canvas repainting. */
export function mountSelectedCollection(host: HTMLElement, deps: SelectedCollectionDeps) {
  const details = node("details", "selected-collection");
  details.append(node("summary", "", "Collection"));
  const recovery = node("div", "selected-collection__recovery");
  const content = node("div");
  details.append(recovery, content); host.append(details);
  let recoveryKey: string | undefined, busy = false;
  function renderRecovery() {
    const target = deps.target();
    const state = target && deps.generated?.state(target);
    const key = `${target?.key ?? ""}:${state ?? ""}`;
    if (key === recoveryKey) return;
    recoveryKey = key;
    recovery.replaceChildren();
    if (!target || !state || !deps.generated) return;
    const generated = deps.generated;
    const act = (button: HTMLButtonElement, run: () => Promise<string | undefined>) => button.addEventListener("click", async () => {
      if (busy) return;
      busy = true;
      try {
        const error = await run();
        if (error) message.textContent = error;
      } finally { busy = false; recoveryKey = undefined; update(); }
    });
    const message = node("p", "selected-collection__note");
    message.textContent = state === "edited" ? "The cards here were edited by hand and no longer match the page data. Keep them as they are, or rebuild them from the pages."
      : state === "unbuilt" ? "These cards have not been built from page data yet."
      : state === "unchecked" ? "These cards cannot be checked against page data until the collection is fixed. Keep them as they are, or fix the collection in Code." : "";
    recovery.append(message);
    if (state !== "unbuilt") {
      const keep = node("button", "", "Use manual cards") as HTMLButtonElement;
      keep.type = "button";
      keep.title = "Keep these cards exactly as they are and stop making them from page data.";
      act(keep, () => generated.keepManual(target));
      recovery.append(keep);
    }
    if (state === "edited" || state === "unbuilt") {
      const label = state === "edited" ? "Rebuild cards from page data" : "Build cards from page data";
      const rebuild = node("button", "", label) as HTMLButtonElement;
      rebuild.type = "button";
      rebuild.title = state === "edited" ? "Replaces the hand edits in these cards with what the pages say." : "Makes the cards from the pages this collection lists.";
      act(rebuild, () => generated.rebuild(target));
      recovery.append(rebuild);
    }
  }
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
    renderRecovery();
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
