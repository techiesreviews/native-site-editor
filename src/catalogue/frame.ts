// Frames: a part or mock-up drawn in its own page, so a menu, a dialog or a phone width has its own top layer, ids,
// fixed positions and window width. On the board a frame is an inert <iframe> (pointer and wheel go to the board)
// whose document is written inline (`srcdoc`), as the editor's preview frame is: the editor's pages refuse to be
// framed (`frame-ancestors 'none'`, public/_headers), and an inline document has no response for that rule to apply
// to. It loads this page's own stylesheets and entry script, reads what to show from its <iframe>'s `data-frame`, and
// redraws when the board sets new options on `data-values`. The same page opened at
// catalogue.html?frame=<part> or ?mockup=<id> (&theme=dark&v=<options>) shows one frame on its own, as a link.
import { MOCKUPS, type Mockup } from "./mockups";
import { PARTS, isPart, type Part, type Values } from "./parts";

export type Theme = "light" | "dark";
export interface FrameRequest { kind: "frame" | "mockup"; id: string; theme: Theme; values: Values; width: number; height: number }

/** The query a frame reads: the same as a frame's own link. */
export function frameQuery(request: Omit<FrameRequest, "height" | "width">): string {
  const params = new URLSearchParams({ [request.kind]: request.id, theme: request.theme });
  if (Object.keys(request.values).length) params.set("v", JSON.stringify(request.values));
  return params.toString();
}

const escapeAttribute = (text: string) => text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
/** The inline document of every frame: this page's stylesheets and entry script. */
function frameDocument(doc: Document): string {
  const links = Array.from(doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'), (link) => `<link rel="stylesheet" href="${escapeAttribute(link.href)}">`);
  const scripts = Array.from(doc.querySelectorAll<HTMLScriptElement>('script[type="module"][src]'));
  const entry = scripts.find((script) => /catalogue/.test(script.src)) ?? scripts.at(-1);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">${links.join("")}${entry ? `<script type="module" src="${escapeAttribute(entry.src)}"></script>` : ""}</head><body></body></html>`;
}

/** The frame a board cell shows: sized and inert. */
export function frameElement(request: FrameRequest, label: string): HTMLIFrameElement {
  const frame = document.createElement("iframe");
  frame.className = "cat-iframe";
  frame.title = label;
  frame.inert = true;
  frame.tabIndex = -1;
  frame.width = String(request.width);
  frame.height = String(request.height);
  frame.dataset.frame = frameQuery(request);
  frame.srcdoc = frameDocument(document);
  return frame;
}

/** Draws `values` in a frame already on the board. */
export function updateFrame(frame: HTMLIFrameElement, values: Values) {
  frame.dataset.values = JSON.stringify(values);
}

/** The board's <iframe> around this page, if any (an element of the board's window, so not an instance of ours). */
const hostFrame = () => (window.frameElement?.tagName === "IFRAME" ? window.frameElement as HTMLIFrameElement : undefined);

/** The query this page was opened with: its <iframe>'s on the board, else its own address. */
export function ownQuery(): string {
  return hostFrame()?.dataset.frame ?? location.search;
}

/** What a frame page shows, from its query; undefined when it names no frame. */
export function frameOf(query: string): { entry: Part | Mockup; theme: Theme; values: Values } | undefined {
  const params = new URLSearchParams(query);
  const partId = params.get("frame"), mockupId = params.get("mockup");
  const part = partId ? PARTS.find((item) => item.id === partId) : undefined;
  const entry = part && isPart(part) ? part : mockupId ? MOCKUPS.find((item) => item.id === mockupId) : undefined;
  if (!entry) return undefined;
  let values: Values = {};
  try { values = JSON.parse(params.get("v") ?? "{}") as Values; } catch { /* A hand-edited address: the defaults. */ }
  return { entry, theme: params.get("theme") === "dark" ? "dark" : "light", values: { ...entry.defaults, ...values } };
}

/** Runs a frame page: the one part or mock-up, in its theme, redrawn when the board sets new options. */
export async function startFrame(shown: NonNullable<ReturnType<typeof frameOf>>) {
  document.documentElement.dataset.theme = shown.theme;
  document.body.className = `cat-frame-page${shown.entry.area === "mockups" ? " cat-frame-page--screen" : ""}`;
  const stage = document.createElement("div");
  stage.className = "cat-frame-stage";
  document.body.replaceChildren(stage);
  let drawing = 0;
  const draw = async (values: Values) => {
    const turn = ++drawing;
    const element = shown.entry.area === "mockups" ? await shown.entry.render(values) : await shown.entry.render(values, "normal");
    if (turn === drawing) stage.replaceChildren(element);
  };
  // Options the board set while this page was still loading are on `data-values` already: they win over the first ones.
  const host = hostFrame();
  const set = (): Values | undefined => {
    try { return host?.dataset.values ? { ...shown.values, ...JSON.parse(host.dataset.values) as Values } : undefined; } catch { return undefined; }
  };
  if (host) new MutationObserver(() => { const values = set(); if (values) void draw(values); }).observe(host, { attributes: true, attributeFilter: ["data-values"] });
  await draw(set() ?? shown.values);
}
