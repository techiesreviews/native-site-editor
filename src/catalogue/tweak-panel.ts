// The Tweak section's controls (tweak.ts reads the values and writes the CSS): one field per value, a colour picker
// or a slider beside its text where one fits, Reset, and "Send to agent", which says Copied on itself.
import { iconMarkup, svgElement } from "../icons";
import { KIND_NAMES, changeRequest, changedSides, hexOf, type Edits, type Side, type TweakField, type TweakKind } from "./tweak";

export interface TweakPanel {
  part: { id: string; name: string };
  /** Undefined while the part's styles are still being read. */
  fields: readonly TweakField[] | undefined;
  edits: Edits;
  /** The theme the live cell shows: colours are edited for it alone. */
  side: Side;
  /** Shows the edits on the live cell. */
  apply(): void;
  say(text: string): void;
}

const RANGES: Partial<Record<TweakKind, { min: number; max: number }>> = { spacing: { min: 0, max: 64 }, corner: { min: 0, max: 48 }, type: { min: 8, max: 40 } };
const LENGTH = /^(-?\d*\.?\d+)(px|rem|em)$/;
let fieldIds = 0;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}
const label = (field: TweakField) => field.token ?? `${field.selector} { ${field.property} }`;
const valid = (field: TweakField, value: string) =>
  value.trim() !== "" && !/[;{}]/.test(value) && CSS.supports(field.token && field.kind === "colour" ? "color" : field.property, value);

/** Writes `text` to the clipboard; false when the browser refuses. */
async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // An older or locked-down browser: the selection route.
    const area = el("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    const done = document.execCommand("copy");
    area.remove();
    return done;
  }
}

/** The Tweak section for the selected part. */
export function tweakSection(panel: TweakPanel): HTMLElement {
  const section = el("section", "cat-inspector__section cat-tweak");
  section.setAttribute("aria-label", "Tweak");
  section.dataset.tweak = "";
  section.append(el("h3", "cat-inspector__heading", "Tweak"));
  if (!panel.fields) {
    section.setAttribute("aria-busy", "true");
    section.append(el("p", "cat-tweak__note", "Reading its styles…"));
    return section;
  }
  if (!panel.fields.length) {
    section.append(el("p", "cat-tweak__note", "No colours, spacing, corners, shadows or font sizes in its own styles."));
    return section;
  }
  const { fields, edits, side } = panel;
  const syncs: (() => void)[] = [];
  const reset = el("button", "button secondary cat-tweak__reset", "Reset");
  const send = el("button", "button secondary cat-tweak__send");
  reset.type = send.type = "button";
  const sendLabel = () => send.replaceChildren(svgElement(iconMarkup("sparkle", 16, "icon--before")), "Send to agent");
  sendLabel();
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;
  const changed = () => fields.some((field) => changedSides(field, edits[field.id]).length > 0);
  const paintActions = () => {
    const none = !changed();
    for (const button of [reset, send]) button.setAttribute("aria-disabled", String(none));
  };

  let group: TweakKind | undefined;
  for (const field of fields) {
    if (field.kind !== group) {
      group = field.kind;
      section.append(el("h4", "cat-tweak__group", field.kind === "colour" ? `${KIND_NAMES.colour} · ${side === "light" ? "Light" : "Dark"}` : KIND_NAMES[field.kind]));
    }
    const id = `cat-tweak-${++fieldIds}`;
    const row = el("div", "cat-tweak__field");
    const name = el("label", "cat-tweak__name", label(field));
    name.htmlFor = id;
    name.id = `${id}-name`;
    name.title = label(field);
    row.append(name);
    if (field.token) {
      const use = el("span", "cat-tweak__use", field.usedBy[0] + (field.usedBy.length > 1 ? ` +${field.usedBy.length - 1}` : ""));
      use.title = field.usedBy.join("\n");
      row.append(use);
    }
    const inputs = el("div", "cat-tweak__inputs");
    const text = el("input", "cat-input cat-tweak__text");
    text.id = id;
    text.spellcheck = false;
    text.autocomplete = "off";
    const current = () => edits[field.id]?.[side] ?? field.before[side];
    const set = (value: string) => {
      const ok = valid(field, value);
      text.setAttribute("aria-invalid", String(!ok));
      if (!ok) return;
      const next = { ...edits[field.id] ?? field.before };
      if (field.themed) next[side] = value.trim();
      else next.light = next.dark = value.trim();
      if (changedSides(field, next).length) edits[field.id] = next;
      else delete edits[field.id];
      row.toggleAttribute("data-changed", field.id in edits);
      clearTimeout(copiedTimer);
      sendLabel();
      paintActions();
      panel.apply();
    };
    let picker: HTMLInputElement | undefined, slider: HTMLInputElement | undefined;
    if (field.kind === "colour" && hexOf(current())) {
      picker = el("input", "cat-tweak__swatch");
      picker.type = "color";
      picker.setAttribute("aria-label", `${label(field)} colour`);
      picker.addEventListener("input", () => { text.value = picker!.value; set(picker!.value); });
      inputs.append(picker);
    }
    const length = LENGTH.exec(current()), range = RANGES[field.kind];
    if (length && range) {
      const [, amount, unit] = length;
      const scale = unit === "px" ? 1 : 1 / 16;
      slider = el("input", "cat-tweak__slider");
      slider.type = "range";
      slider.min = String(Math.min(range.min * scale, Number(amount)));
      slider.max = String(Math.max(range.max * scale, Number(amount)));
      slider.step = unit === "px" ? "1" : "0.0625";
      slider.setAttribute("aria-labelledby", name.id);
      slider.addEventListener("input", () => { text.value = `${slider!.value}${unit}`; set(text.value); });
      inputs.append(slider);
    }
    inputs.append(text);
    row.append(inputs);
    text.addEventListener("input", () => {
      set(text.value);
      const now = current();
      if (picker) picker.value = hexOf(now) ?? picker.value;
      if (slider && LENGTH.test(now)) slider.value = LENGTH.exec(now)![1];
    });
    const sync = () => {
      const now = current();
      text.value = now;
      text.removeAttribute("aria-invalid");
      row.toggleAttribute("data-changed", field.id in edits);
      if (picker) picker.value = hexOf(now) ?? "#000000";
      if (slider) slider.value = LENGTH.exec(now)?.[1] ?? slider.value;
    };
    sync();
    syncs.push(sync);
    section.append(row);
  }

  reset.addEventListener("click", () => {
    if (reset.getAttribute("aria-disabled") === "true") return;
    for (const key of Object.keys(edits)) delete edits[key];
    for (const sync of syncs) sync();
    clearTimeout(copiedTimer);
    sendLabel();
    paintActions();
    panel.apply();
    panel.say(`${panel.part.name} reset`);
  });
  send.addEventListener("click", () => void sendRequest());
  async function sendRequest() {
    const request = changeRequest(panel.part, fields, edits);
    if (send.getAttribute("aria-disabled") === "true" || !request) return;
    const copied = await copy(request);
    send.replaceChildren(...copied ? [svgElement(iconMarkup("check", 16, "icon--before")), "Copied"] : ["Couldn't copy"]);
    send.toggleAttribute("data-problem", !copied);
    panel.say(copied ? "Change request copied" : "Couldn't copy the change request");
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => { send.removeAttribute("data-problem"); sendLabel(); }, 2000);
  }
  paintActions();
  const actions = el("div", "cat-tweak__actions");
  actions.append(reset, send);
  section.append(actions);
  return section;
}
