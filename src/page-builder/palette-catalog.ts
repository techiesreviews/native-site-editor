import type { EditorPaletteDeps, PaletteSelection } from "./palette";
import { selectionIdentity, announceRefusal } from "./palette";
import { parseMarked } from "../native-source-location";
import { nativeDestinations, nativeMarkupInsertEdit } from "./native-operations";
import { nativeChoiceMarkup } from "./native-elements";
import type { AddChoice } from "./add-catalog";
import { registerShortcut, type Command } from "./commands";
const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const extension = (path: string) => path.split(".").pop()?.toLowerCase() ?? "";
const fileIcon = (path: string) => {
  const ext = extension(path);
  if (ext === "html" || ext === "htm") return "file-html";
  if (ext === "css") return "file-css";
  if (["js", "mjs", "ts", "json", "jsonc", "xml", "svg", "md", "txt", "toml", "yml", "yaml"].includes(ext)) return "file-code";
  if (["png", "jpg", "jpeg", "gif", "webp", "avif", "ico"].includes(ext)) return "image";
  return "file";
};


/**
 * Where a component goes for "Add …": after the selected section (or the
 * section the selection is in), else at the end of the page's `main`.
 */
export function sectionInsertPoint(source: string, selection: PaletteSelection | undefined, isSectionTag: (tag: string) => boolean): { parent: number[]; index: number } | undefined {
  const { root } = parseMarked(source);
  if (selection?.node?.length) {
    let parent: ParentNode = root;
    let found: { parent: number[]; index: number } | undefined;
    selection.node.forEach((index, depth) => {
      const child = parent.children[index];
      if (!child) return;
      if (isSectionTag(child.localName)) found = { parent: selection.node!.slice(0, depth), index: index + 1 };
      parent = child;
    });
    if (found) return found;
  }
  const main = root.querySelector("main");
  if (!main) return undefined;
  const path: number[] = [];
  for (let el: Element | null = main; el; el = el.parentElement) path.unshift([...(el.parentNode as ParentNode).children].indexOf(el));
  return { parent: path, index: main.children.length };
}


const publishButton = () => document.querySelector<HTMLButtonElement>(".publish-menu__trigger");

export function actionCommands(deps: EditorPaletteDeps): Command[] {
  const mac = isMac();
  return [
    {
      id: "editor.publish", title: "Publish changes", group: "Actions", icon: "publish", suggested: true,
      keywords: ["save", "commit", "github", "deploy", "push"],
      when: () => Boolean(publishButton() && !publishButton()!.disabled),
      run: () => publishButton()?.click(),
    },
    {
      id: "editor.review-changes", title: "Review changes to publish", group: "Actions", icon: "publish",
      keywords: ["save", "changes", "diff", "drafts", "github"],
      when: () => Boolean(publishButton() && !publishButton()!.disabled),
      run: () => {
        const trigger = publishButton();
        if (!trigger) return;
        trigger.focus();
        trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
      },
    },
    {
      id: "editor.undo", title: "Undo", group: "Actions", icon: "undo", area: "Editing",
      shortcut: [["Mod", "Z"]], when: deps.editing, run: () => deps.history("undo"),
    },
    {
      id: "editor.redo", title: "Redo", group: "Actions", icon: "redo", area: "Editing",
      shortcut: mac ? [["Mod", "Shift", "Z"]] : [["Mod", "Shift", "Z"], ["Ctrl", "Y"]], when: deps.editing, run: () => deps.history("redo"),
    },
    {
      id: "editor.toggle-code", title: "Hide code", group: "Actions", icon: "split",
      keywords: ["toggle", "code pane", "source", "minimize", "preview"],
      when: () => !deps.codeHidden() && Boolean(document.querySelector(".code-resize")),
      run: deps.toggleCode,
    },
    {
      id: "editor.show-code", title: "Show code", group: "Actions", icon: "code",
      keywords: ["toggle", "code pane", "source", "restore", "html"],
      when: () => deps.codeHidden(),
      run: deps.toggleCode,
    },
    {
      id: "editor.toggle-structure", title: "Hide page structure", group: "Actions", icon: "sidebar",
      keywords: ["toggle", "sidebar", "navigator", "layers", "tree"],
      when: () => !deps.structureHidden(),
      run: deps.toggleStructure,
    },
    {
      id: "editor.show-structure", title: "Show page structure", group: "Actions", icon: "structure",
      keywords: ["toggle", "sidebar", "navigator", "layers", "tree"],
      when: () => deps.structureHidden(),
      run: deps.toggleStructure,
    },
    {
      id: "editor.new-page", title: "New page", group: "Actions", icon: "file-plus", suggested: true,
      keywords: ["add", "create", "page"],
      when: () => deps.pages().length > 0,
      run: deps.newPage,
    },
    {
      id: "editor.new-file", title: "New file or folder", group: "Actions", icon: "file-plus",
      keywords: ["add", "create", "folder", "stylesheet", "css"],
      when: () => Boolean(document.getElementById("new-at-root")),
      run: deps.newFile,
    },
    {
      id: "editor.pages-and-files", title: "Show pages and files", group: "Actions", icon: "pages",
      keywords: ["explorer", "browse", "tree", "open"],
      when: () => Boolean(document.getElementById("explorer-toggle")),
      run: deps.showPagesAndFiles,
    },
    {
      id: "editor.history", title: "Show history", group: "Actions", icon: "clock",
      keywords: ["commits", "versions", "restore", "changes"],
      when: () => Boolean(document.getElementById("history-button")),
      run: () => document.getElementById("history-button")?.click(),
    },
  ];
}

export function siteCommands(deps: EditorPaletteDeps): Command[] {
  const out: Command[] = [];
  const current = deps.currentPath();
  const pages = deps.pages();
  const pageFiles = new Set(pages.map((page) => page.file));
  for (const page of pages) {
    out.push({
      id: `page:${page.file}`,
      title: page.label,
      hint: page.route,
      group: "Pages",
      navigation: true,
      icon: page.route === "/" ? "home" : "file",
      keywords: [page.file, "page", "open"],
      suggested: page.file !== current,
      run: () => deps.open(page.file),
    });
  }
  // Components: add a section component where the selection is, or open any component's template.
  const selection = deps.selection();
  const pagePath = current && pageFiles.has(current) ? current : undefined;
  const held = deps.stamp?.();
  const listedSource = pagePath ? deps.source(pagePath) : undefined;
  const listedSelection = selectionIdentity(selection);
  for (const component of deps.components()) {
    if (component.section && pagePath) {
      out.push({
        id: `component.add:${component.tag}`,
        title: `Add ${component.label}`,
        hint: selection?.path === pagePath && selection.node ? `<${component.tag}> after the selected section` : `<${component.tag}> at the end of the page`,
        group: "Components",
        icon: "insert",
        accent: "component",
        suggested: true,
        keywords: ["insert", "section", "component", component.tag],
        run: async () => {
          if (!(held?.holds() ?? true) || deps.currentPath() !== pagePath || deps.source(pagePath) !== listedSource || selectionIdentity(deps.selection()) !== listedSelection) {
            announceRefusal(deps, "The page changed. Reopen the command palette and try again.");
            return;
          }
          const source = deps.source(pagePath) ?? "";
          const point = sectionInsertPoint(source, selection?.path === pagePath ? selection : undefined, deps.isSectionTag);
          if (!point) { announceRefusal(deps, `Select a section to add ${component.label} after it.`); return; }
          await deps.insert({ path: pagePath, ...point }, { tag: component.tag, label: component.label });
        },
      });
    }
    out.push({
      id: `component.open:${component.tag}`,
      title: `Open ${component.label} component`,
      navigation: true,
      hint: component.file,
      group: "Components",
      icon: "component",
      accent: "component",
      keywords: ["open", "template", "edit", component.tag],
      run: () => deps.open(component.file),
    });
  }
  const componentFiles = new Set(deps.components().map((component) => component.file));
  for (const path of deps.files()) {
    if (pageFiles.has(path) || componentFiles.has(path)) continue;
    const slash = path.lastIndexOf("/");
    out.push({
      id: `file:${path}`,
      title: path.slice(slash + 1),
      hint: slash > 0 ? path.slice(0, slash) : undefined,
      group: "Files",
      navigation: true,
      icon: fileIcon(path),
      keywords: [path],
      run: () => deps.open(path),
    });
  }
  return out;
}

/** Source-safe native placement: inside a valid container, else after selection, else main. */
export function nativePaletteInsertPoint(source: string, path: string, selection: PaletteSelection | undefined, choice: AddChoice): { parent: number[]; index: number } | undefined {
  const markup = nativeChoiceMarkup(choice.tag);
  if (!markup) return undefined;
  const valid = (point: { parent: number[]; index: number }) => Boolean(nativeMarkupInsertEdit(source, point.parent, point.index, markup));
  if (selection?.path === path && selection.node?.length) {
    const destinations = nativeDestinations(source, path, selection.node);
    for (const placement of ["inside", "after"] as const) {
      const candidate = destinations.find((item) => item.placement === placement)?.point;
      if (candidate && valid(candidate)) return { parent: [...candidate.parent], index: candidate.index };
    }
    return undefined;
  }
  const { root } = parseMarked(source);
  const main = root.querySelector("main");
  if (!main) return undefined;
  const node: number[] = [];
  for (let element: Element | null = main; element; element = element.parentElement) node.unshift([...(element.parentNode as ParentNode).children].indexOf(element));
  const candidate = nativeDestinations(source, path, node).find((item) => item.placement === "inside")?.point;
  return candidate?.tag === "main" && valid(candidate) ? { parent: [...candidate.parent], index: candidate.index } : undefined;
}

/** Each visible command carries its exact page, selection and mount snapshot. */
export function nativePaletteCommands(deps: EditorPaletteDeps): Command[] {
  const path = deps.currentPath();
  const source = path ? deps.source(path) : undefined;
  if (!path || source === undefined || !deps.pages().some((page) => page.file === path)) return [];
  const held = deps.stamp?.();
  const selection = deps.selection();
  const identity = selectionIdentity(selection);
  return (deps.nativeElements?.() ?? []).filter((choice) => choice.kind === "native" && Boolean(nativeChoiceMarkup(choice.tag))).map((choice) => ({
    id: `native.add:${choice.tag}`, title: `Add ${choice.label}`, group: "Elements", icon: "insert",
    hint: "Native HTML", keywords: ["insert", "native", choice.tag, choice.group ?? ""],
    run: async () => {
      if (deps.currentPath() !== path || deps.source(path) !== source || !(held?.holds() ?? true) || selectionIdentity(deps.selection()) !== identity || !(deps.nativeElements?.() ?? []).some((current) => current.kind === "native" && current.tag === choice.tag)) {
        announceRefusal(deps, "The page changed. Reopen the command palette and try again."); return;
      }
      const point: { path?: string; parent: number[]; index: number } | undefined = deps.nativeInsertPoint ? deps.nativeInsertPoint(source, path, selection, choice) : nativePaletteInsertPoint(source, path, selection, choice);
      const markup = nativeChoiceMarkup(choice.tag)!;
      if (!point || !nativeMarkupInsertEdit(source, point.parent, point.index, markup)) {
        announceRefusal(deps, `Select a valid HTML container to add ${choice.label}.`); return;
      }
      // Host callbacks cannot silently replace the captured source or selection.
      if (deps.currentPath() !== path || deps.source(path) !== source || !(held?.holds() ?? true) || selectionIdentity(deps.selection()) !== identity) {
        announceRefusal(deps, "The page changed. Reopen the command palette and try again."); return;
      }
      if (point.path !== undefined && point.path !== path) { announceRefusal(deps, "The insertion page changed. Reopen the command palette."); return; }
      await deps.insert(point.path === path ? point as { path: string; parent: number[]; index: number } : { path, parent: [...point.parent], index: point.index }, { tag: choice.tag, label: choice.label });
    },
  }));
}

// Shortcuts that are no command of the palette, for the sheet: what lists,
// the canvas, the code editor and the edit bar answer themselves.
export function listShortcuts() {
  const entries: Parameters<typeof registerShortcut>[0][] = [
    { area: "Everywhere", label: "Close a menu, popover or dialog", keys: [["Escape"]] },
    { area: "Canvas", label: "Type in the selected text", keys: [["Enter"]], note: "Or double-click it; a click selects" },
    { area: "Canvas", label: "Finish typing", keys: [["Enter"], ["Escape"]], note: "The text stays selected" },
    { area: "Canvas", label: "Bold", keys: [["Mod", "B"]], note: "Selected text, or the whole element" },
    { area: "Canvas", label: "Italic", keys: [["Mod", "I"]] },
    { area: "Canvas", label: "Link the selected text", keys: [["Mod", "K"]], note: "With text selected; otherwise ⌘K opens the palette" },
    { area: "Canvas", label: "Move the selected section", keys: [["Alt", "ArrowUp"], ["Alt", "ArrowDown"]], note: "Also on the edit bar and in the page structure" },
    { area: "Canvas", label: "Duplicate the selected section", keys: [["Mod", "D"]], note: "When not typing" },
    { area: "Canvas", label: "Remove the selected element", keys: [["Delete"], ["Backspace"]], note: "When not typing" },
    { area: "Canvas", label: "Select parent", keys: [["Shift", "Enter"]], note: "When not typing" },
    { area: "Canvas", label: "Follow a link to its page", keys: [["Mod", "Click"]] },
    { area: "Edit bar", label: "Move between controls", keys: [["ArrowLeft"], ["ArrowRight"]] },
    { area: "Edit bar", label: "Move the section from its name", keys: [["ArrowUp"], ["ArrowDown"]] },
    { area: "Edit bar", label: "Cancel a section drag", keys: [["Escape"]] },
    { area: "Edit bar", label: "Send to the agent", keys: [["Enter"]], note: "Shift+Enter starts a new line" },
    { area: "Page structure", label: "Move between rows", keys: [["ArrowUp"], ["ArrowDown"], ["Home"], ["End"]] },
    { area: "Page structure", label: "Open or close a row", keys: [["ArrowRight"], ["ArrowLeft"]] },
    { area: "Page structure", label: "Move a section", keys: [["Alt", "ArrowUp"], ["Alt", "ArrowDown"]] },
    { area: "Pages and files", label: "Open", keys: [["Enter"], ["Space"]] },
    { area: "Pages and files", label: "Rename", keys: [["F2"]] },
    { area: "Pages and files", label: "Delete", keys: [["Delete"]], note: "Files also with ⌘⌫ on a Mac" },
    { area: "Pages and files", label: "Row actions menu", keys: [["Shift", "F10"], ["Menu"]] },
    { area: "Pages and files", label: "Pages or Files tab", keys: [["ArrowLeft"], ["ArrowRight"]] },
    { area: "Code", label: "Code editor commands", keys: [["F1"]], note: "Monaco's own palette, while typing in code" },
    { area: "Code", label: "Find", keys: [["Mod", "F"]] },
    { area: "Panels", label: "Resize the sidebar or code", keys: [["ArrowLeft"], ["ArrowRight"], ["ArrowUp"], ["ArrowDown"]], note: "On a resize handle; Shift for bigger steps" },
    { area: "Panels", label: "Hide or show the sidebar or code", keys: [["Enter"], ["Space"]], note: "On its resize handle" },
  ];
  return entries.map(registerShortcut);
}

