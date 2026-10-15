import { node } from "../ui/dom";

export function input(label: string, type: string) {
  const control = node("input"); control.type = type;
  control.name = label.toLowerCase().replace(/\s+/g, "-");
  control.setAttribute("aria-label", label);
  return control;
}
export function select(label: string, choices: string[][]) {
  const control = node("select");
  control.name = label.toLowerCase().replace(/\s+/g, "-");
  control.setAttribute("aria-label", label);
  for (const [value, text] of choices) control.append(new Option(text, value));
  return control;
}
export function field(label: string, control: HTMLElement) {
  const wrap = node("label", "media-library__field");
  wrap.append(node("span", "", label), control);
  return wrap;
}
let hints = 0;
/** A tick box with its label; a `hint` is the row's second line (slice 108), describing the box. */
export function check(label: string, control: HTMLInputElement, hint?: string) {
  const wrap = node("label", "media-library__check");
  wrap.append(control, node("span", "", label));
  if (hint) {
    const line = node("span", "media-library__hint", hint); line.id = `media-check-hint-${++hints}`;
    control.setAttribute("aria-describedby", line.id); wrap.append(line);
  }
  return wrap;
}
