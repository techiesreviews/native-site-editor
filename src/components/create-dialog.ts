import { button, node } from "../ui/dom";
import "./create-dialog.css";

export type CreateKind = "file" | "folder" | "page";

export interface CreateRequest {
  kind: CreateKind;
  /** The folder it is created in; "" is the repository root. */
  folder: string;
  /** The typed name or path; for a page, its URL. */
  name: string;
  /** A page's title; empty when none was given. */
  title: string;
}

/** What confirming would create, said in a sentence, or why it cannot. */
export type CreatePlan = { ok: true; summary: string } | { ok: false; error: string };

const LABELS: Record<CreateKind, { option: string; field: string; placeholder: string }> = {
  file: { option: "File", field: "File name", placeholder: "notes.md, or docs/notes.md" },
  folder: { option: "Folder", field: "Folder name", placeholder: "images, or media/images" },
  page: { option: "Page", field: "Page URL", placeholder: "/videos/intro/" },
};

/**
 * The modal that creates a file, folder or page. It lives inside the file
 * explorer's popover, so the explorer stays open behind it (as the Save
 * panel's comparison dialog does). The caller plans each request as it is
 * typed, which shows under the fields, and carries it out on confirm: Enter
 * confirms, Escape cancels, and focus returns to the button that opened it.
 */
export function createCreateDialog(options: {
  plan: (request: CreateRequest) => CreatePlan;
  /** Carries the request out; resolves to an error message, or nothing when done. */
  create: (request: CreateRequest) => Promise<string | undefined>;
  /** The page URL a folder's New page starts from. */
  routePrefix: (folder: string) => string;
}) {
  const dialog = node("dialog", "create-dialog");
  dialog.setAttribute("aria-labelledby", "create-dialog-title");
  const form = node("form", "create-dialog__form");
  const title = node("h2", "create-dialog__title");
  title.id = "create-dialog-title";
  const kinds = node("fieldset", "create-dialog__kinds");
  kinds.append(node("legend", "sr-only", "Create a"));
  const radios = new Map<CreateKind, HTMLInputElement>();
  for (const kind of ["file", "folder", "page"] as const) {
    const label = node("label", "create-dialog__kind");
    const radio = node("input");
    radio.type = "radio";
    radio.name = "create-kind";
    radio.value = kind;
    radio.addEventListener("change", () => { if (radio.checked) choose(kind); });
    radios.set(kind, radio);
    label.append(radio, node("span", "", LABELS[kind].option));
    kinds.append(label);
  }
  const nameLabel = node("label", "create-dialog__field");
  const nameText = node("span");
  const name = node("input");
  name.type = "text";
  name.autocomplete = "off";
  name.spellcheck = false;
  name.setAttribute("aria-describedby", "create-dialog-result");
  nameLabel.append(nameText, name);
  const titleLabel = node("label", "create-dialog__field");
  const pageTitle = node("input");
  pageTitle.type = "text";
  pageTitle.autocomplete = "off";
  titleLabel.append(node("span", "", "Title (optional)"), pageTitle);
  const result = node("p", "create-dialog__result");
  result.id = "create-dialog-result";
  result.setAttribute("aria-live", "polite");
  const cancel = button("Cancel", () => dialog.close(), "button secondary");
  const submit = node("button", "button primary", "Create");
  submit.type = "submit";
  const actions = node("div", "create-dialog__actions");
  actions.append(cancel, submit);
  form.append(title, kinds, nameLabel, titleLabel, result, actions);
  dialog.append(form);

  let folder = "";
  let kind: CreateKind = "file";
  let pending = false;
  let opener: HTMLElement | null = null;
  const request = (): CreateRequest => ({ kind, folder, name: name.value, title: kind === "page" ? pageTitle.value.trim() : "" });
  function choose(next: CreateKind) {
    kind = next;
    radios.get(next)!.checked = true;
    nameText.textContent = LABELS[next].field;
    name.placeholder = LABELS[next].placeholder;
    name.value = next === "page" ? options.routePrefix(folder) : "";
    titleLabel.hidden = next !== "page";
    pageTitle.value = "";
    refresh();
  }
  // An empty name says what to type rather than showing an error.
  function refresh(showError = false) {
    const plan = options.plan(request());
    const blank = !name.value.trim() || (kind === "page" && name.value.trim() === options.routePrefix(folder) && !showError);
    result.classList.toggle("is-error", !plan.ok && (showError || !blank));
    if (plan.ok) result.textContent = plan.summary;
    else result.textContent = blank && !showError ? `Enter a ${LABELS[kind].field.toLowerCase()}.` : plan.error;
    name.setAttribute("aria-invalid", String(!plan.ok && (showError || !blank)));
    return plan;
  }
  name.addEventListener("input", () => refresh());
  pageTitle.addEventListener("input", () => refresh());
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (pending) return;
    const plan = refresh(true);
    if (!plan.ok) { name.focus(); return; }
    pending = true;
    submit.disabled = true;
    try {
      const error = await options.create(request());
      if (error) {
        result.textContent = error;
        result.classList.add("is-error");
        name.focus();
      } else dialog.close();
    } finally {
      pending = false;
      submit.disabled = false;
    }
  });
  // Escape closes the dialog only; the explorer would otherwise close too.
  dialog.addEventListener("keydown", (event) => { if (event.key === "Escape") event.stopPropagation(); });
  dialog.addEventListener("close", () => {
    const target = opener;
    opener = null;
    if (target?.isConnected && !target.closest("[popover]:not(:popover-open)")) target.focus();
  });

  return {
    root: dialog,
    /** Opens on `in` with the kinds offered there, `first` chosen. */
    open(context: { in: string; kinds: CreateKind[]; first?: CreateKind; opener?: HTMLElement }) {
      folder = context.in;
      opener = context.opener ?? null;
      for (const [each, radio] of radios) radio.parentElement!.hidden = !context.kinds.includes(each);
      kinds.hidden = context.kinds.length < 2;
      const what = context.kinds.length === 1 ? LABELS[context.kinds[0]].option.toLowerCase()
        : context.kinds.includes("page") ? "file, folder or page" : "file or folder";
      title.textContent = `New ${what}${folder && context.kinds.length > 1 ? ` in ${folder}` : ""}`;
      choose(context.first && context.kinds.includes(context.first) ? context.first : context.kinds[0]);
      dialog.showModal();
      name.focus();
      name.setSelectionRange(name.value.length, name.value.length);
    },
    /** Where focus goes when the dialog closes, instead of the button that opened it. */
    returnFocusTo(target: HTMLElement) {
      opener = target;
    },
    close() {
      if (dialog.open) dialog.close();
    },
  };
}
