// The editor tab's side of the MCP site tools (worker/mcp.ts): what the tab
// tells agents about the native site (pages, components, page outlines,
// drafts), and how it applies the changes agents queue, each through the
// same code the editor's own controls run, so it lands as an ordinary draft
// with Undo. main.ts supplies the editor's state and actions.
import { expandStyleImports } from "../shared/css-imports";
import { touchesGithubConfig, GITHUB_CONFIG_REFUSED } from "../shared/protected-paths";
import { NATIVE_CONFIG_PATH, minimalTextEdit, nativeComponentCssPath, nativePageStylesheets, nativeSiteSettings, type NativeSite } from "../shared/native-project";
import { AGENT_TEXT_LIMIT, INSPECTION_LIMIT, REQUEST_HTML_LIMIT, outlineId, parseOutlineId, textBytes, textHash, type AgentCommand, type AgentElement } from "../shared/agent";
import type { AgentOutlineSection, AgentPageOutline, AgentSiteContext, EditorContext } from "../shared/types";
import type { SavedDraft } from "./drafts";
import { listChanges } from "./file-changes";
import { componentLabel, isSectionTemplate, nativeInsertEdit } from "./native-insert";
import { buildNativePagesTree, firstHeadingText, nativeTreePages, slugify, type NativePageNode } from "./native-pages";
import { locateNativeElement, locateNativeElementRange, parseMarked } from "./native-source-location";
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

// ---- Elements, as agents are shown them ----

/** An element of the preview: the selection, or the one Ask agent is about. */
export interface ElementInput {
  path: string;
  node?: number[];
  tag: string;
  text: string;
  /** The page the preview shows. */
  route?: string;
  selector?: string;
  host?: { tag: string; selector: string };
}

const lineAt = (source: string, offset: number) => {
  let line = 1;
  for (let at = source.indexOf("\n"); at >= 0 && at < offset; at = source.indexOf("\n", at + 1)) line++;
  return line;
};

/**
 * The element as an agent is told it (get_selection, a request): where it
 * is (file, page, id, selector), its source and lines in the file (clipped
 * at REQUEST_HTML_LIMIT), the component it belongs to, and its text.
 * `source` is the file's text as edited.
 */
export function agentElement(input: ElementInput, site: NativeSite, source: string | undefined): AgentElement | undefined {
  if (!input.node?.length) return undefined;
  const pageRoute = Object.entries(site.routes).find(([, file]) => file === input.path)?.[0];
  const route = input.route && (!pageRoute || site.routes[input.route] === input.path) ? input.route : pageRoute ?? input.route;
  const element: AgentElement = {
    file: input.path,
    ...(route ? { route } : {}),
    id: outlineId(input.node),
    tag: input.tag.slice(0, 100),
    text: clip(input.text, 1000),
    ...(input.selector ? { selector: input.selector.slice(0, 2000) } : {}),
    ...(input.host ? { host: input.host } : {}),
  };
  if (source === undefined) return element;
  const range = locateNativeElementRange(source, input.node);
  const start = range?.start ?? locateNativeElement(source, input.node)?.start;
  const end = range?.end ?? locateNativeElement(source, input.node)?.end;
  if (start !== undefined && end !== undefined) {
    const html = source.slice(start, end);
    element.html = html.length > REQUEST_HTML_LIMIT ? html.slice(0, REQUEST_HTML_LIMIT) : html;
    if (html.length > REQUEST_HTML_LIMIT) element.htmlClipped = true;
    element.lines = { start: lineAt(source, start), end: lineAt(source, Math.max(start, end - 1)) };
  }
  // The elements from the file's root down to this one.
  const { root } = parseMarked(source);
  const chain: Element[] = [];
  let parent: ParentNode = root;
  for (const index of input.node) {
    const child: Element | undefined = parent.children[index];
    if (!child) break;
    chain.push(child);
    parent = child;
  }
  const template = Object.entries(site.components).find(([, file]) => file === input.path)?.[0];
  if (template) {
    const slot = [...chain].reverse().find((el) => el.localName === "slot");
    element.component = { tag: template, in: "template", ...(slot ? { slot: slot.getAttribute("name") ?? "" } : {}) };
  } else if (chain.length) {
    const self = chain[chain.length - 1];
    if (Object.hasOwn(site.components, self.localName)) element.component = { tag: self.localName, in: "instance" };
    else {
      const at = chain.map((el) => Object.hasOwn(site.components, el.localName)).lastIndexOf(true);
      if (at >= 0) element.component = { tag: chain[at].localName, in: "slot", slot: chain[at + 1]?.getAttribute("slot") ?? "" };
    }
  }
  return element;
}

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
    site: NativeSite;
    routeInfo(route: string): { title?: string; description?: string };
    /** A page's, template's, stylesheet's or the settings' text as edited; undefined when it was not read. */
    source(path: string): string | undefined;
    exists(path: string): boolean;
    openFile?: string;
    selection?: ElementInput;
  };
}

// A draft's hash and size, recomputed only when its text changed.
const hashCache = new Map<string, { text: string; hash: string; size: number }>();
async function measured(path: string, text: string) {
  const cached = hashCache.get(path);
  if (cached?.text === text) return cached;
  const entry = { text, hash: await textHash(text), size: textBytes(text) };
  hashCache.set(path, entry);
  return entry;
}

/**
 * The context lists every draft with its text's hash; the texts themselves
 * (each up to AGENT_TEXT_LIMIT) go apart, by hash, as the Worker asks for
 * them (src/components/agent-menu.ts), so no number of drafts crowds one out.
 */
export interface SharedContext {
  context: EditorContext;
  texts: Map<string, string>;
}

export async function buildAgentContext(input: AgentSiteInput): Promise<SharedContext> {
  const drafts = [...input.drafts].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5000);
  const texts = new Map<string, string>();
  const sharedDrafts: EditorContext["drafts"] = [];
  const paths = new Set<string>();
  for (const draft of drafts) {
    paths.add(draft.path);
    const content = draft.deleted || draft.opaque ? undefined : input.mountedSource(draft.path) ?? draft.content;
    const entry: EditorContext["drafts"][number] = { path: draft.path, baseSha: draft.baseSha, updatedAt: draft.updatedAt };
    if (draft.deleted) entry.deleted = true;
    if (draft.movedFrom) entry.movedFrom = draft.movedFrom;
    if (!draft.deleted && draft.opaque) entry.binary = true;
    if (content !== undefined) {
      const { hash, size } = await measured(draft.path, content);
      if (size <= AGENT_TEXT_LIMIT) {
        entry.hash = hash;
        texts.set(hash, content);
      } else entry.size = size;
    }
    sharedDrafts.push(entry);
  }
  for (const path of hashCache.keys()) if (!paths.has(path)) hashCache.delete(path);
  const context: EditorContext = {
    repository: input.repository,
    branch: input.branch,
    commit: input.commit,
    // The open file is read by path like any other, so its text is not sent twice.
    file: input.file && { ...input.file, original: "", content: "" },
    drafts: sharedDrafts,
  };
  const native = input.native;
  if (!native) return { context, texts };
  const { site } = native;
  const newFiles = new Set(input.drafts.filter((draft) => draft.baseSha === null && !draft.deleted && !draft.movedFrom).map((draft) => draft.path));
  const tree = buildNativePagesTree({
    routes: site.routes,
    titles: Object.fromEntries(Object.keys(site.routes).map((route) => [route, native.routeInfo(route).title])),
    heading: (file) => firstHeadingText(native.source(file)),
    isNew: (file) => newFiles.has(file),
  });
  const parents = new Map<NativePageNode, string>();
  const walk = (node: NativePageNode) => node.children.forEach((child) => { parents.set(child, node.route); walk(child); });
  tree.children.forEach(walk);
  context.pages = nativeTreePages(tree)
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
  for (const [tag, file] of Object.entries(site.components).slice(0, 300)) {
    const template = native.source(file) ?? "";
    const section = isSectionTemplate(template);
    if (section) sectionTags.add(tag);
    const css = nativeComponentCssPath(file);
    const slots = [...new Set([...template.matchAll(/<slot\b[^>]*\bname\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi)].map((match) => (match[1] ?? match[2] ?? match[3]).slice(0, 100)))].slice(0, 50);
    components.push({ tag, file, ...(native.exists(css) ? { css } : {}), section, slots });
  }
  const tags = [...sectionTags].sort().join(",");
  const outlines: AgentPageOutline[] = [];
  for (const file of new Set(Object.values(site.routes))) {
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
  const openRoute = native.openFile ? Object.entries(site.routes).find(([, file]) => file === native.openFile)?.[0] : undefined;
  context.site = {
    openFile: native.openFile ?? null,
    openRoute: openRoute ?? null,
    selection: (selection && agentElement(selection, site, native.source(selection.path))) ?? null,
    components,
    stylesheets: linkedStylesheets(site, native.source),
    settings: native.exists(NATIVE_CONFIG_PATH) ? { file: NATIVE_CONFIG_PATH, ...clipSettings(nativeSiteSettings(native.source(NATIVE_CONFIG_PATH))) } : null,
    outlines,
    changes: listChanges(input.drafts).slice(0, 5000).map((change) => ({ kind: change.kind, path: change.path, ...(change.from ? { from: change.from } : {}) })),
  };
  return { context, texts };
}

/**
 * The stylesheets the pages' heads link, in page order (the home page
 * first), each with every file it `@import`s, as the preview adopts them.
 */
export function linkedStylesheets(site: NativeSite, source: (path: string) => string | undefined): AgentSiteContext["stylesheets"] {
  const linked: string[] = [];
  for (const [, file] of Object.entries(site.routes))
    for (const path of nativePageStylesheets(source(file) ?? "", file)) if (!linked.includes(path)) linked.push(path);
  return linked.slice(0, 50).map((file) => ({
    file,
    imports: source(file) === undefined ? [] : [...expandStyleImports([file], source).imported].slice(0, 100),
  }));
}

const clipSettings = ({ name, url }: { name?: string; url?: string }) => ({
  ...(name ? { name: name.slice(0, 200) } : {}),
  ...(url && url.length <= 1000 ? { url } : {}),
});

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
  /** The preview's inspection of the page `path` shows (see native-preview.ts `inspect`). */
  inspect(request: { path: string; node?: number[]; selector?: string; limit?: number }): Promise<unknown>;
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

interface InspectionReport {
  error?: string;
  route?: string;
  matched?: number;
  elements?: Record<string, unknown>[];
  note?: string;
}

/** The report as JSON within INSPECTION_LIMIT: matching rules go first, then elements from the end. */
function fitReport(report: InspectionReport) {
  let json = JSON.stringify(report);
  if (json.length <= INSPECTION_LIMIT) return json;
  const fitted = {
    ...report,
    elements: (report.elements ?? []).map(({ rules: _rules, ...rest }) => rest),
    note: "Matching rules left out to fit. Inspect fewer elements to see them.",
  };
  json = JSON.stringify(fitted);
  while (json.length > INSPECTION_LIMIT && fitted.elements.length > 1) {
    fitted.elements.pop();
    json = JSON.stringify(fitted);
  }
  return json;
}

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
  // Last line of defence: nothing an agent queued may touch the workflows, as a
  // path, a move's destination, or a folder that holds them.
  for (const candidate of [path, args.to, args.parent])
    if (typeof candidate === "string" && touchesGithubConfig(candidate)) throw new Error(GITHUB_CONFIG_REFUSED);
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
    case "inspect_preview": {
      const node = args.element !== undefined ? parseOutlineId(args.element) : undefined;
      if (args.element !== undefined && !node) throw new Conflict(`${args.element} is not an element id.`);
      if (!(await actions.open(path))) throw new Conflict(`${path} could not be shown in the preview.`);
      const report = (await actions.inspect({
        path,
        ...(node ? { node } : {}),
        ...(args.selector ? { selector: args.selector } : {}),
        ...(args.limit ? { limit: args.limit } : {}),
      })) as InspectionReport;
      if (!report || typeof report !== "object") throw new Error("The preview could not be inspected.");
      if (report.error) throw new Conflict(report.error);
      const shown = report.elements?.length ?? 0;
      return {
        message: `Inspected ${shown} of ${report.matched ?? shown} element${report.matched === 1 ? "" : "s"} on ${report.route ?? path}.`,
        result: { report: fitReport(report) },
      };
    }
  }
  throw new Error("This editor cannot apply that change. Reload it.");
}

