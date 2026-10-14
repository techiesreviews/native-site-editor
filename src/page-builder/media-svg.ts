import { optimize, type CustomPlugin } from "svgo/browser";
import { svgHasExecutableContent } from "./media-limits";

const local = (name: string) => name.split(":").pop()!.toLowerCase();
const compact = (value: string) => value.replace(/[\s\u0000-\u0020\u007f-\u009f]/g, "").toLowerCase();
const executableUrl = (value: string) => /^(?:javascript:|vbscript:|data:text\/html)/.test(compact(value));
const removeExecutable: CustomPlugin = {
  name: "removeExecutableContent",
  fn: () => ({ instruction: { enter(node, parent) {
    // `<?xml-stylesheet?>` can pull in XSLT that builds executable markup; only the XML declaration is harmless.
    if (node.name.toLowerCase() !== "xml") parent.children.splice(parent.children.indexOf(node), 1);
  } }, element: { enter(node, parent) {
    const name = local(node.name);
    const target = Object.entries(node.attributes).find(([name]) => local(name) === "attributename")?.[1] ?? "";
    if (["script", "foreignobject", "iframe", "embed", "object"].includes(name)
      || ["animate", "set"].includes(name) && (local(compact(target)) === "href" || local(compact(target)).startsWith("on"))) {
      parent.children.splice(parent.children.indexOf(node), 1);
      return;
    }
    for (const [attribute, value] of Object.entries(node.attributes)) {
      if (local(attribute).startsWith("on") || local(attribute) === "href" && executableUrl(value)) delete node.attributes[attribute];
    }
  } } }),
};

/** Keep vector artwork and dimensions; executable content is never an optional optimisation. A stylesheet can select
 * by any element, attribute, order, emptiness or whitespace, so a styled SVG with nothing executable keeps its bytes,
 * and one with executable content loses only that, its comments and its DOCTYPE. */
export function cleanSvg(bytes: Uint8Array): Uint8Array {
  const source = new TextDecoder().decode(bytes), styled = /<(?:[\w.-]+:)?style[\s/>]/i.test(source);
  if (styled && !svgHasExecutableContent(bytes)) return bytes;
  const result = optimize(source, { multipass: true, plugins: styled ? [removeExecutable, "removeScripts", "removeComments", "removeDoctype"] : [
    removeExecutable, "removeScripts",
    { name: "preset-default", params: { overrides: { cleanupIds: false } } },
  ] });
  const cleaned = new TextEncoder().encode(result.data);
  if (svgHasExecutableContent(cleaned)) throw new Error("This SVG contains scripts that cannot be removed.");
  return cleaned;
}

export function svgDimensions(bytes: Uint8Array): { width?: number; height?: number } {
  const root = new TextDecoder().decode(bytes).match(/<svg\b([^>]*)>/i)?.[1] ?? "";
  const attributes = new Map([...root.matchAll(/([\w:]+)\s*=\s*["']([^"']*)["']/g)].map(match => [match[1].toLowerCase(), match[2]]));
  const dimension = (value = "") => /^(?:\d+(?:\.\d*)?|\.\d+)(?:px)?$/i.test(value) && Number.parseFloat(value) > 0 ? Number.parseFloat(value) : undefined;
  const view = (attributes.get("viewbox") ?? "").trim().split(/[\s,]+/).map(Number);
  let width = dimension(attributes.get("width")), height = dimension(attributes.get("height"));
  if (view.length === 4 && view.every(Number.isFinite) && view[2] > 0 && view[3] > 0) {
    if (width && !height) height = width * view[3] / view[2];
    else if (height && !width) width = height * view[2] / view[3];
    else { width ??= view[2]; height ??= view[3]; }
  }
  return { ...(width ? { width } : {}), ...(height ? { height } : {}) };
}
