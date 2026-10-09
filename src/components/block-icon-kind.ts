const nativeTags: Record<string, string> = { heading: "h2", paragraph: "p", image: "img" };

/**
 * Structure and drag labels share the icon for a block's tag and displayed
 * kind. `component` (default: a custom element's tag) takes the component mark.
 */
export function blockIconKind(tag: string, name: string, component = tag.includes("-")) {
  const native = tag.startsWith("native:") ? tag.slice(7) : tag;
  if (component) return "component";
  if (native === "a" && name === "Button") return "button";
  return nativeTags[native] ?? native;
}
