import { icon } from "../icons";

export function node<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = "",
  text = "",
) {
  const result = document.createElement(tag);
  result.className = className;
  result.textContent = text;
  return result;
}

// A link whose text ends in " ↗" leaves the editor: the arrow is drawn as an icon.
export function link(text: string, href: string, className = "button primary") {
  const external = text.endsWith(" ↗");
  const result = node("a", className, external ? text.slice(0, -2) : text);
  if (external) result.append(icon("arrow-up-right", 12, "icon--after"));
  result.href = href;
  return result;
}

export function button(
  text: string,
  action: () => void,
  className = "button secondary",
) {
  const result = node("button", className, text);
  result.type = "button";
  result.addEventListener("click", action);
  return result;
}
