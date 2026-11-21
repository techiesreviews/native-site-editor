// The slim top bar over the login page, as in the approved sketch (TOOLS-188): the project menu's place, with no
// project yet, drawn with the project menu's own trigger, tile, panel and rows (repository-menu.css). The login page
// draws the bar empty and hidden from screen readers (setup-host.ts) and loads this file once the session is checked,
// so only a signed-out visitor fetches it and the editor's first load does not carry it.

import { icon, iconMarkup } from "../icons";
import { button, link, node } from "../ui/dom";
import "./welcome-bar.css";

/**
 * Fills `bar` with No projects yet (the project menu's trigger, which opens its panel as a popover). Its menu adds a
 * project the way the login card does (`way`); while the card has no way in, the button is disabled.
 */
export function fillWelcomeBar(bar: HTMLElement, way: string | undefined) {
  const trigger = button("", () => {}, "repository-menu__trigger repository-menu__trigger--slim");
  trigger.disabled = !way;
  trigger.innerHTML = `<span class="repository-menu__initial" aria-hidden="true">n</span><span class="repository-menu__name">No projects yet</span>${iconMarkup("caret-down", 12, "repository-menu__caret")}`;
  const panel = node("div", "dropdown-panel repository-menu__popover");
  panel.id = "welcome-projects";
  panel.popover = "auto";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Projects");
  panel.append(node("div", "repository-menu__heading", "Add project"));
  trigger.setAttribute("popovertarget", panel.id);
  if (way) {
    // Built as an element, so the address needs no escaping in markup.
    const onGitHub = link("On GitHub", way, "text-button repository-menu__action");
    onGitHub.prepend(icon("github-logo", 16, "icon--before"));
    panel.append(onGitHub);
  }
  bar.replaceChildren(trigger, panel);
  bar.removeAttribute("aria-hidden");
}
