import "./block-rail.css";
import { nativeElementChoices, type NativeElementKind } from "../page-builder/native-elements";
import { elementIcon } from "./element-icons";

/** Boot controls; the Add toggle owns whether a native visual preview is open. */
export function mountBlockRail(workspace: HTMLElement, addButton: HTMLButtonElement, options: {
  onPick?: (kind: NativeElementKind) => void;
} = {}) {
  const rail = document.createElement("nav");
  rail.className = "block-rail";
  rail.setAttribute("aria-label", "Blocks");
  const tip = document.createElement("div");
  tip.className = "block-rail__tip";
  tip.setAttribute("aria-hidden", "true");
  const hideTip = () => { tip.hidden = true; };
  hideTip();
  const buttons: HTMLButtonElement[] = [];
  const tags: Partial<Record<NativeElementKind, string>> = { heading: "h2", paragraph: "p", image: "img" };
  for (const choice of nativeElementChoices) {
    const kind = choice.tag.slice(7) as NativeElementKind;
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.block = kind;
    button.setAttribute("aria-label", choice.label);
    button.append(elementIcon(tags[kind] ?? kind, 20));
    const showTip = () => {
      const rect = button.getBoundingClientRect();
      tip.textContent = choice.label;
      tip.style.left = `${rect.right + 8}px`;
      tip.style.top = `${rect.top + rect.height / 2}px`;
      tip.hidden = false;
    };
    button.addEventListener("pointerenter", showTip);
    button.addEventListener("pointerleave", hideTip);
    button.addEventListener("focus", () => { if (button.matches(":focus-visible")) showTip(); });
    button.addEventListener("blur", hideTip);
    button.addEventListener("pointerdown", hideTip);
    button.addEventListener("click", () => { hideTip(); options.onPick?.(kind); });
    // Like the edit bar, controls stay in tab order; arrows also move focus.
    button.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      buttons[(buttons.indexOf(button) + step + buttons.length) % buttons.length].focus();
    });
    buttons.push(button);
    rail.append(button);
  }
  const sync = () => {
    rail.hidden = addButton.hidden;
    workspace.classList.toggle("workspace--blocks", !rail.hidden);
    if (rail.hidden) hideTip();
  };
  sync();
  workspace.prepend(rail);
  document.body.append(tip);
  const observer = new MutationObserver(sync);
  observer.observe(addButton, { attributes: true, attributeFilter: ["hidden"] });
  return {
    dispose() {
      observer.disconnect();
      rail.remove();
      tip.remove();
      workspace.classList.remove("workspace--blocks");
    },
  };
}
