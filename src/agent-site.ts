// The editor tab's side of the MCP site tools (worker/mcp.ts): what the tab
// tells agents about the native site (pages, components, page outlines,
// drafts), and how it applies the changes agents queue, each through the
// same code the editor's own controls run, so it lands as an ordinary draft
// with Undo. main.ts supplies the editor's state and actions.
import { minimalTextEdit } from "../shared/native-project";
import { outlineId, parseOutlineId, textHash, type AgentCommand } from "../shared/agent";
import type { AgentOutlineSection, AgentPageOutline, AgentSiteContext, EditorContext } from "../shared/types";
import type { SavedDraft } from "./drafts";
import { listChanges } from "./file-changes";
import { componentLabel, isSectionTemplate, nativeInsertEdit } from "./native-insert";
import type { NativeManifest } from "./native-manifest";
import { buildNativePagesTree, firstHeadingText, nativeTreePages, slugify, type NativePageNode } from "./native-pages";
import { locateNativeElementRange, parseMarked } from "./native-source-location";
import { removeEdit } from "./native-structure";
import type { AgentCommandOutcome } from "./components/agent-menu";

// ---- Page outlines ----

const HEADINGS = "h1,h2,h3,h4,h5,h6";
const clip = (text: string | null | undefined, max = 120) => {
  const value = (text ?? "").replace(/\s+/g, " ").trim();
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
};

function nodePath(el: Element, root: ParentNode): number[] {
  const path: number[] = [];
  let current: Element | null = el;
  while (current) {
    const parent: ParentNode = current.parentElement ?? root;
    path.unshift([...parent.children].indexOf(current));
    current = current.parentElement;
  }
  return path;
}

/**
 * A page's sections as the page builder sees them: every element holding a
 * section (a `<section>`, or a section component's instance) is a container
 * and each such child a section; a `<main>` holding none is a container too,
 * where the first one can go (the preview runtime's `insertPoints`). Ids are
 * element-child indexes from the page root, as the editor's node paths.
 */
export function pageOutline(html: string, sectionTags: ReadonlySet<string>): Omit<AgentPageOutline, "file" | "hash"> {
  const { root } = parseMarked(html);
  const sectionLike = (el: Element) => el.localName === "section" || sectionTags.has(el.localName);
  const containers: AgentPageOutline["containers"] = [];
  const sections: AgentOutlineSection[] = [];
  const holders: ParentNode[] = [root, ...root.querySelectorAll("*")];
  for (const holder of holders) {
    const children = [...holder.children];
    if (!children.some(sectionLike)) continue;
    const base = holder === root ? [] : nodePath(holder as Element, root);
    if (containers.length < 50)
      containers.push({ id: outlineId(base), tag: holder === root ? "(page)" : (holder as Element).localName, children: children.length });
    children.forEach((child, index) => {
      if (!sectionLike(child) || sections.length >= 200) return;
      sections.push(describeSection(child, [...base, index], sectionTags));
    });
  }
  const main = root.querySelector("main");
  if (main && ![...main.children].some(sectionLike) && containers.length < 50)
    containers.push({ id: outlineId(nodePath(main, root)), tag: "main", children: main.children.length });
  return { containers, sections };
}

function describeSection(el: Element, node: number[], sectionTags: ReadonlySet<string>): AgentOutlineSection {
  const component = sectionTags.has(el.localName);
  const out: AgentOutlineSection = { id: outlineId(node), tag: el.localName };
  if (component) out.component = true;
  const key = el.getAttribute("data-key");
  if (key) out.key = clip(key, 200);
  const heading = el.matches(HEADINGS) ? el : el.querySelector(HEADINGS);
  if (heading && clip(heading.textContent)) out.heading = clip(heading.textContent);
  if (component) {
    const slots: Record<string, string> = {};
    for (const child of el.querySelectorAll("[slot]")) {
      const name = child.getAttribute("slot") ?? "";
      if (name && Object.keys(slots).length < 20 && !(name in slots)) slots[clip(name, 100)] = clip(child.textContent, 200);
    }
    if (Object.keys(slots).length) out.slots = slots;
  } else if (!out.heading) {
    const text = clip(el.textContent);
    if (text) out.text = text;
  }
  return out;
}

// Outlines are recomputed only for pages whose source changed.
const outlineCache = new Map<string, { source: string; tags: string; outline: AgentPageOutline }>();

// ---- The context ----

export interface AgentSiteInput {
  repository: { id: number; fullName: string };
  branch: string;
  commit: string;
  file: EditorContext["file"];
  /** This repository and branch's browser drafts. */
  drafts: SavedDraft[];
  /** A mounted editor's text for `path`, which is newer than its stored draft. */
  mountedSource(path: string): string | undefined;
  /** The native site, when the project is one. */
  native?: {
    manifest: NativeManifest;
    hasManifest: boolean;
    /** Every file routes and components are found from (under src/). */
    files: string[];
    routeInfo(route: string): { title?: string; description?: string };
    source(path: string): string | undefined;
    exists(path: string): boolean;
    openFile?: string;
    selection?: { path: string; node?: number[]; tag: string; text: string };
  };
}

// Draft text shared with agents, in total: the rest is hashed but not sent.
const DRAFT_TEXT_BUDGET = 400 * 1024;

export async function buildAgentContext(input: AgentSiteInput): Promise<EditorContext> {
  const drafts = [...input.drafts].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 200);
  let budget = DRAFT_TEXT_BUDGET;
  const sharedDrafts: EditorContext["drafts"] = [];
  for (const draft of drafts) {
    const content = draft.deleted || draft.opaque ? undefined : input.mountedSource(draft.path) ?? draft.content;
    const entry: EditorContext["drafts"][number] = { path: draft.path, baseSha: draft.baseSha, updatedAt: draft.updatedAt };
    if (draft.deleted) entry.deleted = true;
    if (draft.movedFrom) entry.movedFrom = draft.movedFrom;
    if (content !== undefined && content.length <= 131072) {
      entry.hash = await textHash(content);
      if (content.length <= budget) {
        entry.content = content;
        budget -= content.length;
      }
    }
    sharedDrafts.push(entry);
  }
  const context: EditorContext = {
    repository: input.repository,
    branch: input.branch,
    commit: input.commit,
    file: input.file,
    drafts: sharedDrafts,
  };
  const native = input.native;
  if (!native) return context;
  const { manifest } = native;
  const newFiles = new Set(input.drafts.filter((draft) => draft.baseSha === null && !draft.deleted && !draft.movedFrom).map((draft) => draft.path));
  const tree = buildNativePagesTree({
    files: native.files,
    routes: manifest.routes,
    titles: Object.fromEntries(Object.keys(manifest.routes).map((route) => [route, native.routeInfo(route).title])),
    heading: (file) => firstHeadingText(native.source(file)),
    isNew: (file) => newFiles.has(file),
  });
  const parents = new Map<NativePageNode, string>();
  const walk = (node: NativePageNode) => node.children.forEach((child) => { parents.set(child, node.route); walk(child); });
  tree.children.forEach(walk);
  context.pages = nativeTreePages(tree)
    .filter((node) => !node.unusedFor)
    .slice(0, 500)
    .map((node) => {
      const info = node.file ? native.routeInfo(node.route) : {};
      const title = info.title?.trim() || node.label;
      return {
        route: node.route,
        ...(node.file ? { file: node.file } : {}),
        ...(title ? { title: title.slice(0, 1000) } : {}),
        ...(info.description ? { description: info.description.slice(0, 1000) } : {}),
        ...(parents.has(node) ? { parent: parents.get(node) } : {}),
        ...(node.isNew ? { isNew: true } : {}),
      };
    });
  const sectionTags = new Set<string>();
  const components: AgentSiteContext["components"] = [];
  for (const [tag, file] of Object.entries(manifest.components).slice(0, 300)) {
    const template = native.source(file) ?? "";
    const section = isSectionTemplate(template);
    if (section) sectionTags.add(tag);
    const css = file.replace(/\.html$/, ".css");
    const slots = [...new Set([...template.matchAll(/<slot\b[^>]*\bname\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi)].map((match) => (match[1] ?? match[2] ?? match[3]).slice(0, 100)))].slice(0, 50);
    components.push({ tag, file, ...(native.exists(css) ? { css } : {}), section, slots });
  }
  const tags = [...sectionTags].sort().join(",");
  const outlines: AgentPageOutline[] = [];
  for (const file of new Set(Object.values(manifest.routes))) {
    const source = native.source(file);
    if (source === undefined || outlines.length >= 500) continue;
    const cached = outlineCache.get(file);
    if (cached && cached.source === source && cached.tags === tags) {
      outlines.push(cached.outline);
      continue;
    }
    const outline: AgentPageOutline = { file, hash: await textHash(source), ...pageOutline(source, sectionTags) };
    outlineCache.set(file, { source, tags, outline });
    outlines.push(outline);
  }
  const selection = native.selection;
  const openRoute = native.openFile ? Object.entries(manifest.routes).find(([, file]) => file === native.openFile)?.[0] : undefined;
  context.site = {
    openFile: native.openFile ?? null,
    openRoute: openRoute ?? null,
    selection: selection?.node?.length
      ? { file: selection.path, id: outlineId(selection.node), tag: selection.tag.slice(0, 100), text: clip(selection.text, 200) }
      : null,
    manifest: native.hasManifest,
    components,
    styles: manifest.styles.slice(0, 100),
    settings: ["src/site.json", ".astro-editor/site.json"].find((path) => native.exists(path)) ?? null,
    outlines,
    changes: listChanges(input.drafts).slice(0, 500).map((change) => ({ kind: change.kind, path: change.path, ...(change.from ? { from: change.from } : {}) })),
  };
  return context;
}

// ---- Applying agents' changes ----

export interface AgentSiteActions {
  /** The file's text as the editor has it (open editor, draft, GitHub); undefined when there is no such file. */
  text(path: string): Promise<string | undefined>;
  isMounted(path: string): boolean;
  /** Edits the open file `path` as one undo step. Throws when it cannot. */
  replaceMounted(path: string, source: string, edit: { start: number; end: number; text: string }): void;
  /** Writes `path` as a draft (a new file when `create`), as one operation Undo takes back; an error message, or nothing. */
  writeDraft(path: string, content: string, create: boolean): Promise<string | undefined>;
  /** Opens the file (a page shows in the preview); whether it is open now. */
  open(path: string): Promise<boolean>;
  /** The Pages tab's New page; an error message, or the page made. */
  createPage(request: { parent: string; title: string; slug: string }): Promise<string | { file: string; route: string }>;
  setPageDetail(path: string, field: "title" | "description", value: string): Promise<string | undefined>;
  sectionTags(): ReadonlySet<string>;
  template(tag: string): string | undefined;
  /** The page builder's edit of the open page (applyNativeChange): whether it was made. */
  change(path: string, source: string, edits: { start: number; end: number; text: string }[], select: number[] | undefined, message: string): boolean;
  /** The page structure's drag (moveNativeSectionTo). */
  moveSection(target: { path: string; node: number[]; tag: string }, parent: number[], index: number): "moved" | "stayed" | undefined;
  /** The Files tab's rename or move, with its confirmation answered. */
  moveFile(path: string, to: string, keepOldUrl?: boolean): Promise<string | undefined>;
  deleteFile(path: string): Promise<string | undefined>;
  /** The Astro-era active-file operations. */
  legacy(command: AgentCommand): Promise<void>;
}

interface Question {
  title: string;
  notes: string[];
}
/**
 * The confirmation dialog as an agent's action sees it: every question
 * answered yes (the action it offers last), with the dialog's option
 * (Keep the old URL working) as asked, else as the dialog would preset it.
 * The change is an unsaved draft the user can still undo.
 */
export function agentAnswers<D extends {
  ask(question: Question & { action: string }): Promise<boolean>;
  choose(question: Question & { actions: { label: string; value: string }[]; option?: { label: string; checked: boolean } }): Promise<{ value?: string; option: boolean }>;
}>(dialog: D, answers: { option?: boolean }): D {
  return {
    ...dialog,
    ask: async () => true,
    choose: async (question) => ({
      value: question.actions.at(-1)?.value,
      option: answers.option ?? question.option?.checked ?? false,
    }),
  };
}

class Conflict extends Error {}

async function expectHash(actions: AgentSiteActions, path: string, expected: string | null | undefined) {
  const text = await actions.text(path);
  if (expected === undefined) return text;
  if (expected === null) {
    if (text !== undefined) throw new Conflict(`${path} exists now. Read it and edit it instead.`);
    return text;
  }
  if (text === undefined) throw new Conflict(`${path} is not there any more.`);
  if ((await textHash(text)) !== expected) throw new Conflict(`${path} changed in the editor since it was read. Read it again.`);
  return text;
}

async function openPage(actions: AgentSiteActions, path: string, expected: string | null | undefined) {
  if (!(await actions.open(path)) || !actions.isMounted(path)) throw new Conflict(`${path} could not be opened in the editor.`);
  const source = await expectHash(actions, path, expected);
  if (source === undefined) throw new Conflict(`${path} could not be read.`);
  return source;
}

const hashOf = async (actions: AgentSiteActions, path: string) => {
  const text = await actions.text(path).catch(() => undefined);
  return text === undefined ? null : await textHash(text);
};

/**
 * Applies one queued change. Resolves to what the agent is told; throws with
 * the reason when the change no longer fits (the file changed, the section
 * moved), and nothing is changed then.
 */
export async function applySiteCommand(actions: AgentSiteActions, command: AgentCommand): Promise<AgentCommandOutcome> {
  const args = command.args ?? {};
  const path = command.path;
  switch (command.operation) {
    case "update_active_draft":
    case "create_file_draft":
      await actions.legacy(command);
      return {};
    case "write_file": {
      const before = await expectHash(actions, path, command.expectedHash);
      if (before !== undefined && actions.isMounted(path)) {
        const edit = minimalTextEdit(before, command.content);
        if (edit) actions.replaceMounted(path, before, edit);
      } else {
        const error = await actions.writeDraft(path, command.content, before === undefined);
        if (error) throw new Error(error);
      }
      return {
        message: `${before === undefined ? "Created" : "Changed"} ${path} in the editor as an unsaved draft.`,
        result: { path, hash: await hashOf(actions, path) },
      };
    }
    case "create_page": {
      const title = String(args.title ?? "").trim();
      const made = await actions.createPage({ parent: String(args.parent ?? "/"), title, slug: args.slug ?? slugify(title) });
      if (typeof made === "string") throw new Error(made);
      return { message: `Created the page ${title} at ${made.route} (${made.file}), unsaved.`, result: { file: made.file, route: made.route, hash: await hashOf(actions, made.file) } };
    }
    case "set_page_details": {
      for (const field of ["title", "description"] as const) {
        const value = args[field];
        if (value === undefined) continue;
        const error = await actions.setPageDetail(path, field, value);
        if (error) throw new Error(error);
      }
      return { message: `Page details of ${path} updated, unsaved.`, result: { path, hash: await hashOf(actions, path) } };
    }
    case "add_section":
    case "move_section":
    case "remove_section": {
      const source = await openPage(actions, path, command.expectedHash);
      const tags = actions.sectionTags();
      const outline = pageOutline(source, tags);
      if (command.operation === "add_section") {
        const tag = String(args.component ?? "");
        const parent = args.container ? parseOutlineId(args.container) : [];
        const container = outline.containers.find((item) => item.id === (args.container ?? ""));
        if (!parent || !container) throw new Conflict("That place for sections is not on the page any more.");
        if (!tags.has(tag)) throw new Conflict(`<${tag}> is not a section component.`);
        const index = Math.min(Math.max(0, args.index ?? container.children), container.children);
        const edit = nativeInsertEdit(source, parent, index, tag, actions.template(tag) ?? "");
        if (!edit) throw new Conflict(`${componentLabel(tag)} could not be placed exactly in ${path}.`);
        if (!actions.change(path, source, [edit], [...parent, index], `${componentLabel(tag)} added`)) throw new Error("The section could not be added.");
        return { message: `${componentLabel(tag)} added to ${path} as section ${outlineId([...parent, index])}, unsaved.`, result: { section: outlineId([...parent, index]), hash: await hashOf(actions, path) } };
      }
      const node = parseOutlineId(String(args.section ?? ""));
      const section = outline.sections.find((item) => item.id === args.section);
      if (!node || !section || (args.tag && section.tag !== args.tag)) throw new Conflict("That section is not on the page any more. Read the page again.");
      if (command.operation === "remove_section") {
        const range = locateNativeElementRange(source, node);
        if (!range) throw new Conflict("The section's HTML could not be located exactly.");
        if (!actions.change(path, source, [removeEdit(source, range)], undefined, `${componentLabel(section.tag)} removed`)) throw new Error("The section could not be removed.");
        return { message: `Section ${section.id} removed from ${path}, unsaved.`, result: { hash: await hashOf(actions, path) } };
      }
      const parent = parseOutlineId(args.container ?? "") ?? (args.container === "" ? [] : undefined);
      if (!parent || args.index === undefined) throw new Conflict("Say where the section goes.");
      const moved = actions.moveSection({ path, node, tag: section.tag }, parent, args.index);
      if (!moved) throw new Error("The section could not be moved.");
      const from = node[node.length - 1];
      const at = [...parent, args.index > from ? args.index - 1 : args.index];
      return {
        message: moved === "stayed" ? "The section is already there." : `Section moved to ${outlineId(at)}, unsaved.`,
        result: { section: outlineId(moved === "stayed" ? node : at), hash: await hashOf(actions, path) },
      };
    }
    case "move_file": {
      const to = String(args.to ?? "");
      const error = await actions.moveFile(path, to, args.keepOldUrl);
      if (error) throw new Error(error);
      return { message: `Moved ${path} to ${to}, unsaved.`, result: { path: to } };
    }
    case "delete_file": {
      const error = await actions.deleteFile(path);
      if (error) throw new Error(error);
      return { message: `Deleted ${path}, unsaved (Restore brings it back).` };
    }
    case "open_page":
      if (!(await actions.open(path))) throw new Error(`${path} could not be opened.`);
      return { message: `Opened ${path}.` };
  }
  throw new Error("This editor cannot apply that change. Reload it.");
}

