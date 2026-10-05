import { node, button } from "../ui/dom";
import "../ui/inline-field.css";
import "./native-shared-authoring.css";

export interface NativeSharedMetadata { label: string; id: string; rootClass: string; stylesheetPath: string }
export interface NativeSharedAuthoringContext {
  /** Exact opaque selection/source context. Change this key whenever that context changes. */
  key: string;
  kind: "section" | "header" | "footer";
  availableClasses: readonly string[];
  availableStylesheetPaths: readonly string[];
  initialName: string;
  proposedId: string;
  /** Host-prefiltered compatible records; the leaf never discovers or infers links. */
  savedRecords?: readonly { id: string; label: string }[];
}
export type NativeSharedSubmitResult = { success: true } | { error: string };
export interface NativeSharedAuthoringActions {
  /** Host checks the key again before any write; this form never writes sources. */
  submit(metadata: NativeSharedMetadata, contextKey: string): Promise<NativeSharedSubmitResult>;
  /** Host validates the offered record and live source/graph/key before writing. */
  link?(recordId: string, contextKey: string): Promise<NativeSharedSubmitResult>;
  close(contextKey: string, reason: "cancel" | "saved"): void;
}
const safeId = /^[a-z][a-z0-9_-]*$/;
const reserved = new Set(["__proto__", "prototype", "constructor"]);

/** An inline metadata form for one exact whole section/header/footer selection. */
export function createNativeSharedAuthoring(actions: NativeSharedAuthoringActions) {
  const form = node("form", "native-shared-authoring");
  form.hidden = true;
  form.noValidate = true;
  const heading = node("span", "native-shared-authoring__heading");
  const recordRow = node("label", "native-shared-authoring__row");
  recordRow.hidden = true;
  const fields = node("div", "native-shared-authoring__fields");
  const error = node("span", "native-shared-authoring__error");
  error.setAttribute("role", "status");
  error.setAttribute("aria-live", "polite");
  const sourcePath = node("code", "native-shared-authoring__source");
  sourcePath.setAttribute("aria-label", "Master source path");
  const controls = node("div", "native-shared-authoring__actions");
  const save = node("button", "native-shared-authoring__save", "Save shared");
  save.type = "submit";
  const cancel = button("Cancel", () => close("cancel"), "native-shared-authoring__cancel");
  controls.append(save, cancel);
  form.append(heading, recordRow, fields, sourcePath, error, controls);
  let context: NativeSharedAuthoringContext | undefined;
  let epoch = 0;
  let pending = false;
  let destroyed = false;
  let recordChoice: HTMLSelectElement | undefined;
  let recordId = "";
  let inputs: Partial<Record<keyof NativeSharedMetadata, HTMLInputElement | HTMLSelectElement>> = {};

  function close(reason: "cancel" | "saved") {
    const key = context?.key;
    if (key === undefined) return;
    context = undefined;
    epoch++;
    pending = false;
    form.hidden = true;
    actions.close(key, reason);
  }
  function field(label: string, name: keyof NativeSharedMetadata, value: string, choices?: readonly string[]) {
    const row = node("label", "native-shared-authoring__row");
    row.append(node("span", "native-shared-authoring__label", label));
    const input = choices && choices.length > 1 ? node("select", "native-shared-authoring__choice") : node("input", "inline-field");
    input.name = name;
    input.setAttribute("aria-label", label);
    if (input instanceof HTMLSelectElement) {
      for (const choice of choices!) { const option = node("option", "", choice); option.value = choice; input.append(option); }
    } else {
      input.type = "text";
      input.autocomplete = "off";
      input.readOnly = choices !== undefined;
    }
    input.value = value;
    row.append(input);
    fields.append(row);
    inputs[name] = input;
  }
  function showSourcePath() {
    sourcePath.textContent = `.editor/${context?.kind === "section" ? "sections" : "page-parts"}/${inputs.id?.value.trim() ?? ""}.html`;
  }
  form.addEventListener("input", showSourcePath);
  function busy(value: boolean) {
    pending = value;
    form.setAttribute("aria-busy", String(value));
    save.disabled = value;
    save.textContent = recordId ? value ? "Using…" : "Use here" : value ? "Saving…" : "Save shared";
    if (recordChoice) recordChoice.disabled = value;
    for (const input of Object.values(inputs)) input.disabled = value;
  }
  function reject(message: string, name?: keyof NativeSharedMetadata) {
    error.textContent = message;
    if (name) { inputs[name]?.setAttribute("aria-invalid", "true"); inputs[name]?.focus(); }
  }
  form.addEventListener("keydown", event => {
    if (event.key === "Escape") { event.preventDefault(); close("cancel"); }
    // Choosing a native select option must never submit the form.
    if (event.key === "Enter" && event.target instanceof HTMLSelectElement) event.preventDefault();
  });
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const active = context;
    if (!active || pending || destroyed) return;
    const started = epoch;
    error.textContent = "";
    for (const input of Object.values(inputs)) input.removeAttribute("aria-invalid");
    if (recordId) {
      if (!actions.link || !active.savedRecords?.some(record => record.id === recordId)) { reject("Choose a shared item offered for this selection."); return; }
      const chosen = recordId;
      busy(true);
      try {
        const result = await actions.link(chosen, active.key);
        if (context?.key !== active.key || epoch !== started) return;
        if ("error" in result) { busy(false); reject(result.error); }
        else close("saved");
      } catch (cause) {
        if (context?.key !== active.key || epoch !== started) return;
        busy(false); reject(cause instanceof Error ? cause.message : "Could not use this shared item. Try again.");
      }
      return;
    }
    const metadata = Object.fromEntries(Object.entries(inputs).map(([key, input]) => [key, input.value.trim()])) as unknown as NativeSharedMetadata;
    if (!metadata.label) { reject("Give this shared item a name.", "label"); return; }
    if (!safeId.test(metadata.id) || reserved.has(metadata.id)) { reject("Use an ID starting with a lowercase letter, then letters, digits, - or _.", "id"); return; }
    if (!safeId.test(metadata.rootClass) || !active.availableClasses.includes(metadata.rootClass)) { reject("Choose a class already on this element.", "rootClass"); return; }
    if (!/^(?:[A-Za-z0-9][A-Za-z0-9_.-]*\/)*[A-Za-z0-9][A-Za-z0-9_.-]*\.css$/.test(metadata.stylesheetPath) || !active.availableStylesheetPaths.includes(metadata.stylesheetPath)) { reject("Choose an existing stylesheet this page uses.", "stylesheetPath"); return; }
    busy(true);
    try {
      const result = await actions.submit(metadata, active.key);
      if (context?.key !== active.key || epoch !== started) return;
      if ("error" in result) { busy(false); reject(result.error); }
      else close("saved");
    } catch (cause) {
      if (context?.key !== active.key || epoch !== started) return;
      busy(false);
      reject(cause instanceof Error ? cause.message : "Could not save. Try again.");
    }
  });
  return {
    element: form,
    /** A new key discards old fields and detaches pending results; the same key preserves typing. */
    show(next: NativeSharedAuthoringContext | undefined) {
      if (destroyed || context?.key === next?.key) return;
      epoch++;
      context = next && { ...next, availableClasses: [...new Set(next.availableClasses)], availableStylesheetPaths: [...new Set(next.availableStylesheetPaths)], savedRecords: next.savedRecords?.map(record => ({ ...record })) };
      pending = false;
      form.hidden = !context;
      if (!context) return;
      recordId = "";
      recordChoice = undefined;
      recordRow.replaceChildren();
      recordRow.hidden = true;
      fields.hidden = false;
      sourcePath.hidden = false;
      if (actions.link && context.savedRecords?.length) {
        const active = context, shown = epoch;
        recordChoice = node("select", "native-shared-authoring__choice");
        recordChoice.setAttribute("aria-label", "Shared item");
        const create = node("option", "", `New shared ${context.kind}`);
        create.value = ""; recordChoice.append(create);
        for (const record of context.savedRecords) {
          const option = node("option", "", `Use ${record.label} here`);
          option.value = record.id; recordChoice.append(option);
        }
        const choice = recordChoice;
        choice.addEventListener("change", () => {
          if (context !== active || epoch !== shown || pending) return;
          recordId = choice.value;
          fields.hidden = Boolean(recordId);
          sourcePath.hidden = Boolean(recordId);
          error.textContent = "";
          busy(false);
        });
        recordRow.append(node("span", "native-shared-authoring__label", "Shared item"), choice);
        recordRow.hidden = false;
      }
      fields.replaceChildren();
      inputs = {};
      error.textContent = "";
      heading.textContent = `Share ${context.kind}`;
      form.setAttribute("aria-label", `Share ${context.kind}`);
      field("Name", "label", context.initialName);
      field("ID", "id", context.proposedId);
      field("Class", "rootClass", context.availableClasses[0] ?? "", context.availableClasses);
      field("Stylesheet", "stylesheetPath", context.availableStylesheetPaths[0] ?? "", context.availableStylesheetPaths);
      showSourcePath();
      busy(false);
    },
    focus() { if (recordId) recordChoice?.focus(); else inputs.label?.focus(); },
    destroy() { destroyed = true; epoch++; context = undefined; form.remove(); },
  };
}
