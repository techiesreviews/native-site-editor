// The editor's real screens on the design board (TOOLS-215): the whole workspace, drawn from the editor's own markup
// (src/workspace-shell.ts) and filled by the editor's own parts: the top bar with the project menu (on a phone its
// Menu and the pull-up sheet), Page structure (createPageStructure) with a sample page's rows and fields, the
// sidebar's resize handle, and the canvas bar (createCanvasBar) around a sample site. Each width is its frame's own
// window, so the editor's phone rules apply at 390 as they do on a phone, and every element is the editor's, with its
// ids and classes, for preview annotations. The code pane shows the page's source as plain text: the code editor
// loads only in the editor (listed under Made of as a copy), as does the sample site in the page frame.
import type { NativeStructureItem } from "../components/native-preview";
import type { Mockup } from "./mockups";
import type { Values } from "./parts";

const item = (tag: string, node: number[], text = "", children: NativeStructureItem[] = [], className = ""): NativeStructureItem =>
  ({ tag, className, node, text, heading: /^h[1-6]$/.test(tag) ? text : "", slot: "", children });
/** The sample page's elements, as the preview reports them to Page structure. */
const SAMPLE_ITEMS: NativeStructureItem[] = [
  item("header", [0], "", [item("a", [0, 0], "Garden & Co", [], "logo"), item("nav", [0, 1], "Services Journal About")]),
  item("main", [1], "", [
    item("section", [1, 0], "", [item("h1", [1, 0, 0], "Garden care that lasts"), item("p", [1, 0, 1], "Seasonal pruning, planting and plans, from people who stay to see them grow."), item("a", [1, 0, 2], "Book a visit", [], "button")], "hero"),
    item("section", [1, 1], "", [item("h2", [1, 1, 0], "Winter pruning"), item("h2", [1, 1, 1], "Spring planting"), item("h2", [1, 1, 2], "Year-round plans")], "cards"),
  ]),
  item("footer", [2], "© Garden & Co"),
];
const SAMPLE_SOURCE = `<!doctype html>
<html lang="en">
<head>
  <title>Garden & Co: garden care that lasts</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header><a class="logo" href="index.html">Garden &amp; Co</a>
    <nav><a href="services.html">Services</a> <a href="journal.html">Journal</a> <a href="about.html">About</a></nav></header>
  <main>
    <section class="hero">
      <h1>Garden care that lasts</h1>
      <p>Seasonal pruning, planting and plans, from people who stay to see them grow.</p>
      <a class="button" href="book.html">Book a visit</a>
    </section>
    <section class="cards">
      <article><h2>Winter pruning</h2><p>Roses, shrubs and fruit trees, cut at the right time.</p></article>
      <article><h2>Spring planting</h2><p>Beds planned around sun, soil and your week.</p></article>
      <article><h2>Year-round plans</h2><p>One visit a season, nothing forgotten.</p></article>
    </section>
  </main>
  <footer>© Garden &amp; Co</footer>
</body>
</html>`;
/** The site's own look in the page frame (the site's stylesheet, not the editor's). */
const SAMPLE_STYLE = `body{margin:0;font:16px/1.5 system-ui,sans-serif;color:#1d2a24;background:#f7f5ef}
header{display:flex;flex-wrap:wrap;align-items:center;gap:8px 24px;padding:18px 32px;background:#fff;border-bottom:1px solid #e3dfd3}
.logo{font-weight:700;font-size:18px;color:#2f6b4f;text-decoration:none}nav{display:flex;gap:16px}nav a{color:#5b665f;text-decoration:none}
.hero{padding:56px 32px;max-width:720px}h1{margin:0 0 12px;font-size:clamp(32px,6vw,48px);line-height:1.1}
.button{display:inline-block;margin-top:16px;padding:10px 20px;border-radius:999px;background:#2f6b4f;color:#fff;text-decoration:none}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;padding:0 32px 48px}
article{padding:20px;border-radius:12px;background:#fff;border:1px solid #e3dfd3}h2{margin:0 0 6px;font-size:18px}
footer{padding:24px 32px;color:#5b665f}`;

async function editorScreen(values: Values): Promise<HTMLElement> {
  // The editor's boot stylesheets beyond the board's own (src/main.ts), then the parts' modules.
  const [{ workspaceMarkup }, { fillTopBar, phoneTopBar }, { createPageStructure }, { createCanvasBar }, { structureLabel }, { mountSidebarResize }, { mountDropdown }] = await Promise.all([
    import("../workspace-shell"), import("./parts"), import("../components/page-structure"), import("../components/canvas-bar"),
    import("../native-structure"), import("../components/sidebar-resize"), import("../components/dropdown"),
    import("../components/pages-tree.css"), import("../components/phone-sheet.css"), import("../components/files-tree.css"),
    import("../components/native-preview.css"),
  ]);
  const app = document.createElement("div");
  app.id = "app";
  app.innerHTML = workspaceMarkup();
  await fillTopBar(app, values);
  // The page button opens Pages & files under the top bar, as the editor shows it before its lists load.
  mountDropdown({
    trigger: app.querySelector<HTMLButtonElement>("#explorer-toggle")!, panel: app.querySelector<HTMLElement>("#explorer")!,
    below: app.querySelector<HTMLElement>(".topbar")!, anchor: "--explorer",
  });
  const page = "index.html";

  // Page structure: the editor's own tree and page fields, on the sample page, the hero section selected.
  const structure = createPageStructure(app.querySelector<HTMLElement>("#structure")!, {
    label: (entry) => structureLabel(entry, false),
    onSelect: (path, node) => structure.select({ path, node }),
    pageMeta: () => ({ title: "Garden & Co: garden care that lasts", description: "Seasonal pruning, planting and plans." }),
  });
  structure.update({ path: page, items: SAMPLE_ITEMS });
  structure.select({ path: page, node: [1, 0] });

  // The page: the canvas bar (breakpoints, width, the selection's crumbs) around the site in its frame.
  const main = app.querySelector<HTMLElement>("#main")!;
  const pane = document.createElement("section");
  pane.className = "preview-pane native-preview-pane";
  pane.setAttribute("aria-label", "Native site preview");
  const frameHost = document.createElement("div");
  frameHost.className = "preview-frame-host";
  const frame = document.createElement("iframe");
  // The sample site is a picture of a page: the pointer and the wheel go on to the board (zoom and pan over it too).
  frame.className = "preview-frame native-preview-frame cat-sample-site";
  frame.title = "Native site preview";
  frame.setAttribute("sandbox", "");
  frame.srcdoc = SAMPLE_SOURCE.replace('<link rel="stylesheet" href="style.css">', `<style>${SAMPLE_STYLE}</style>`);
  frameHost.append(frame);
  const canvas = createCanvasBar(frameHost, frame, { onCrumb: () => undefined, onCrumbHover: () => undefined });
  canvas.setCrumbs([{ label: "main", kind: "element" }, { label: "section.hero", kind: "element" }]);
  pane.append(canvas.bar, frameHost);
  main.prepend(pane);
  main.classList.add("has-preview");

  // The code pane: the page's source.
  app.querySelector("#primary-title")!.textContent = page;
  const code = document.createElement("pre");
  code.className = "cat-code";
  code.textContent = SAMPLE_SOURCE;
  app.querySelector("#content")!.append(code);

  // Once on the page (the phone's sheet and the sidebar's handle measure the workspace they join): the phone's top
  // bar where the frame is phone-wide, as the editor loads it (workspace-mount.ts), and the sidebar's resize handle.
  let sidebar: ReturnType<typeof mountSidebarResize> | undefined, gone = false;
  requestAnimationFrame(() => {
    if (gone || !app.isConnected) return;
    sidebar = mountSidebarResize(app.querySelector<HTMLElement>(".workspace")!, app.querySelector<HTMLElement>(".sidebar")!);
    if (matchMedia("(max-width: 650px)").matches) void phoneTopBar(app, values, Boolean(values.menu));
  });
  // Drawn again with other options (frame.ts): the old screen's parts stop listening.
  app.addEventListener("cat-redraw", () => {
    gone = true;
    canvas.destroy();
    structure.destroy();
    sidebar?.dispose();
  }, { once: true });
  return app;
}

export const SCREENS: readonly Mockup[] = [
  {
    id: "editor", area: "screens", name: "Editor",
    files: [
      "src/workspace-shell.ts", "src/style.css", "src/components/page-structure.ts", "src/components/page-structure.css",
      "src/components/canvas-bar.ts", "src/components/canvas-bar.css", "src/components/native-preview.css",
      "src/components/top-bar-phone.ts", "src/components/top-bar-phone.css", "src/components/phone-sheet.css", "src/components/pages-tree.css",
    ],
    madeOf: ["top-bar", "top-bar-phone", "button", "icon", "inline-field"],
    copies: ["The code pane's text (the code editor loads only in the editor)", "The sample site in the page frame"],
    widths: [1280, 390], height: 760,
    defaults: { project: "techies-site", page: "Home", menu: false },
    controls: [
      { kind: "text", key: "project", label: "Project" },
      { kind: "text", key: "page", label: "Page" },
      { kind: "switch", key: "menu", label: "Menu open on the phone" },
    ],
    render: editorScreen,
  },
];
