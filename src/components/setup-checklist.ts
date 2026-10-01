import { button, node } from "../ui/dom";
import { icon } from "../icons";
import type { SetupItemId, SetupProgress } from "../setup-checklist";
import "./dropdown.css";
import "./onboarding.css";
import "./setup-checklist.css";

// Set up your site: a small "Setup 2/3" pill in the top bar that opens a
// short checklist in a popover under it (not a modal; Escape or a click
// elsewhere closes it, and it never covers the preview's edit bar or the
// Publish button's own panel, which replace it when opened). Each item has a
// title, one line, an action and a done state, ticked from real state by
// `update` (src/setup-checklist.ts). Name your site opens
// its form under the item. The × dismisses the checklist for the
// repository; it hides itself after showing "Your site is set up".

export interface SetupActions {
  /** Start your site: bring the starting points forward. */
  start: () => void;
  /** Opens Save to GitHub. */
  save: () => void;
  /** Writes the site name to the settings as a draft; resolves to a problem. */
  saveName: (name: string) => Promise<string | undefined>;
  /** Opens the agent menu's connect flow. */
  connect: () => void;
  dismiss: () => void;
}

const ITEMS: { id: SetupItemId; title: string; text: string; action?: string; optional?: boolean }[] = [
  { id: "start", title: "Start your site", text: "Add a first page from the Starter site or a blank page.", action: "Choose a start" },
  { id: "save", title: "Save to GitHub", text: "Keep your first version in the repository.", action: "Open Save" },
  { id: "name", title: "Name your site", text: "The name the editor uses for your site and its page details.", action: "Name it" },
  { id: "agent", title: "Connect an agent", text: "Let Claude, Codex or another agent work on the site as drafts.", action: "Connect", optional: true },
];

export interface SetupView {
  progress: SetupProgress;
  /** The site name the settings have now, for the form. */
  siteName?: string;
  /** The site's default name, offered when it has none. */
  defaultName: string;
  visible: boolean;
  /** Account, repository and branch the view is of: a different one resets the forms. */
  scope: string;
}

export function createSetupChecklist(actions: SetupActions) {
  const root = node("div", "setup-checklist");
  root.hidden = true;
  const pill = button("", () => toggle(), "setup-pill");
  pill.setAttribute("aria-haspopup", "dialog");
  pill.setAttribute("aria-expanded", "false");
  pill.setAttribute("aria-controls", "setup-checklist-panel");
  pill.style.setProperty("anchor-name", "--setup-pill");
  const pillIcon = icon("list-checks", 14);
  const pillLabel = node("span", "setup-pill__label");
  pill.append(pillIcon, pillLabel);

  const panel = node("section", "setup-panel dropdown-panel");
  panel.id = "setup-checklist-panel";
  panel.popover = "auto";
  panel.setAttribute("aria-labelledby", "setup-checklist-title");
  panel.style.setProperty("position-anchor", "--setup-pill");
  const head = node("div", "setup-panel__head");
  const title = node("h2", "setup-panel__title", "Set up your site");
  title.id = "setup-checklist-title";
  const dismiss = button("", () => {
    close();
    actions.dismiss();
  }, "setup-panel__dismiss");
  dismiss.setAttribute("aria-label", "Dismiss the checklist");
  dismiss.title = "Dismiss the checklist for this repository";
  dismiss.append(icon("x", 14));
  head.append(title, dismiss);
  const summary = node("p", "setup-panel__summary");
  const bar = node("div", "setup-panel__bar");
  bar.setAttribute("aria-hidden", "true");
  const barFill = node("span", "setup-panel__bar-fill");
  bar.append(barFill);
  const doneState = node("p", "setup-panel__complete");
  doneState.setAttribute("role", "status");
  doneState.hidden = true;
  doneState.append(icon("check", 14), node("span", "", "Your site is set up"));
  const list = node("ol", "setup-list");
  panel.append(head, summary, bar, doneState, list);
  root.append(pill, panel);

  const rows = new Map<SetupItemId, { row: HTMLElement; mark: HTMLElement; title: HTMLElement; action?: HTMLButtonElement; detail?: HTMLElement }>();

  // Name your site: a field under the item.
  let shownScope: string | undefined;
  let nameDirty = false;
  const nameForm = node("form", "setup-form");
  const nameLabel = node("label", "onboard-field");
  const nameInput = node("input", "onboard-input");
  nameInput.name = "site-name";
  nameInput.autocomplete = "off";
  nameInput.maxLength = 120;
  nameLabel.append(node("span", "onboard-field__label", "Site name"), nameInput);
  const nameSubmit = button("Save name", () => {}, "button primary");
  nameSubmit.type = "submit";
  const nameMessage = node("p", "setup-form__message");
  nameMessage.setAttribute("role", "status");
  nameForm.append(nameLabel, nameSubmit);
  nameForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = nameInput.value.trim();
    if (!name) {
      nameMessage.textContent = "Enter a name for your site.";
      nameMessage.classList.add("is-error");
      nameInput.focus();
      return;
    }
    nameSubmit.disabled = true;
    nameMessage.classList.remove("is-error");
    nameMessage.textContent = "Saving the name…";
    try {
      const problem = await actions.saveName(name);
      nameMessage.classList.toggle("is-error", Boolean(problem));
      if (!problem) nameDirty = false;
      nameMessage.textContent = problem ?? "Name added as a draft. Save to GitHub keeps it.";
    } finally {
      nameSubmit.disabled = false;
    }
  });
  nameInput.addEventListener("input", () => { nameDirty = true; });
  const nameDetail = node("div", "setup-detail");
  nameDetail.hidden = true;
  nameDetail.append(nameForm, nameMessage);

  const details: Partial<Record<SetupItemId, HTMLElement>> = { name: nameDetail };
  const focusOf: Partial<Record<SetupItemId, () => void>> = { name: () => nameInput.focus() };

  function toggleDetail(id: SetupItemId) {
    const detail = details[id];
    if (!detail) return;
    const open = detail.hidden;
    for (const other of Object.values(details)) other.hidden = true;
    detail.hidden = !open;
    for (const [key, entry] of rows) entry.action?.setAttribute("aria-expanded", String(key === id && open));
    if (open) focusOf[id]?.();
  }

  for (const item of ITEMS) {
    const row = node("li", "setup-item");
    row.dataset.item = item.id;
    const mark = node("span", "setup-item__mark");
    mark.setAttribute("aria-hidden", "true");
    const body = node("div", "setup-item__body");
    const itemTitle = node("span", "setup-item__title", item.title);
    if (item.optional) itemTitle.append(node("span", "setup-item__optional", "Optional"));
    const state = node("span", "sr-only");
    itemTitle.append(state);
    body.append(itemTitle, node("span", "setup-item__text", item.text));
    const run =
      item.id === "start" ? () => { close(); actions.start(); }
      : item.id === "save" ? () => { close(); actions.save(); }
      : item.id === "agent" ? () => { close(); actions.connect(); }
      : () => toggleDetail(item.id);
    const action = button(item.action ?? "", run, "button secondary setup-item__action");
    if (details[item.id]) action.setAttribute("aria-expanded", "false");
    action.setAttribute("aria-label", `${item.action}: ${item.title}`);
    row.append(mark, body, action);
    const detail = details[item.id];
    if (detail) row.append(detail);
    list.append(row);
    rows.set(item.id, { row, mark, title: itemTitle, action, detail });
  }

  function toggle() {
    if (panel.matches(":popover-open")) close();
    else open();
  }
  function open() {
    if (root.hidden || panel.matches(":popover-open")) return;
    if (!CSS.supports("position-area: bottom")) {
      const rect = pill.getBoundingClientRect();
      panel.style.left = `${Math.max(12, Math.min(rect.right - 360, innerWidth - 372))}px`;
      panel.style.top = `${rect.bottom + 6}px`;
    }
    panel.showPopover();
    const first = list.querySelector<HTMLElement>(".setup-item:not(.is-done) .setup-item__action");
    (first ?? dismiss).focus();
  }
  function close() {
    if (panel.matches(":popover-open")) panel.hidePopover();
  }
  panel.addEventListener("toggle", () => {
    const shown = panel.matches(":popover-open");
    pill.setAttribute("aria-expanded", String(shown));
    if (!shown) {
      for (const detail of Object.values(details)) detail.hidden = true;
      for (const entry of rows.values()) entry.action?.setAttribute("aria-expanded", "false");
    }
  });
  panel.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && panel.matches(":popover-open")) {
      event.preventDefault();
      close();
      pill.focus();
    }
  });

  // The menu item that asks for the checklist on any repository.
  let onRequest: () => void = () => {};
  const menuItem = button("Set up your site", () => onRequest(), "text-button repository-menu__action setup-menu-item");
  menuItem.title = "Show the checklist for getting this site started, saved and named";

  function update(view: SetupView) {
    const { progress } = view;
    const shown = view.visible;
    if (!shown) close();
    root.hidden = !shown;
    root.dataset.complete = String(progress.complete);
    pillLabel.textContent = progress.complete ? "Set up" : `Setup ${progress.doneCount}/${progress.total}`;
    pill.title = progress.complete ? "Your site is set up" : `Set up your site: ${progress.doneCount} of ${progress.total} steps done`;
    pill.setAttribute("aria-label", progress.complete ? "Set up your site, done" : `Set up your site, ${progress.doneCount} of ${progress.total} done`);
    summary.textContent = progress.complete ? "" : `${progress.doneCount} of ${progress.total} done`;
    summary.hidden = progress.complete;
    barFill.style.inlineSize = `${(progress.doneCount / progress.total) * 100}%`;
    doneState.hidden = !progress.complete;
    for (const item of ITEMS) {
      const entry = rows.get(item.id)!;
      const done = progress.done[item.id];
      entry.row.classList.toggle("is-done", done);
      entry.mark.replaceChildren(...(done ? [icon("check", 12)] : []));
      entry.title.querySelector(".sr-only")!.textContent = done ? ", done" : "";
      if (entry.action) entry.action.hidden = done;
      if (done && entry.detail) entry.detail.hidden = true;
    }
    if (view.scope !== shownScope) {
      shownScope = view.scope;
      nameDirty = false;
      nameInput.value = view.siteName ?? view.defaultName;
      nameMessage.textContent = "";
      nameMessage.classList.remove("is-error");
    } else if (document.activeElement !== nameInput && !nameDirty) nameInput.value = view.siteName ?? view.defaultName;
  }

  return {
    root,
    menuItem,
    update,
    open,
    close,
    /** Asks for the checklist (the project menu's item): the host shows it, then it opens. */
    onRequest(handler: () => void) {
      onRequest = handler;
    },
    isOpen: () => panel.matches(":popover-open"),
  };
}
