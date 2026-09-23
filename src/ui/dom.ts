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

export function link(text: string, href: string, className = "button primary") {
  const result = node("a", className, text);
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
