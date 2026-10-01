import { button, node } from "../ui/dom";
import { HOSTS, parseSiteAddress } from "../setup-checklist";

// Put it online, the body of the checklist's item of that name: the site
// can be hosted anywhere that serves files as they are, the usual hosts in
// one line each (docs/hosting.md), and a field for the address once it is
// live. The address goes to `.editor/config.json` as a draft through
// `save`, which resolves to a problem to show, or nothing. A later publish
// integration replaces this component's body, not its place.

export function createPutOnline(options: {
  save: (url: string) => Promise<string | undefined>;
}) {
  let shownScope: string | undefined;
  const root = node("div", "put-online");
  const intro = node(
    "p",
    "put-online__text",
    "Your site is plain files, so any host that serves files as they are can show it. No build step is needed.",
  );
  const list = node("ul", "put-online__hosts");
  for (const host of HOSTS) {
    const item = node("li");
    item.append(node("strong", "", `${host.name}. `), host.how);
    list.append(item);
  }
  const form = node("form", "put-online__form");
  const label = node("label", "onboard-field");
  const input = node("input", "onboard-input");
  input.name = "site-address";
  input.type = "text";
  input.inputMode = "url";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.placeholder = "https://my-site.pages.dev";
  label.append(node("span", "onboard-field__label", "Address once it is live"), input);
  const message = node("p", "put-online__message");
  message.setAttribute("role", "status");
  const submit = button("Add the address", () => {}, "button primary");
  submit.type = "submit";
  form.append(label, submit);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const parsed = parseSiteAddress(input.value);
    if ("error" in parsed) {
      message.textContent = parsed.error;
      message.classList.add("is-error");
      input.focus();
      return;
    }
    submit.disabled = true;
    message.classList.remove("is-error");
    message.textContent = "Adding the address…";
    try {
      const problem = await options.save(parsed.url);
      message.classList.toggle("is-error", Boolean(problem));
      message.textContent = problem ?? "Address added as a draft. Save to GitHub keeps it.";
    } finally {
      submit.disabled = false;
    }
  });
  root.append(intro, list, form, message);
  return {
    root,
    /**
     * Shows the address the site has now. A different `scope` (account,
     * repository and branch) starts the form afresh; within one scope what
     * the user typed stays.
     */
    setUrl(url: string | undefined, scope: string) {
      if (scope !== shownScope) {
        shownScope = scope;
        input.value = url ?? "";
        message.textContent = "";
        message.classList.remove("is-error");
      } else if (url && !input.value && document.activeElement !== input) input.value = url;
    },
    focus() {
      input.focus();
    },
  };
}
