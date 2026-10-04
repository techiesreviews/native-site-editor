import { node, button } from "../ui/dom";
import "./master-banner.css";

// One compact line over the code while a saved section's master is open:
// "Editing Intro master · Done · Update copies". Typing in the master changes
// no page; Update copies is the only way copies change. No dialog.
export interface MasterBannerState { label: string; htmlPath: string; masterError?: string }

export function createMasterBanner(before: HTMLElement, actions: { done: () => void; update: () => void }) {
  const bar = node("div", "master-banner");
  bar.setAttribute("role", "region");
  bar.setAttribute("aria-label", "Saved section master");
  bar.hidden = true;
  const text = node("span", "master-banner__text");
  const problem = node("span", "master-banner__problem");
  problem.setAttribute("role", "status");
  const done = button("Done", actions.done, "master-banner__button");
  const update = button("Update copies", actions.update, "master-banner__button master-banner__button--primary");
  bar.append(text, problem, done, update);
  before.before(bar);
  return {
    element: bar,
    show(state: MasterBannerState | undefined) {
      bar.hidden = !state;
      if (!state) return;
      text.textContent = `Editing ${state.label} master`;
      text.title = `${state.htmlPath}. Pages change only with Update copies.`;
      problem.textContent = state.masterError ?? "";
      problem.hidden = !state.masterError;
      update.disabled = Boolean(state.masterError);
      update.title = state.masterError ? "Fix the master before updating copies." : "Update every copy on the site that you haven't changed";
    },
  };
}
