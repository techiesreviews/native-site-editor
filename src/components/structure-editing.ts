import { button, node } from "../ui/dom";
import { handleChunkLoadFailure } from "../chunk-recovery";
import type { NativeStructure } from "./native-preview";
import type { ComponentFieldSession, ComponentSlotEditSession, ComponentSlotPart, ComponentStructureModel } from "../page-builder/components";
import type { FieldSuggestion, FieldSuggestions } from "./field-suggestions";
import type { mark } from "../page-builder/component-icon";
import "./structure-editing.css";

// Editing in the Page Structure tree, loaded the first time it is needed (a
// row's text edited in place, its card, an instance's Attributes): none of it
// is in the first paint.
//
// A row edit is one session (ComponentSlotEditSession) for the row's text and
// its card's fields together: one undo step, kept by Done, Enter or a click
// outside the editing block (or another row, or another page), taken back
// whole by Escape anywhere in the block. Moving between its fields, or the
// window losing focus, does not end it. Typed text shows in the page at once
// (a patch) and is written once typing pauses; a source that moves on without
// the session (Undo, another edit) ends it, said so.

type FieldControl = HTMLInputElement | HTMLTextAreaElement;
type Slot = ComponentStructureModel["slots"][number];
export type FocusRequest = { prefix: string; row: string | undefined; caret?: number };

export interface StructureEditingHost {
  tree: HTMLElement;
  componentSlots: (path: string, node: readonly number[]) => ComponentStructureModel | undefined;
  announce: (text: string) => void;
  pageSource: (path: string) => string | undefined;
  /** The page on show. */
  path: () => string | undefined;
  rowElement: (id: string) => HTMLElement | undefined;
  /** The tree is being redrawn: fields moved by it are not leaving. */
  rendering: () => boolean;
  iconAction: (label: string, icon: Parameters<typeof mark>[0], action: () => void) => HTMLButtonElement;
  isolate: (control: Element) => void;
  /** A row edit ended: the host forgets it and redraws (with `focus`, the row takes focus). */
  ended: (owner: string, focus: boolean) => void;
  fieldPrefix: (model: ComponentStructureModel, name: string) => string;
}

// How long typing pauses before patched text is written to the source (and the page fully drawn).
const WRITE_PAUSE = 150;
const fieldSizing = typeof CSS !== "undefined" && CSS.supports("field-sizing", "content");
const oneLine = (text: string) => text.replace(/\r\n|[\r\n]/g, " ");
const lineBreaks = (text: string) => text.replace(/\r\n?/g, "\n");
// Only without field-sizing: as tall as the text, borders included (max-height still caps it).
function fitHeight(area: HTMLTextAreaElement) {
  area.style.height = "auto";
  area.style.height = `${area.scrollHeight + area.offsetHeight - area.clientHeight}px`;
}
// The structure without its text: equal shapes differ only in what is typed.
const shape = (value: NativeStructure) => JSON.stringify(value.items, (name, item) => name === "text" || name === "heading" ? undefined : item);

export function createStructureEditing(host: StructureEditingHost) {
  const { tree } = host;
  const fieldInputs = new Map<string, FieldControl>();
  const fieldClosers = new Map<FieldControl, () => void>();
  const uploadClosers = new Map<HTMLInputElement, () => void>();
  const attributeForms = new Map<string, HTMLFormElement>();
  const formClosers = new Map<HTMLFormElement, () => void>();

  // ---- Suggestion lists (a URL's pages, an image's files), anchored to their fields. ----
  const suggestionLists = new Map<HTMLInputElement, FieldSuggestions>();
  let suggestionsModule: Promise<typeof import("./field-suggestions")> | undefined;
  // After a failed load (said once), it is tried again with the next row edit, not on every render.
  let suggestionsFailed = false;
  function suggest(input: HTMLInputElement, entries: readonly FieldSuggestion[], label: string) {
    if (suggestionsFailed) return;
    suggestionsModule ??= import("./field-suggestions").catch((error) => { suggestionsModule = undefined; suggestionsFailed = true; void handleChunkLoadFailure(error); throw error; });
    void suggestionsModule.then(({ attachFieldSuggestions }) => {
      if (input.isConnected) suggestionLists.set(input, attachFieldSuggestions(input, entries, label));
    }, () => undefined);
  }

  // ---- The row edit on show: one session for the row's text and its card. ----
  interface Mode {
    owner: string;
    path: string;
    hostNode: readonly number[];
    name: string;
    label: string;
    breaks: boolean;
    // Its fields' ids start with this (a focus request names it).
    prefix: string;
    session?: ComponentSlotEditSession;
    fields: Map<ComponentSlotPart, FieldControl>;
    pending: Map<ComponentSlotPart, ReturnType<typeof setTimeout>>;
    // The source the session's own writes made: its paint is held back while typing goes on.
    ownSource?: string;
    parts: HTMLElement[];
  }
  let mode: Mode | undefined;
  let typingHeld = false;

  function startMode(model: ComponentStructureModel, slot: Slot, owner: string) {
    if (mode?.owner === owner && mode.name === slot.name && mode.path === model.host.path) return mode;
    if (mode) finish("commit", false, true);
    suggestionsFailed = false;
    mode = { owner, path: model.host.path, hostNode: [...model.host.node], name: slot.name, label: slot.label, breaks: Boolean(slot.value.breaks),
      prefix: host.fieldPrefix(model, slot.name), fields: new Map(), pending: new Map(), parts: [] };
    return mode;
  }
  // The session opens with the first change (so an upload in between, its own step, starts a new one).
  function session(current: Mode) {
    current.session ??= host.componentSlots(current.path, current.hostNode)?.openSlotEdit(current.name);
    return current.session;
  }
  function writeNow(current: Mode, part: ComponentSlotPart) {
    clearTimeout(current.pending.get(part)); current.pending.delete(part);
    const field = current.fields.get(part);
    if (!field || mode !== current) return;
    const edit = session(current);
    const ok = edit?.write(part, field.value) ?? false;
    if (ok) field.removeAttribute("aria-invalid"); else field.setAttribute("aria-invalid", "true");
    if (ok) current.ownSource = host.pageSource(current.path);
  }
  function flush(current: Mode) {
    for (const part of [...current.pending.keys()]) writeNow(current, part);
  }
  // What a field's typing does: shows in the page at once where it can (the
  // row's text), and writes once typing pauses; elsewhere it writes at once.
  function change(current: Mode, part: ComponentSlotPart) {
    const field = current.fields.get(part);
    if (!field) return;
    const edit = session(current);
    if (!edit) { field.setAttribute("aria-invalid", "true"); return; }
    if (part === "text" && edit.patchable && edit.patch(field.value, () => writeNow(current, part))) {
      clearTimeout(current.pending.get(part));
      current.pending.set(part, setTimeout(() => writeNow(current, part), WRITE_PAUSE));
    } else writeNow(current, part);
  }

  /**
   * Ends the row edit: "commit" keeps what was typed (one undo step),
   * "cancel" takes all of it back, "stale" ends it because the source moved on
   * without it (said so). With `focus`, the row takes focus again.
   */
  function finish(how: "commit" | "cancel" | "stale", focus: boolean, quiet = false) {
    const current = mode;
    if (!current) return;
    if (how === "commit") flush(current);
    for (const timer of current.pending.values()) clearTimeout(timer);
    current.pending.clear();
    mode = undefined;
    typingHeld = false;
    if (how === "cancel") current.session?.cancel();
    else current.session?.close();
    if (how === "stale") host.announce(`Editing ${current.label} ended: the page changed meanwhile.`);
    if (!quiet) host.ended(current.owner, focus);
  }

  // A field of a row edit. The row's text is a one-row textarea that grows
  // with its lines; the card's URL and image fields are one-line inputs with
  // anchored suggestions; alt text grows like the row's text.
  function modeField(current: Mode, part: ComponentSlotPart, accessible: string, value: string, multiline: boolean) {
    const id = `${current.owner}\u0000${part}`;
    const previous = fieldInputs.get(id);
    let field: FieldControl;
    if (previous && previous === document.activeElement) field = previous;
    else {
      if (!multiline) { field = document.createElement("input"); field.type = "text"; field.value = value; }
      else {
        const area = document.createElement("textarea"); area.rows = 1; area.value = part === "text" && current.breaks ? value : oneLine(value); field = area;
        if (!fieldSizing) { area.addEventListener("input", () => fitHeight(area)); requestAnimationFrame(() => fitHeight(area)); }
      }
      field.addEventListener("input", () => {
        // Line breaks (Shift+Enter, a paste) stay where the element takes <br>; elsewhere they become spaces.
        const keep = part === "text" && current.breaks;
        if (keep ? /\r/.test(field.value) : /[\r\n]/.test(field.value)) {
          const clean = keep ? lineBreaks : oneLine;
          const caret = clean(field.value.slice(0, field.selectionStart ?? field.value.length)).length;
          field.value = clean(field.value); field.setSelectionRange(caret, caret);
          if (!fieldSizing && field instanceof HTMLTextAreaElement) fitHeight(field);
        }
        change(current, part);
      });
      // Leaving a field writes what waits; the edit itself goes on.
      field.addEventListener("blur", () => { if (!host.rendering() && current.pending.has(part)) writeNow(current, part); });
      (field as HTMLElement).addEventListener("keydown", event => {
        if (event.isComposing || event.key !== "Enter" && event.key !== "Escape") return;
        // Shift+Enter is a line break where the element takes one; nowhere else does it do anything.
        if (event.key === "Enter" && event.shiftKey) {
          if (!(part === "text" && current.breaks && field instanceof HTMLTextAreaElement)) event.preventDefault();
          event.stopPropagation();
          return;
        }
        event.preventDefault(); event.stopPropagation();
        finish(event.key === "Enter" ? "commit" : "cancel", true);
      });
      fieldInputs.set(id, field);
    }
    field.setAttribute("aria-label", accessible);
    current.fields.set(part, field);
    field.dataset.fieldId = `${current.prefix}${part}`;
    return field;
  }

  // Escape anywhere in the editing block (a field, Done, a card's button) takes the edit back.
  function cancelOnEscape(part: HTMLElement, current: Mode) {
    part.addEventListener("keydown", event => {
      if (event.key !== "Escape" || event.isComposing || mode !== current) return;
      event.preventDefault(); event.stopPropagation();
      finish("cancel", true);
    });
  }

  /** Turns `row` into the editing row: its text the field, in its own place, Done at its end. */
  function editRow(row: HTMLElement, label: HTMLElement, model: ComponentStructureModel, slot: Slot, owner: string, inPlace: boolean) {
    const current = startMode(model, slot, owner);
    current.parts = [row];
    row.classList.add("is-editing");
    row.dataset.editNode = owner; row.dataset.slotEditor = slot.name;
    if (inPlace) {
      const name = slot.kind === "link" ? "Button text" : "Text";
      const field = modeField(current, "text", `${slot.label}: ${name}`, slot.value.lines ?? slot.value.text, true);
      field.classList.add("page-structure__edit-field");
      const text = label.querySelector(":scope > .page-structure__text");
      if (text) text.replaceWith(field); else label.append(field);
    }
    const done = host.iconAction("Done", "done", () => finish("commit", true));
    done.classList.add("page-structure__done");
    done.title = "Done (Enter)";
    // Pressing Done keeps focus in the field until the click, so its value is never lost to a blur first.
    done.addEventListener("pointerdown", event => event.preventDefault());
    row.append(done);
    cancelOnEscape(row, current);
  }

  /** The card under an editing row: the slot's fields other than the row's own text (a link's URL, an image and its alt). */
  function card(model: ComponentStructureModel, slot: Slot, owner: string, level: number) {
    if (slot.kind !== "image" && slot.kind !== "link") return undefined;
    const current = startMode(model, slot, owner);
    const inline = node("div", "page-structure__inline"); inline.dataset.editNode = owner; inline.dataset.slotEditor = slot.name;
    // --depth is the owning row's, so the card lines up with it.
    inline.style.setProperty("--depth", String(level - 1));
    const block = node("div", "page-structure__slot");
    block.dataset.slotName = slot.name;
    // The fields as one labelled group (no disclosure header): always open under their row.
    const group = node("div", "page-structure__slot-fields");
    group.setAttribute("role", "group"); group.setAttribute("aria-label", slot.kind === "image" ? "Image" : "Link");
    const labelled = (part: ComponentSlotPart, caption: string, value: string, multiline: boolean) => {
      const field = modeField(current, part, `${slot.label}: ${caption}`, value, multiline);
      const wrap = node("label", "page-structure__slot-field"); wrap.append(node("span", "page-structure__slot-field-label", caption), field);
      return { wrap, field };
    };
    if (slot.kind === "image") {
      const image = labelled("src", "Image", slot.value.src ?? "", false);
      suggest(image.field as HTMLInputElement, model.images.map(value => ({ value })), "Images of this site");
      const file = document.createElement("input"); file.type = "file"; file.accept = "image/*"; file.hidden = true;
      let pending: ReturnType<ComponentStructureModel["openImageUpload"]>;
      uploadClosers.set(file, () => { if (pending) host.announce("The image picker changed; reopen Upload image… before choosing a file."); pending?.close(); pending = undefined; });
      const upload = button("Upload image…", () => {
        // The upload is a step of its own: what was typed so far is kept first.
        flush(current); current.session?.close(); current.session = undefined;
        pending?.close();
        pending = host.componentSlots(model.host.path, model.host.node)?.openImageUpload(slot.name);
        if (pending) file.click();
      }, "text-button");
      file.addEventListener("cancel", () => { pending?.close(); pending = undefined; });
      file.addEventListener("change", () => {
        const captured = pending, files = [...(file.files ?? [])]; pending = undefined; file.value = "";
        if (!files.length) captured?.close(); else void captured?.upload(files);
      });
      group.append(image.wrap, upload, file, labelled("alt", "Alt text", slot.value.alt ?? "", true).wrap);
    } else {
      if (!slot.value.editable) group.append(node("span", "page-structure__slot-summary", "Content: select the page element to edit its text"));
      const link = labelled("href", "Link / URL", slot.value.href ?? "", false);
      suggest(link.field as HTMLInputElement, model.links, "Pages of this site");
      group.append(link.wrap);
    }
    block.append(group);
    inline.append(block);
    current.parts.push(inline);
    cancelOnEscape(inline, current);
    return inline;
  }

  // Focus leaving the editing block ends the edit, keeping it, once the press
  // that moved it is over (so a click on another row lands on that row). The
  // window losing focus leaves it open.
  let pointerDown = false;
  const onPointerDown = () => { pointerDown = true; };
  const onPointerUp = () => { pointerDown = false; };
  window.addEventListener("pointerdown", onPointerDown, true);
  window.addEventListener("pointerup", onPointerUp, true);
  window.addEventListener("pointercancel", onPointerUp, true);
  const inside = (current: Mode, target: EventTarget | null) => target instanceof Node && current.parts.some(part => part.isConnected && part.contains(target));
  const onFocusOut = (event: FocusEvent) => {
    const current = mode;
    if (!current || host.rendering() || !inside(current, event.target) || inside(current, event.relatedTarget)) return;
    const check = () => {
      if (mode !== current || !document.hasFocus()) return;
      const active = document.activeElement;
      // Suggestion lists live in the top layer, outside the tree.
      if (inside(current, active) || active?.closest?.(".field-suggestions")) return;
      finish("commit", false);
    };
    if (pointerDown) window.addEventListener("pointerup", () => setTimeout(check), { once: true, capture: true });
    else setTimeout(check);
  };
  tree.addEventListener("focusout", onFocusOut);

  // ---- An instance's Attributes: each field its own step, as before. ----
  function attributeField(id: string, label: string, accessible: string, value: string, open: () => ComponentFieldSession | undefined) {
    const previous = fieldInputs.get(id);
    let input: FieldControl;
    if (previous && previous === document.activeElement) input = previous;
    else {
      const area = document.createElement("textarea"); area.rows = 1; area.value = oneLine(value); input = area;
      if (!fieldSizing) { area.addEventListener("input", () => fitHeight(area)); requestAnimationFrame(() => fitHeight(area)); }
      let fieldSession: ComponentFieldSession | undefined;
      input.addEventListener("focus", () => { fieldSession ??= open(); });
      input.addEventListener("input", () => {
        if (/[\r\n]/.test(input.value)) {
          const caret = oneLine(input.value.slice(0, input.selectionStart ?? input.value.length)).length;
          input.value = oneLine(input.value); input.setSelectionRange(caret, caret);
        }
        if (fieldSession?.write(input.value)) input.removeAttribute("aria-invalid"); else input.setAttribute("aria-invalid", "true");
      });
      const close = () => { fieldSession?.close(); fieldSession = undefined; };
      fieldClosers.set(input, close);
      input.addEventListener("blur", () => { if (!host.rendering()) close(); });
      input.addEventListener("keydown", event => {
        if (event.key !== "Enter" && event.key !== "Escape" || event.isComposing) return;
        event.preventDefault();
        // Enter applies (blur closes the session) and returns to the owning row; Escape also closes the panel.
        const owner = input.closest<HTMLElement>("[data-edit-node]")?.dataset.editNode;
        input.blur();
        if (event.key === "Enter" && owner !== undefined) { event.stopPropagation(); host.rowElement(owner)?.focus(); }
      });
      fieldInputs.set(id, input);
    }
    input.setAttribute("aria-label", accessible);
    const wrap = node("label", "page-structure__slot-field"); wrap.append(node("span", "page-structure__slot-field-label", label), input); return wrap;
  }
  function attributeControls(model: ComponentStructureModel, prefix: string) {
    const id = `${prefix}:attr:`;
    // A labelled group, no disclosure header: the row it is attached to says whose attributes these are.
    const group = node("div", "page-structure__attributes");
    group.setAttribute("role", "group"); group.setAttribute("aria-label", "Attributes");
    for (const attribute of model.attributes) {
      const row = node("div", "page-structure__attribute");
      row.append(attributeField(`${id}:${attribute.name}`, attribute.name, `Attribute: ${attribute.name}`, attribute.value, () => host.componentSlots(model.host.path, model.host.node)?.openAttribute(attribute.name)),
        button("Remove", () => model.removeAttribute(attribute.name), "text-button"));
      row.lastElementChild?.setAttribute("aria-label", `Remove ${attribute.name}`);
      group.append(row);
    }
    let form = attributeForms.get(id);
    if (!form) {
      form = document.createElement("form"); form.className = "page-structure__attribute-add";
      const name = document.createElement("input"), value = document.createElement("input");
      name.placeholder = "name"; name.setAttribute("aria-label", "New attribute name");
      value.placeholder = "value"; value.setAttribute("aria-label", "New attribute value");
      const submit = button("Add", () => undefined, "text-button"); submit.type = "submit"; submit.setAttribute("aria-label", "Add attribute");
      const problem = node("p", "page-structure__attribute-error"); problem.setAttribute("role", "alert"); problem.hidden = true;
      let origin: ReturnType<ComponentStructureModel["openAttributeAdd"]>;
      form.addEventListener("focusin", () => {
        origin ??= host.componentSlots(model.host.path, model.host.node)?.openAttributeAdd();
      });
      form.addEventListener("submit", event => {
        event.preventDefault();
        origin ??= host.componentSlots(model.host.path, model.host.node)?.openAttributeAdd();
        const result = origin?.add(name.value, value.value);
        if (!result || "error" in result) {
          problem.textContent = result && "error" in result ? result.error : "The instance changed; reopen Attributes before adding it.";
          if (!result || result.stale) { origin?.close(); origin = undefined; }
          problem.hidden = false; return;
        }
        name.value = value.value = ""; origin?.close(); origin = undefined; problem.hidden = true;
        name.focus();
      });
      form.addEventListener("focusout", event => {
        if (!host.rendering() && !form!.contains(event.relatedTarget as Node | null) && !name.value && !value.value) { origin?.close(); origin = undefined; }
      });
      formClosers.set(form, () => { origin?.close(); origin = undefined; });
      form.append(name, value, submit, problem); attributeForms.set(id, form);
    }
    group.append(form);
    return group;
  }
  /** An instance's Attributes panel, attached under its row; `close` hides it. */
  function attributesPanel(model: ComponentStructureModel, owner: string, level: number, prefix: string, close: () => void) {
    const panel = node("div", "page-structure__inline page-structure__inline--attributes"); panel.dataset.editNode = owner;
    panel.style.setProperty("--depth", String(level - 1));
    panel.append(attributeControls(model, prefix), host.iconAction("Close Attributes", "close", close));
    panel.addEventListener("keydown", event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); } });
    return panel;
  }

  return {
    editRow,
    card,
    attributesPanel,
    finish,
    /** The row being edited, if any. */
    editing: () => mode?.owner,
    /** The source moved on without the row edit (Undo, another edit): it must end. */
    stale: () => Boolean(mode?.session?.stale()),
    /**
     * While a row's text is typed, the paint of exactly the source that typing
     * made (text alone changed) is held back: the tree stays as it is, field,
     * caret and all. Anything else is drawn as ever.
     */
    holdsPaint(next: NativeStructure, previous: NativeStructure) {
      const active = document.activeElement;
      const typing = mode && (active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement) && inside(mode, active);
      typingHeld = Boolean(typing && mode!.ownSource !== undefined && next.paintedSource === mode!.ownSource && shape(next) === shape(previous));
      return typingHeld;
    },
    /** A held paint waits to be drawn: when focus has left the field. */
    held: () => typingHeld,
    /** The held paint is being drawn. */
    release() { typingHeld = false; },
    /** Focuses the requested field (the first whose id starts with `prefix`): the caret at `caret`, else all selected. */
    focus(wanted: FocusRequest) {
      const fields = [...fieldInputs.values()].filter(field => field.dataset.fieldId?.startsWith(wanted.prefix) && tree.contains(field));
      const field = fields.find(field => !field.closest("[hidden]")) ?? fields[0];
      if (!field) return false;
      field.focus();
      if (wanted.caret === undefined) field.select();
      else { const at = Math.min(wanted.caret, field.value.length); field.setSelectionRange(at, at); }
      return true;
    },
    /** An Attributes field that lost its place in the tree ends its step. */
    closeField(field: Element) { if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) fieldClosers.get(field)?.(); },
    /** Controls no longer in the tree end their sessions. */
    clean() {
      for (const [input, close] of uploadClosers) if (!tree.contains(input)) { close(); uploadClosers.delete(input); }
      for (const [input, close] of fieldClosers) if (!tree.contains(input)) { close(); fieldClosers.delete(input); }
      for (const [input, list] of suggestionLists) if (!tree.contains(input)) { list.destroy(); suggestionLists.delete(input); }
      for (const [id, input] of fieldInputs) if (!tree.contains(input)) fieldInputs.delete(id);
      for (const [id, form] of attributeForms) if (!tree.contains(form)) { formClosers.get(form)?.(); formClosers.delete(form); attributeForms.delete(id); }
    },
    /** The tree goes: a row edit is kept (what waits is written), every other step ends. */
    destroy() {
      finish("commit", false, true);
      for (const close of fieldClosers.values()) close();
      for (const close of uploadClosers.values()) close();
      for (const close of formClosers.values()) close();
      for (const list of suggestionLists.values()) list.destroy();
      fieldClosers.clear(); uploadClosers.clear(); formClosers.clear(); suggestionLists.clear(); fieldInputs.clear(); attributeForms.clear();
      tree.removeEventListener("focusout", onFocusOut);
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointerup", onPointerUp, true);
      window.removeEventListener("pointercancel", onPointerUp, true);
    },
  };
}

export type StructureEditing = ReturnType<typeof createStructureEditing>;
