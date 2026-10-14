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
export function check(label: string, control: HTMLInputElement) {
  const wrap = node("label", "media-library__check");
  wrap.append(control, node("span", "", label));
  return wrap;
}
