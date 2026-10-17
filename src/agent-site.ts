// The editor tab's side of the MCP site tools (worker/mcp.ts): what the tab
// tells agents about the native site (pages, components, page outlines,
// drafts), and how it applies the changes agents queue, each through the
// same code the editor's own controls run, so it lands as an ordinary draft
// with Undo. main.ts supplies the editor's state and actions.
import { decodeHtmlEntities } from "./page-builder/html-entities";
import type { MoveAt, MoveOutcome } from "./page-builder/block-move";
import { expandStyleImports } from "../shared/css-imports";
import { touchesGithubConfig, GITHUB_CONFIG_REFUSED, touchesMediaRecords, MEDIA_RECORDS_REFUSED } from "../shared/protected-paths";
import { NATIVE_CONFIG_PATH, minimalTextEdit, nativeComponentCssPath, nativePageStylesheets, nativeSiteSettings, type NativeSite } from "../shared/native-project";
import { agentMediaArgsProblem } from "../shared/agent-media-args";
import { isMediaUploadWrite, OUTSIDE_MEDIA_REFUSED, AGENT_TEXT_LIMIT, INSPECTION_LIMIT, isPreviewablePicture, picturePreviewRefusal, REQUEST_HTML_LIMIT, outlineId, parseOutlineId, textBytes, textHash, type AgentCommand, type AgentElement } from "../shared/agent";
import type { AgentOutlineSection, AgentPageOutline, AgentSiteContext, EditorContext } from "../shared/types";
import { draftKey, type DraftScope, type DraftStore, type SavedDraft } from "./drafts";
import { payloadIdentity, workspaceKey, type JsonValue } from "../shared/agent-command";
import type { AgentTextCommit } from "./editor-workspace";
import type { AgentRecords } from "./agent-records";
import type { createAgentOwner } from "./agent-owner";
import { listChanges } from "./file-changes";
import { componentLabel, isSectionTemplate, nativeInsertEdit } from "./native-insert";
import { buildNativePagesTree, firstHeadingText, nativeTreePages, slugify, type NativePageNode } from "./native-pages";
import { startTagAttribute, locateNativeElement, locateNativeElementRange, parseMarked } from "./native-source-location";
import { removeEdit } from "./native-structure";
import type { GuardedEdits, Outcome } from "./guarded-edit";
import { addSectionStep, type LoaderPlanner, type SectionPlanned } from "./page-builder/component-plans";
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
    stylesheets: linkedStylesheets(site, (path) => native.source(path)),
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
  /** Guarded edits (src/guarded-edit.ts): the agent's edits of open files and sections are its plans. */
  edits: GuardedEdits;
  atomicText?(): boolean;
  /** Plans the component loader a page needs once it holds `next` (a section added). */
  loaderPlan?: LoaderPlanner;
  /** Writes `path` as a draft (a new file when `create`), as one operation Undo takes back; an error message, or nothing. */
  writeDraft(path: string, content: string, create: boolean, expected?: string): Promise<string | undefined>;
  /** Opens the file (a page shows in the preview); whether it is open now. */
  open(path: string): Promise<boolean>;
  /** The Pages tab's New page; an error message, or the page made. */
  createPage(request: { parent: string; title: string; slug: string }): Promise<string | { file: string; route: string }>;
  /** Make component on the open page, whose text must still be `source`: a refusal message, or the files and slots made. */
  makeComponent(request: { path: string; source: string; node: number[]; tag: string; fixed?: string[] }): Promise<string | {
    tag: string; files: string[]; slots: string[]; cards: string[]; notes: string[];
  }>;
  setPageDetail(path: string, field: "title" | "description", value: string): Promise<string | undefined>;
  sectionTags(): ReadonlySet<string>;
  /** Moves the proved section through the Block move module. */
  moveSection(at: MoveAt, gap: { parent: number[]; index: number }): MoveOutcome;
  /** The Files tab's rename or move, with its confirmation answered. */
  moveFile(path: string, to: string, keepOldUrl?: boolean): Promise<string | undefined>;
  deleteFile(path: string): Promise<string | undefined>;
  /** The preview's inspection of the page `path` shows (see native-preview.ts `inspect`). */
  inspect(request: { path: string; node?: number[]; selector?: string; limit?: number }): Promise<unknown>;
  listMedia(request: { folder?: string; offset: number; limit: number }): Promise<string>;
  previewMedia(path: string): Promise<{ data: string; mimeType: string; width: number; height: number; originalWidth: number; originalHeight: number }>;
  media(command: AgentCommand): Promise<void | { message: string; result: Record<string, string> }>;
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

export class Conflict extends Error {}

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

const CHANGED = (path: string) => `${path} changed in the editor since it was read. Read it again.`;
/** A guarded edit's outcome as the agent hears it: a refusal or a stale read is a conflict. */
async function guarded(pending: Promise<Outcome>) {
  const outcome = await pending;
  if (!outcome.ok) throw new Conflict(outcome.reason === "stale" ? "The page changed in the editor meanwhile. Read it again." : outcome.message);
  if (outcome.message) throw new Error(outcome.message);
}

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
  for (const candidate of [path, ...(command.operation === "change_collection" ? [] : [args.to]), args.parent, args.file, args.with, args.page, ...args.files ?? []])
    if (typeof candidate === "string" && touchesGithubConfig(candidate)) throw new Error(GITHUB_CONFIG_REFUSED);
  // edit_file queues write_file after applying its replacements.
  if (["write_file", "move_file", "delete_file"].includes(command.operation))
    for (const candidate of [path, args.to, args.parent])
      if (typeof candidate === "string" && touchesMediaRecords(candidate)) throw new Error(MEDIA_RECORDS_REFUSED);
  if (command.operation === "write_file" && isMediaUploadWrite(path)) throw new Error(OUTSIDE_MEDIA_REFUSED);
  const mediaProblem = agentMediaArgsProblem(command.operation, args, path);
  if (mediaProblem) throw new Conflict(mediaProblem);
  for (const candidate of [args.file, args.with, ...args.files ?? []])
    if (candidate && touchesMediaRecords(candidate)) throw new Error(MEDIA_RECORDS_REFUSED);
  switch (command.operation) {
    case "update_active_draft":
    case "create_file_draft":
      await actions.legacy(command);
      return {};
    case "write_file": {
      const before = await expectHash(actions, path, command.expectedHash);
      if (before !== undefined && actions.atomicText?.()) {
        const error = await actions.writeDraft(path, command.content, false, before);
        if (error) throw new Error(error);
      } else if (before !== undefined && actions.isMounted(path)) {
        const edit = minimalTextEdit(before, command.content);
        if (edit) await guarded(actions.edits.run(r => r.source(path) !== before ? { refuse: CHANGED(path) }
          : { edits: new Map([[path, [edit]]]), done: `An agent changed ${path}.`, undone: `Undid the agent's change to ${path}.` }));
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
    case "make_component": {
      const source = await openPage(actions, path, command.expectedHash);
      const node = parseOutlineId(args.element ?? "");
      if (!node) throw new Conflict("That element is not on the page any more. Read the page again.");
      const made = await actions.makeComponent({ path, source, node, tag: args.tag ?? "", ...(args.fixed !== undefined ? { fixed: args.fixed } : {}) });
      if (typeof made === "string") throw new Conflict(made);
      return {
        message: `Made <${made.tag}> from element ${args.element} on ${path}; the page has the instance, unsaved.`,
        result: {
          tag: made.tag, files: made.files.join(", "), slots: made.slots.map((name) => name || "(unnamed)").join(", "),
          cards: made.cards.join(", "), notes: made.notes.join("\n"), hash: await hashOf(actions, path),
        },
      };
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
        const unplaced = `${componentLabel(tag)} could not be placed exactly in ${path}.`;
        let planned: SectionPlanned | undefined;
        await guarded(actions.edits.run(async r => {
          // The template is read through `r`: one changed during the loader's wait refuses the step.
          const plan = await addSectionStep(r, { path, select: [...parent, index], message: `${componentLabel(tag)} added`, loader: actions.loaderPlan,
            edit: (page, reads) => {
              if (page !== source) return CHANGED(path);
              const edit = nativeInsertEdit(page, parent, index, tag, reads.template(tag)?.source ?? "");
              return edit ? [edit] : unplaced;
            } });
          if (!("refuse" in plan)) planned = plan;
          return plan;
        }, { anchor: path }));
        return { message: `${componentLabel(tag)} added to ${path} as section ${outlineId([...parent, index])}, unsaved.${planned?.added ? ` ${planned.added}` : ""}`, result: { section: outlineId([...parent, index]), hash: await hashOf(actions, path) } };
      }
      const node = parseOutlineId(String(args.section ?? ""));
      const section = outline.sections.find((item) => item.id === args.section);
      if (!node || !section || (args.tag && section.tag !== args.tag)) throw new Conflict("That section is not on the page any more. Read the page again.");
      if (command.operation === "remove_section") {
        const range = locateNativeElementRange(source, node);
        if (!range) throw new Conflict("The section's HTML could not be located exactly.");
        const label = componentLabel(section.tag);
        await guarded(actions.edits.run(r => r.source(path) !== source ? { refuse: CHANGED(path) }
          : { edits: new Map([[path, [removeEdit(source, range)]]]), done: `${label} removed`, undone: `Undid removing the ${label}.` }, { anchor: path }));
        return { message: `Section ${section.id} removed from ${path}, unsaved.`, result: { hash: await hashOf(actions, path) } };
      }
      const parent = parseOutlineId(args.container ?? "") ?? (args.container === "" ? [] : undefined);
      if (!parent || args.index === undefined) throw new Conflict("Say where the section goes.");
      const moving = actions.moveSection({ path, node, painted: source }, { parent, index: args.index });
      const outcome = moving.status === "pending" ? await moving.settled : moving;
      if (outcome.status === "stale") throw new Conflict(outcome.message);
      if (outcome.status === "refused") {
        if (outcome.failed) throw new Error(outcome.message);
        throw new Conflict(outcome.message);
      }
      const id = outlineId(outcome.status === "moved" ? outcome.node : node);
      return {
        message: outcome.status === "stayed" ? "The section is already there." : `Section moved to ${id}, unsaved.`,
        result: { section: id, hash: await hashOf(actions, path) },
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
    case "frame_image": {
      const source = await openPage(actions, path, command.expectedHash);
      const node = parseOutlineId(args.element!)!;
      const range = locateNativeElementRange(source, node);
      if (!range || range.tag.name !== "img") throw new Conflict("That element is not an image; place_media fills an existing image. Add a section or component with an image first.");
      const outcome = (await actions.media(command))!;
      return { ...outcome, result: { ...outcome.result, hash: await hashOf(actions, path) } };
    }
    case "place_media": {
      // Loaded first, so nothing awaits between the page's hash check and the placement's own proof.
      const { locatePageElement } = await import("./page-builder/media-insert");
      const source = await openPage(actions, path, command.expectedHash);
      const node = parseOutlineId(args.element!)!;
      const range = locatePageElement(source, node);
      if (!range) throw new Conflict("That element is no longer on the page.");
      const outcome = await actions.media(command);
      if (outcome) return { ...outcome, result: { ...outcome.result, hash: await hashOf(actions, path) } };
      const placedSource = await actions.text(path) ?? "";
      const placed = locateNativeElement(placedSource, node);
      return { message: `Placed ${args.file} in ${args.element} on ${path}, unsaved.`, result: { hash: await hashOf(actions, path), alt: decodeHtmlEntities(placed ? startTagAttribute(placedSource, placed, "alt")?.value ?? "" : "", true) } };
    }
    case "describe_media":
      if (args.page) await openPage(actions, args.page, command.expectedHash);
      await actions.media(command);
      return { message: `Changed description of ${args.file}, unsaved.`, result: { hash: await hashOf(actions, args.page ?? ".editor/media.json") } };
    case "loop_video":
      await openPage(actions, path, command.expectedHash);
      return (await actions.media(command))!;
    case "improve_images":
    case "video_still":
    case "write_subtitles":
    case "remove_media":
    case "keep_media":
    case "restore_media":
    case "replace_media":
    case "adding_settings":
      return (await actions.media(command))!;
    case "change_collection":
      await actions.media(command);
      return { message: `Changed collection ${args.name}, unsaved.` };
    case "list_media": {
      const report = await actions.listMedia({ folder: args.folder, offset: args.offset ?? 0, limit: args.limit ?? 100 });
      const { count, total } = JSON.parse(report);
      return { message: `Listed ${count} of ${total} media files.`, result: { report } };
    }
    case "preview_media": {
      if (!isPreviewablePicture(path)) throw new Error(picturePreviewRefusal(path));
      return { message: `Previewed ${path}.`, result: { ...await actions.previewMedia(path) } };
    }
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

// One lazy records/owner pair per workspace in this tab. Focus never transfers ownership.
const textOwners = new Map<string, Promise<{ records: AgentRecords; owner: ReturnType<typeof createAgentOwner> }>>();
/** Carries a command's identity and exact reported outcome across the guarded commit boundary. */
export async function prepareAgentText(command: AgentCommand, scope: DraftScope, store: DraftStore, current: () => boolean, flushTyping: (scope: DraftScope, paths: string[]) => void,
  afterSettle: () => void = () => {}) {
  command = structuredClone(command);
  scope = { ...scope };
  // Storage refusals (src/agent-records.ts) say what happened; nothing was applied and drafts are as they were.
  const refuse = (error: unknown): never => {
    const code = error instanceof Error && error.name === "AgentRecordsError" ? (error as Error & { code: string }).code : undefined;
    if (code === undefined && error instanceof Error && /meanwhile|changed in the editor/.test(error.message)) throw error;
    const reason = code === "conflict" ? `${command.path} or agent ownership changed in the editor meanwhile. Read it again.`
      : code === "revoked" ? "This agent connection was disconnected (its authorization was revoked)."
      : code === "cancelled" ? "The change was cancelled before it was applied."
      : code === "duplicate-id" ? `This change's id was already used for different work (${(error as Error).message}).`
      : code === "not-owner" ? "Another editor tab receives agent edits for this site."
      : `Agent edits are paused: this browser could not save the change (${error instanceof Error ? error.message : "browser storage failed"}).`;
    throw new Error(`${reason} Nothing was changed; your drafts are as they were.`);
  };
  if (!command.grantId) throw new Error("Agent text edits require an authorization id (grantId).");
  const workspace = { account: scope.account, repoId: scope.repoId, branch: scope.branch };
  const key = workspaceKey(workspace);
  // The identity names the text by its hash: receipts never hold file contents.
  const contentHash = await textHash(command.content);
  if (command.contentHash && command.contentHash !== contentHash) throw new Error("Command content does not match its content hash.");
  const identity = payloadIdentity(JSON.parse(JSON.stringify({ operation: command.operation, path: command.path,
    branch: command.branch, commit: command.commit, expectedHash: command.expectedHash, contentHash, args: command.args })) as JsonValue);
  try {
    let loading = textOwners.get(key);
    if (!loading) {
      loading = (async () => {
        const [{ indexedDbAgentRecords }, { createAgentOwner }] = await Promise.all([import("./agent-records"), import("./agent-owner")]);
        const records = indexedDbAgentRecords();
        const state = await records.workspace(workspace);
        return { records, owner: createAgentOwner({ workspace, generation: state.generation, records,
          reload: async () => { throw new Error("Agent takeover is not available yet."); } }) };
      })();
      textOwners.set(key, loading);
      void loading.catch(() => { if (textOwners.get(key) === loading) textOwners.delete(key); });
    }
    const { records, owner } = await loading;
    if (!current()) throw new Error("The repository changed meanwhile.");
    const outcome = { message: `Changed ${command.path} in the editor as an unsaved draft.`, result: { path: command.path, hash: contentHash } };
    const receipt = { authorizationId: command.grantId, operationId: command.id, payloadIdentity: identity, outcome, createdAt: Date.now() };
    const existing = await records.receipt(workspace, command.id, command.grantId);
    if (!current()) throw new Error("The repository changed meanwhile.");
    if (existing) {
      // Commit performs the identity and revocation checks again in the transaction returning the receipt.
      const result = await owner.commit({ workspace, generation: owner.generation, expectedRevision: 0, expectedDrafts: [], drafts: [], receipt });
      return { duplicate: result.receipt.outcome as AgentCommandOutcome };
    }
    let expectedRevision = 0, committed = false;
    const context: AgentTextCommit = {
      async fence(draftScope, paths) {
        flushTyping(draftScope, paths);
        const release = await store.fenceAgent(draftScope, paths);
        try {
          if (!current()) throw new Error("The repository changed meanwhile.");
          expectedRevision = (await records.workspace(workspace)).revision;
          if (!current()) throw new Error("The repository changed meanwhile.");
          return release;
        } catch (error) { release(); return refuse(error); }
      },
      async commit(before, after, valid) {
        store.stageAgent(after);
        if (!current() || !valid()) throw new Error("The repository or source changed meanwhile.");
        try {
          const result = await owner.commit({ workspace, generation: owner.generation, expectedRevision,
            expectedDrafts: [...before].map(([path, record]) => [draftKey(scope, path), record ?? null]),
            drafts: [...after].map(([path, record]) => [draftKey(scope, path), record ?? null]), receipt });
          committed = true;
          return !result.duplicate;
        } catch (error) { return refuse(error); }
      },
      publish: (changes, apply) => {
        const result = store.publishAgent(scope, changes, apply);
        store.announceAgent(scope, [...changes.keys()]);
        return result;
      },
      async settle(changes) {
        await store.refresh([...changes.keys()].map(path => draftKey(scope, path)));
        store.announceAgent(scope, [...changes.keys()]);
        afterSettle();
      },
    };
    return { context, outcome, get applied() { return committed; }, async finish(valid: () => boolean) {
      if (committed) return;
      const release = await context.fence(scope, [command.path]);
      try {
        const before = new Map([[command.path, store.get(scope, command.path)]]);
        await context.commit(before, new Map(), valid);
      } finally { release(); }
    } };
  } catch (error) { return refuse(error); }
}
