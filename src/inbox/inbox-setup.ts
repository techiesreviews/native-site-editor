// Setup in the Inbox (TOOLS-188, sketch tools-188): a site the setup wizard or Start your site made lists Name your
// site and Connect an agent (optional) at the top of the Inbox until each is done (src/setup-checklist.ts). Name your
// site opens its form in the row; Connect an agent opens the project menu with Connect to MCP lit. Each control shows
// its own state: the row says whether its form is open, Save name says it is saving, a refused name says why under it.
import { icon } from "../icons";
import { button, node } from "../ui/dom";
import type { SetupRow } from "../setup-checklist";
import type { InboxPorts } from "./inbox-host";

export function createInboxSetup(setup: InboxPorts["setup"], panel: { hide(): void; redraw(): void; error(error: unknown): void }) {
  // The name form: open or not, what was typed (kept across redraws), saving, and why a save was refused.
  let open = false, saving = false, typed: string | undefined, refused: string | undefined;

  function nameForm() {
    const form = node("form", "inbox__form");
    form.noValidate = true;
    const label = node("label", "", "Site name"), input = node("input", "inline-field inbox__field");
    input.id = "inbox-site-name";
    label.htmlFor = input.id;
    input.autocomplete = "off";
    input.dataset.act = "name";
    input.value = typed ?? setup.siteName() ?? "";
    if (refused) input.setAttribute("aria-invalid", "true");
    input.addEventListener("input", () => { typed = input.value; input.removeAttribute("aria-invalid"); });
    const save = node("button", "button primary inbox__act", saving ? "Saving…" : "Save name");
    save.type = "submit";
    save.dataset.act = "save";
    if (saving) { save.setAttribute("aria-disabled", "true"); save.setAttribute("aria-busy", "true"); }
    form.addEventListener("submit", event => {
      event.preventDefault();
      if (saving) return;
      const name = input.value.trim();
      if (!name) { refused = "Enter a name for the site."; panel.redraw(); return; }
      saving = true;
      refused = undefined;
      panel.redraw();
      void setup.saveName(name).then(problem => {
        saving = false;
        refused = problem;
        // Saved: the row goes with the next refresh of setup; the form closes with it.
        if (!problem) { open = false; typed = undefined; }
        panel.redraw();
      }, error => { saving = false; panel.redraw(); panel.error(error); });
    });
    const field = node("div", "inbox__name");
    field.append(label, input);
    form.append(field, save);
    if (refused) form.append(node("small", "inbox__refused", refused));
    return form;
  }

  const rows: Record<SetupRow, () => HTMLLIElement> = {
    name() {
      const row = node("li", "inbox__row");
      const spot = button("", () => {
        open = !open;
        refused = undefined;
        panel.redraw();
        if (open) document.querySelector<HTMLInputElement>("#inbox-site-name")?.select();
      }, "button secondary inbox__item");
      spot.dataset.act = "go";
      spot.setAttribute("aria-expanded", String(open));
      spot.append(icon("list-checks", 16), node("b", "", "Name your site"), node("small", "", "Setup"));
      row.append(spot);
      if (open) row.append(nameForm());
      return row;
    },
    agent() {
      const row = node("li", "inbox__row");
      const spot = button("", () => { panel.hide(); open = false; void setup.connectAgent().catch((error: unknown) => panel.error(error)); }, "button secondary inbox__item");
      spot.dataset.act = "go";
      spot.append(icon("sparkle", 16), node("b", "", "Connect an agent"), node("small", "", "Setup · Optional"));
      row.append(spot);
      return row;
    },
  };

  return {
    /** The setup rows still open, first in the Inbox's list. */
    rows(): HTMLLIElement[] {
      return setup.items.value.map(id => {
        const row = rows[id]();
        row.dataset.key = `setup:${id}`;
        row.dataset.kind = "setup";
        return row;
      });
    },
    /** Their part of what the Inbox shows, so it redraws when they change. */
    keys: () => setup.items.value.map(id => `setup:${id}`).join("\n"),
  };
}
