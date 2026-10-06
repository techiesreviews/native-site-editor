import { createPageStructure } from "../../src/components/page-structure";
const events: unknown[] = [];
const pending: ((result: { success: true } | { error: string }) => void)[] = [];
let version = 1;
let enabled = true;
let state = "available";
let source = "painted";
const child = { tag: "p", node: [1, 0, 0], text: "Child text", slot: "", children: [] };
const items = [
  { tag: "header", node: [0], text: "Navigation", slot: "", children: [] },
  { tag: "main", node: [1], text: "", slot: "", children: [
    { tag: "section", node: [1, 0], text: "Hero copy stays truncated naturally", slot: "", children: [child] },
    { tag: "section", node: [1, 1], text: "Managed", slot: "", children: [] },
  ] },
  { tag: "footer", node: [2], text: "Footer", slot: "", children: [] },
];
const sidebar = createPageStructure(document.getElementById("host")!, {
  label: item => ({ kind: item.tag[0].toUpperCase() + item.tag.slice(1), text: item.text }),
  onSelect: (path, node) => events.push({ type: "select", path, node }),
  pageSource: () => source,
  nativeFieldsRevision: () => String(version),
  nativeSharedRoot: (_path, item) => {
    if (!enabled) return undefined;
    if (state === "linked" && item.tag === "section") return { state: "linked", recordId: "hero", label: "Section hero",
      edit: () => events.push({ type: "edit" }), disconnect: () => events.push({ type: "disconnect" }) };
    return { state: "available", context: { key: `${version}:${item.node.join(".")}`, kind: item.tag as "section" | "header" | "footer",
      initialName: "Shared " + item.tag, proposedId: "shared-" + item.tag, availableClasses: ["site-" + item.tag], availableStylesheetPaths: ["styles/site.css"] },
      actions: { submit: (metadata, key) => { events.push({ type: "submit", metadata, key }); return new Promise(resolve => pending.push(resolve)); },
        close: (key, reason) => events.push({ type: "close", key, reason }) } };
  },
});
const update = () => sidebar.update({ path: "index.html", items, paintedSource: "painted" });
Object.assign(window, { sidebar, events, update, items,
  change(next: string) { state = next; version++; update(); },
  recheck() { update(); },
  disable() { enabled = false; version++; update(); },
  stale() { source = "changed"; version++; update(); },
  finish(index: number, result: { success: true } | { error: string }) { pending[index](result); },
});
update();
