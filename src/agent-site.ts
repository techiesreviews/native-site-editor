// The editor tab's side of the MCP site tools (worker/mcp.ts): what the tab
// tells agents about the native site (pages, components, page outlines,
// drafts), and how it applies the changes agents queue, each through the
// same code the editor's own controls run, so it lands as an ordinary draft
// with Undo. main.ts supplies the editor's state and actions.
import { agentCommandFiles, agentCommandSignals, mediaCommandPins, siteCommandPins } from "./agent-tools";
import type { AgentReadFiles } from "./agent-tools-read";
import { sameBranch } from "./workspace-session";
import { decodeHtmlEntities } from "./page-builder/html-entities";
import type { MoveAt, MoveOutcome } from "./page-builder/block-move";
import { expandStyleImports } from "../shared/css-imports";
import { touchesGithubConfig, GITHUB_CONFIG_REFUSED, touchesMediaRecords, MEDIA_RECORDS_REFUSED } from "../shared/protected-paths";
import { nativePageRoute } from "../shared/native-routes";
import { isNewDraft, newDraftPaths } from "../shared/site-overlay";
import { NATIVE_CONFIG_PATH, minimalTextEdit, nativeComponentCssPath, nativePageStylesheets, nativeSiteSettings, type NativeSite } from "../shared/native-project";
import { agentMediaArgsProblem } from "../shared/agent-media-args";
import { mediaChanges, type MediaTool } from "../shared/agent-media";
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
import type { createGuardedEdits, EditorWorkspace, GuardedEdits, NodeRef, Outcome, Reads } from "./guarded-edit";
import { addSectionStep, type LoaderPlanner, type SectionPlanned } from "./page-builder/component-plans";
import type { AgentCommandOutcome } from "./components/agent-menu";
import type { MediaPin } from "./controllers/media-controller";

import type { createPagesController } from "./controllers/pages-controller";
import type { createLazyFileOperationsController } from "./controllers/file-operation-checks";
import type { createComponentTools, ComponentDeps } from "./page-builder/components";
import type { createBlockMoves } from "./page-builder/block-move";
import type { withPageField } from "./page-builder/site-head";

/** The editor's own factories, passed in so this lazy chunk shares the boot modules instead of splitting them. */
export interface AgentStructuralFactories {
  createGuardedEdits: typeof createGuardedEdits;
  createPagesController: typeof createPagesController;
  createLazyFileOperationsController: typeof createLazyFileOperationsController;
  createBlockMoves: typeof createBlockMoves;
  withPageField: typeof withPageField;
}

/** Only these commands enter the draft/receipt transaction. Media has its own admission in ticket 08. */
export function atomicAgentCommand(command: AgentCommand) {
  return ["update_active_draft", "create_file_draft", "write_file", "create_page", "set_page_details", "make_component", "add_section", "move_section", "remove_section", "move_file", "delete_file"].includes(command.operation);
}

// The workspace keeps one dispatcher; command listeners live only as long as their history step.
const agentMounts = new WeakMap<EditorWorkspace, Set<(path: string, pane: boolean) => void>>();

/**
 * A command owns these controllers and this edit adapter. No ambient flag redirects manual edits.
 * All plans take the asynchronous commit path, including a mounted section move.
 */
export function agentStructuralActions(workspace: EditorWorkspace, context: AgentTextCommit, current: () => boolean, ports: {
  actions(edits: GuardedEdits, atomic: boolean): AgentSiteActions;
  pages: Parameters<typeof createPagesController>[0];
  files: Parameters<typeof createLazyFileOperationsController>[0];
  components(): ComponentDeps;
  loader?(path: string, text: string, reads: Reads, check: () => Promise<void>): ReturnType<LoaderPlanner>;
  factories: AgentStructuralFactories;
  /** The page a step belongs to when it names none and none is open (a background site's, ticket 34). */
  home?: string;
}) {
  const { createGuardedEdits, createPagesController, createLazyFileOperationsController, createBlockMoves, withPageField } = ports.factories;
  let keepAddress: boolean | undefined;
  let active = true, claimed = false, tools: ReturnType<typeof createComponentTools> | undefined;
  let recorded = false;
  let mounts = agentMounts.get(workspace);
  if (!mounts) {
    const listeners = new Set<(path: string, pane: boolean) => void>();
    workspace.onMount((path, pane) => { for (const listener of listeners) listener(path, pane); });
    agentMounts.set(workspace, mounts = listeners);
  }
  let mount: ((path: string, pane: boolean) => void) | undefined, history = false;
  const stopMount = () => { if (mount) mounts.delete(mount); };
  let planned: { after?: NodeRef; creates?: string[]; added?: string } | undefined;
  const commandContext: AgentTextCommit = { ...context, async commit(before, after, valid) {
    const result = await context.commit(before, after, valid, planned);
    recorded = true;
    return result;
  } };
  const agentWorkspace: EditorWorkspace & { agentText(): AgentTextCommit } = { ...workspace, agentActing: () => true, agentText: () => commandContext,
    onMount: listener => { mount = listener; mounts.add(listener); },
    recordHistory(path, undo, redo, dispose) {
      history = workspace.recordHistory(path, undo, redo, () => { try { dispose(); } finally { stopMount(); } });
      return history;
    },
  };
  const edits = createGuardedEdits(agentWorkspace);
  const finishProofs = new Map<string, () => boolean>();
  const readDrafts = new Map<string, SavedDraft | undefined>();
  const valid = () => active && current();
  const verify = () => { if (!valid()) throw new Error("The repository or source changed meanwhile."); };
  const checkReads = async () => {
    const prove = () => { verify(); if ([...finishProofs.values()].some(proof => !proof())) throw new Error("The repository or source changed meanwhile."); };
    prove();
    await context.check?.();
    prove();
  };
  // Wrap preparation ports only: postcommit refreshes recover from the durable outcome instead.
  const checked = <T extends object>(target: T): T => new Proxy(target, { get(target, key, receiver) {
    const value = Reflect.get(target, key, receiver);
    if (typeof value !== "function") return value;
    return (...args: unknown[]) => {
      verify();
      const held = edits.stamp("repository");
      const result = Reflect.apply(value, target, args);
      if (!(result instanceof Promise)) return result;
      return result.then(async result => {
        verify();
        if (!held.holds()) throw new Error("The repository or source changed meanwhile.");
        if (recorded) await context.check?.();
        else await checkReads();
        verify();
        if (!held.holds()) throw new Error("The repository or source changed meanwhile.");
        return result;
      });
    };
  } });
  const scoped: GuardedEdits = { ...edits,
    async run(plan, options) {
      verify();
      if (claimed) throw new Error("An agent command must use one guarded edit.");
      claimed = true;
      // Another page shown meanwhile stops nothing: the step lands on its page (ticket 23, `finish`).
      const held = options?.since ?? edits.stamp(), kept = () => { const key = held.changed(); return key === undefined || key === "route" || key === "edit-mode"; };
      finishProofs.set("stamp", () => kept() && (options?.guard?.() ?? true));
      await context.check?.();
      verify();
      let selection: { after: NodeRef; flash?: string } | undefined;
      const outcome = await edits.run(async r => {
        // Keep the plan's original proof for finish(), including plans that turn out unchanged.
        // A manual edit during its final fence must not earn a receipt for the earlier no-op.
        const scope = workspace.draftScope()!;
        const remember = (path: string, text: string | undefined) => {
          if (finishProofs.has(`source:${path}`)) return;
          const record = workspace.store.get(scope, path), model = workspace.model(path);
          readDrafts.set(path, record);
          finishProofs.set(`source:${path}`, () => workspace.source(path) === text && workspace.store.get(scope, path) === record && model.isCurrent());
        };
        const reads: Reads = {
          source(path) { const text = r.source(path); remember(path, text); return text; },
          exists(path) { const found = r.exists(path); if (!finishProofs.has(`exists:${path}`)) finishProofs.set(`exists:${path}`, () => workspace.exists(path) === found); return found; },
          site() { const site = r.site(), key = JSON.stringify(site); if (!finishProofs.has("site")) finishProofs.set("site", () => JSON.stringify(workspace.site()) === key); return site; },
          template(tag) {
            const template = r.template(tag), path = workspace.site()?.components[tag];
            if (!finishProofs.has(`template:${tag}`)) finishProofs.set(`template:${tag}`, () => workspace.site()?.components[tag] === path);
            if (template) remember(template.path, template.source);
            return template;
          },
        };
        const result = await plan(checked(reads));
        await checkReads();
        verify();
        if ("done" in result) {
          const added: unknown = (result as Partial<SectionPlanned>).added;
          // Make component names its files as the created ones plus the loader's page and stylesheet edits.
          const loaderEdits = (result as { loader?: { edits?: Map<string, unknown> } }).loader?.edits;
          const creates = result.creates?.map(file => file.path) ?? [];
          planned = { after: result.select?.after, creates: [...new Set([...creates, ...loaderEdits?.keys() ?? []])], ...typeof added === "string" && added ? { added } : {} };
        }
        // historyOnly keeps the step on the staged commit; the plan's own selection follows once it applied.
        if ("done" in result && !result.select?.historyOnly && result.select?.after) selection = { after: result.select.after, flash: result.select.flash };
        return "done" in result ? { ...result, select: { ...result.select, historyOnly: true } } : result;
      }, { ...options, ...ports.home !== undefined && options?.anchor === undefined ? { anchor: ports.home } : {}, since: held, guard: () => valid() && (options?.guard?.() ?? true), finish: true });
      // A step that landed on a page not shown selects nothing there.
      if (selection && outcome.ok && outcome.status === "applied" && !outcome.message && valid() && workspace.openFile() === selection.after.path)
        workspace.select({ ...selection.after, source: workspace.source(selection.after.path) }, selection.flash);
      return outcome;
    },
    now() { throw new Error("Agent commands require an asynchronous guarded commit."); },
  };
  const pages = createPagesController({ ...checked(ports.pages), edits: scoped });
  const files = createLazyFileOperationsController({ ...checked(ports.files), edits: scoped,
    requestAnimationFrame: task => ports.files.requestAnimationFrame(() => { if (valid()) task(); }),
    // Agent answers belong to these ports, never the user's confirmation dialog.
    confirmDialog: () => ({ ask: async () => true, choose: async question => ({ value: question.actions.at(-1)?.value, option: keepAddress ?? question.option?.checked ?? false }) }),
  }, () => import("./controllers/file-operations-controller"));
  const moves = createBlockMoves({ edits: scoped, editing: () => undefined, mounted: () => false, forgetOpening: () => () => {} });
  const base = ports.actions(scoped, true);
  const loader: LoaderPlanner | undefined = ports.loader ? (path, text, reads) => ports.loader!(path, text, reads, checkReads) : checked(base).loaderPlan;
  const actions: AgentSiteActions = { ...checked(base), edits: scoped,
    loaderPlan: loader,
    async createPage(request) {
      const plan = pages.planNew(request);
      if (!plan.ok) return plan.error;
      return (await pages.createNew(request)) ?? { file: plan.value.file, route: plan.value.route };
    },
    async makeComponent(request) {
      const module = await import("./page-builder/components");
      await context.check?.();
      verify();
      const component = ports.components(), preparation = checked(component);
      tools ??= module.createComponentTools({ ...component, index: preparation.index, loaderPlan: loader ?? preparation.loaderPlan, edits: scoped });
      return tools.makeFromAgent(request);
    },
    async setPageDetails(path, details) {
      const result = await scoped.run(r => {
        if (!Object.values(r.site()?.routes ?? {}).includes(path)) return { refuse: "This page has no URL in the site." };
        const source = r.source(path);
        if (source === undefined) return { refuse: "The page could not be read." };
        let text = source;
        for (const field of ["title", "description"] as const) if (details[field] !== undefined) text = withPageField(text, field, details[field]!);
        return { edits: new Map([[path, text]]), done: "Page details updated", undone: "Undid changing page details." };
      });
      return result.message;
    },
    moveSection: (at, gap) => moves.move(at, { gap, section: true }),
    moveFile: (path, to, keepOldUrl) => {
      keepAddress = keepOldUrl;
      const target = fileTarget(path);
      return target ? files.moveFileTarget(target, to, ports.files.parentOf(path) === ports.files.parentOf(to) ? "rename" : "move", { keepOldAddress: keepOldUrl }) : Promise.resolve(`${path} does not exist.`);
    },
    deleteFile: path => { const target = fileTarget(path); return target ? files.deleteFileTarget(target, undefined, true) : Promise.resolve(`${path} does not exist.`); },
  };
  function fileTarget(path: string) {
    const now = ports.files.pathNow(path, ports.files.treeState());
    return now === "file" || now === "folder" ? { path, name: path.slice(path.lastIndexOf("/") + 1), folder: now === "folder" } : undefined;
  }
  return { actions, readDrafts, current: () => valid() && [...finishProofs.values()].every(proof => proof()), dispose() {
    try { tools?.destroy(); } catch { /* Panel cleanup cannot change the command's recorded outcome. */ }
    finally { active = false; if (!history) stopMount(); }
  } };
}

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
  const newFiles = new Set(newDraftPaths(input.drafts, { moved: false }));
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
  setPageDetails?(path: string, details: { title?: string; description?: string }): Promise<string | undefined>;
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
 * Last line of defence, for every write an agent queued (here and finishAgentTextElsewhere): nothing
 * may touch the workflows, as a path, a move's destination, or a folder that holds them; nor the
 * media records, nor media files as text.
 */
function refuseProtected(command: AgentCommand) {
  const args = command.args ?? {}, path = command.path;
  for (const candidate of [path, ...(command.operation === "change_collection" ? [] : [args.to]), args.parent, args.file, args.with, args.page, ...args.files ?? []])
    if (typeof candidate === "string" && touchesGithubConfig(candidate)) throw new Error(GITHUB_CONFIG_REFUSED);
  // edit_file queues write_file after applying its replacements.
  if (["write_file", "move_file", "delete_file"].includes(command.operation))
    for (const candidate of [path, args.to, args.parent])
      if (typeof candidate === "string" && touchesMediaRecords(candidate)) throw new Error(MEDIA_RECORDS_REFUSED);
  if (command.operation === "write_file" && isMediaUploadWrite(path)) throw new Error(OUTSIDE_MEDIA_REFUSED);
}

/**
 * Applies one queued change. Resolves to what the agent is told; throws with
 * the reason when the change no longer fits (the file changed, the section
 * moved), and nothing is changed then.
 */
export async function applySiteCommand(actions: AgentSiteActions, command: AgentCommand): Promise<AgentCommandOutcome> {
  if (command.operation === "update_active_draft" || command.operation === "create_file_draft") {
    if (command.operation === "update_active_draft" && !actions.isMounted(command.path)) throw new Error("Open the file in the editor first.");
    command = { ...command, operation: "write_file", expectedHash: command.operation === "create_file_draft" ? null : command.expectedHash };
  }
  refuseProtected(command);
  const args = command.args ?? {};
  const path = command.path;
  const mediaProblem = agentMediaArgsProblem(command.operation, args, path);
  if (mediaProblem) throw new Conflict(mediaProblem);
  for (const candidate of [args.file, args.with, ...args.files ?? []])
    if (candidate && touchesMediaRecords(candidate)) throw new Error(MEDIA_RECORDS_REFUSED);
  switch (command.operation) {
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
      if (actions.setPageDetails) {
        const error = await actions.setPageDetails(path, args);
        if (error) throw new Error(error);
      } else for (const field of ["title", "description"] as const) {
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
      const changing = args.shape !== undefined || args.focus !== undefined || args.trim !== undefined;
      const source = await (changing ? openPage(actions, path, command.expectedHash) : expectHash(actions, path, command.expectedHash));
      if (source === undefined) throw new Conflict(`${path} could not be read.`);
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
      if (args.looping !== undefined) await openPage(actions, path, command.expectedHash);
      else await expectHash(actions, path, command.expectedHash);
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

/** A structural command's reply, from the drafts it commits (the same words applySiteCommand reports). */
async function structuralOutcome(command: AgentCommand, after: Map<string, SavedDraft | undefined>,
  plan?: { after?: { node: number[] }; creates?: string[]; added?: string }): Promise<AgentCommandOutcome> {
  const { path, args = {} } = command;
  const hash = async (file: string): Promise<Record<string, string>> => {
    const record = after.get(file);
    return record && !record.deleted && !record.opaque ? { hash: await textHash(record.content) } : {};
  };
  // A plan that needed no change commits only its receipt.
  if (!after.size) return { message: `Nothing needed changing; ${path} is as it was.`, result: { path } };
  switch (command.operation) {
    case "create_page": {
      const file = [...after].find(([file, record]) => isNewDraft(record, { moved: false }) && nativePageRoute(file))?.[0];
      const route = file && nativePageRoute(file);
      if (!file || !route) break;
      return { message: `Created the page ${String(args.title ?? "").trim()} at ${route} (${file}), unsaved.`, result: { file, route, ...await hash(file) } };
    }
    case "set_page_details": return { message: `Page details of ${path} updated, unsaved.`, result: { path, ...await hash(path) } };
    case "move_file": return { message: `Moved ${path} to ${String(args.to ?? "")}, unsaved.`, result: { path: String(args.to ?? "") } };
    case "delete_file": return { message: `Deleted ${path}, unsaved (Restore brings it back).` };
    case "remove_section": return { message: `Section ${args.section} removed from ${path}, unsaved.`, result: { ...await hash(path) } };
    case "add_section": case "move_section": {
      if (!plan?.after) break;
      const section = outlineId(plan.after.node);
      return { message: command.operation === "add_section" ? `${componentLabel(String(args.component ?? ""))} added to ${path} as section ${section}, unsaved.${plan.added ? ` ${plan.added}` : ""}` : `Section moved to ${section}, unsaved.`,
        result: { section, ...await hash(path) } };
    }
    case "make_component":
      return { message: `Made a component from element ${args.element} on ${path}; the page has the instance, unsaved.`,
        result: { files: (plan?.creates ?? []).join(", "), ...await hash(path) } };
  }
  return { message: `Applied ${command.operation} to ${path} in the local drafts, unsaved.`, result: { path, ...await hash(path) } };
}

// One lazy records/owner pair per workspace in this tab. Focus never transfers ownership.
const textOwners = new Map<string, Promise<{ records: AgentRecords; owner: ReturnType<typeof createAgentOwner> }>>();
/** Carries a command's identity and exact reported outcome across the guarded commit boundary. */
export async function prepareAgentText(command: AgentCommand, scope: DraftScope, store: DraftStore, current: () => boolean, flushTyping: (scope: DraftScope, paths: string[]) => void,
  afterSettle: () => void = () => {}) {
  const signal = agentCommandSignals.get(command);
  signal?.throwIfAborted();
  command = structuredClone(command);
  scope = { ...scope };
  // Storage refusals (src/agent-records.ts) say what happened; nothing was applied and drafts are as they were.
  const refuse = (error: unknown): never => {
    const code = error instanceof Error && error.name === "AgentRecordsError" ? (error as Error & { code: string }).code : undefined;
    const reason = code === undefined && error instanceof Error && /meanwhile|changed in the editor/.test(error.message) ? error.message
      : code === "conflict" ? `${command.path} or agent ownership changed in the editor meanwhile. Read it again.`
      : code === "revoked" ? "This agent connection was disconnected (its authorization was revoked)."
      : code === "cancelled" ? "The change was cancelled before it was applied."
      : code === "duplicate-id" ? `This change's id was already used for different work (${(error as Error).message}).`
      : code === "not-owner" ? "Another editor tab receives agent edits for this site."
      : `Agent edits are paused: this browser could not save the change (${error instanceof Error ? error.message : "browser storage failed"}).`;
    // Whether the edit was kept is unproven: say so instead of claiming nothing changed.
    if (code === "unknown") throw new Error((error as Error).message);
    throw new Error(`${reason} Nothing was changed; your drafts are as they were.`);
  };
  if (!command.grantId) throw new Error("Agent edits require an authorization id (grantId).");
  const workspace = { account: scope.account, repoId: scope.repoId, branch: scope.branch };
  const key = JSON.stringify([workspaceKey(workspace), command.ownerGeneration ?? null]);
  // The identity names the text by its hash: receipts never hold file contents.
  const contentHash = await textHash(command.content);
  if (!current()) return refuse(new Error("The repository changed meanwhile."));
  if (command.contentHash && command.contentHash !== contentHash) throw new Error("Command content does not match its content hash.");
  const identity = command.requestIdentity ?? payloadIdentity(JSON.parse(JSON.stringify({ operation: command.operation, path: command.path,
    branch: command.branch, commit: command.commit, expectedHash: command.expectedHash, contentHash, args: command.args })) as JsonValue);
  try {
    let loading = textOwners.get(key);
    if (!loading) {
      loading = (async () => {
        const [{ indexedDbAgentRecords }, { createAgentOwner }] = await Promise.all([import("./agent-records"), import("./agent-owner")]);
        const records = indexedDbAgentRecords();
        const state = await records.workspace(workspace);
        return { records, owner: createAgentOwner({ workspace, fence: command.ownerGeneration ?? state.generation, records,
          reload: async () => {} }) };
      })();
      textOwners.set(key, loading);
      void loading.catch(() => { if (textOwners.get(key) === loading) textOwners.delete(key); });
    }
    const { records, owner } = await loading;
    if (!current()) throw new Error("The repository changed meanwhile.");
    let outcome: AgentCommandOutcome = command.operation === "write_file"
      ? { message: `${command.expectedHash === null ? "Created" : "Changed"} ${command.path} in the editor as an unsaved draft.`, result: { path: command.path, hash: contentHash } }
      : { message: `Applied ${command.operation} to the local drafts.`, ...(command.operation === "create_page" ? {} : { result: { path: command.operation === "move_file" ? command.args?.to ?? command.path : command.path } }) };
    const receipt = { authorizationId: command.grantId, operationId: command.id, payloadIdentity: identity, outcome: JSON.parse(JSON.stringify(outcome)) as JsonValue, createdAt: Date.now(), issuedAt: command.createdAt };
    const existing = await records.receipt(workspace, command.id, command.grantId);
    if (!current()) throw new Error("The repository changed meanwhile.");
    if (existing) {
      // Commit performs the identity and revocation checks again in the transaction returning the receipt.
      const result = await owner.commit({ workspace, fence: owner.fence, expectedRevision: 0, expectedDrafts: [], drafts: [], receipt });
      if (!current()) throw new Error("The repository changed meanwhile.");
      return { duplicate: result.receipt.outcome as AgentCommandOutcome };
    }
    let expectedRevision = 0, committed = false;
    let lastAfter = new Map<string, SavedDraft | undefined>();
    const check = async () => {
      signal?.throwIfAborted();
      if (!current() || owner.paused) throw new Error("The repository or agent ownership changed meanwhile.");
      const state = await records.workspace(workspace);
      if (!current() || owner.paused || state.generation !== owner.fence || state.paused) throw new Error("The repository or agent ownership changed meanwhile.");
      // Revocation and cancellation are serialized with the eventual write by owner.commit.
      return state;
    };
    const context: AgentTextCommit = {
      check: async () => { await check(); },
      async fence(draftScope, paths) {
        flushTyping(draftScope, paths);
        const release = await store.fenceAgent(draftScope, paths);
        try {
          if (!current()) throw new Error("The repository changed meanwhile.");
          expectedRevision = (await check()).revision;
          if (!current()) throw new Error("The repository changed meanwhile.");
          return release;
        } catch (error) { release(); return refuse(error); }
      },
      async commit(before, after, valid, plan) {
        if (committed) throw new Error("An agent command must use one guarded commit.");
        signal?.throwIfAborted();
        store.stageAgent(after);
        if (command.operation !== "write_file") {
          // The recorded outcome is the reply: a duplicate delivery gets the same files, route and hash.
          outcome = await structuralOutcome(command, after, plan);
          receipt.outcome = JSON.parse(JSON.stringify(outcome)) as JsonValue;
        }
        signal?.throwIfAborted();
        if (!current() || !valid()) throw new Error("The repository or source changed meanwhile.");
        try {
          const result = await owner.commit({ workspace, fence: owner.fence, expectedRevision,
            expectedDrafts: [...before].map(([path, record]) => [draftKey(scope, path), record ?? null]),
            drafts: [...after].map(([path, record]) => [draftKey(scope, path), record ?? null]), receipt });
          lastAfter = after;
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
        await store.settleAgent([...changes.keys()].map(path => draftKey(scope, path)));
        store.announceAgent(scope, [...changes.keys()]);
        afterSettle();
      },
    };
    const recover = async () => { try { await context.settle(lastAfter); } catch { /* The receipt still proves application when the view cannot refresh. */ } };
    return { context, get outcome() { return outcome; }, recover, get applied() { return committed; }, async finish(valid: () => boolean, reads?: ReadonlyMap<string, SavedDraft | undefined>) {
      if (committed) return;
      const release = await context.fence(scope, [...new Set([command.path, ...reads?.keys() ?? []])]);
      try {
        const before = new Map(reads ?? [[command.path, store.get(scope, command.path)]]);
        await context.commit(before, new Map(), valid);
      } finally { release(); }
    } };
  } catch (error) { return refuse(error); }
}

/** A Media change that holds the workspace it arrived in (ticket 27): it runs there, in its background page, whatever is shown. */
export const pinnedMedia = (command: AgentCommand) => mediaCommandPins.has(command);
/** The workspace a pinned Media change wrote in, while another is shown (its finished-work note, ticket 24); none for a read. */
export function pinnedMediaAway(command: AgentCommand) {
  const pin = mediaCommandPins.get(command)?.pin;
  return pin && !pin.here() && mediaChanges(command.operation as MediaTool, command.args ?? {}) ? pin.scope : undefined;
}

/**
 * The site actions a pinned Media change runs with (ticket 27): while another workspace is shown, or
 * another page of its own when its page was the one open as it arrived (`openFile`: the page open
 * now), its page is read from its own workspace (its draft there, else its branch text) and nothing
 * is opened, so Lex is never taken back to it; on its page they are the editor's.
 */
export function pinnedMediaActions(actions: AgentSiteActions, command: AgentCommand, openFile: () => string | undefined): AgentSiteActions {
  const held = mediaCommandPins.get(command);
  if (!held) return actions;
  const { pin } = held, left = () => !pin.here() || held.opened === command.path && openFile() !== command.path;
  return { ...actions,
    text: async path => left() ? pin.source(path) : actions.text(path),
    open: async path => left() ? true : actions.open(path),
    isMounted: path => left() || actions.isMounted(path),
  };
}

/**
 * The editor path of an agent command (ticket 23): when it fails before its write was kept and another
 * workspace is shown by then, the write finishes where it was read (`elsewhere`, finishAgentTextElsewhere)
 * instead of refusing; otherwise its own reason stands.
 */
export async function editorOrElsewhere<T>(editor: () => Promise<T>, applied: () => boolean, moved: () => boolean, elsewhere: () => Promise<T | undefined>): Promise<T> {
  try { return await editor(); }
  catch (error) {
    const done = !applied() && moved() ? await elsewhere() : undefined;
    if (done !== undefined) return done;
    throw error;
  }
}

type PreparedText = Awaited<ReturnType<typeof prepareAgentText>>;
/** The commands that finish in a background site while another workspace is shown (ticket 34). */
const AWAY_COMMANDS = new Set(["create_page", "set_page_details", "make_component", "add_section", "move_section", "remove_section", "move_file", "delete_file"]);
/**
 * A page or file command run through its own controllers (`scoped`, agentStructuralActions) under the
 * receipt `kept` prepared for it (prepareAgentText): the recorded reply wins, a command whose step was
 * kept answers with it even when what follows fails, and one that kept nothing says its drafts are as
 * they were. `applied`: once the receipt is kept, whatever fails after (the page details' labels
 * refresh there on show; the count where it landed away).
 */
export async function applyStructural(command: AgentCommand, kept: PreparedText, scoped: ReturnType<typeof agentStructuralActions>,
  run: (apply: () => Promise<AgentCommandOutcome>) => Promise<AgentCommandOutcome> = apply => apply(), applied: () => void = () => {}): Promise<AgentCommandOutcome> {
  try {
    const detail = await run(() => applySiteCommand(scoped.actions, command));
    await kept.finish!(() => scoped.current(), scoped.readDrafts);
    applied();
    // The recorded reply wins (a duplicate delivery gets exactly it); live-only detail adds result fields.
    return { ...kept.outcome!, result: { ...detail.result, ...kept.outcome!.result } };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error), unchanged = "Nothing was changed; your drafts are as they were.";
    if (!kept.applied) throw new Error(message.includes(unchanged) ? message : `${message} ${unchanged}`);
    await kept.recover!();
    // Kept all the same: what follows a kept step (labels, the count where it landed) still follows.
    applied();
    return kept.outcome!;
  } finally { scoped.dispose(); }
}

/** The shown editor's ports a page or file command borrows to run on a site not shown (ticket 34), and where it is counted. */
export interface AgentAwayPorts {
  site: import("./background-site").BackgroundSitePorts;
  /** The command's step was kept in `scope`, not shown: the repository menu counts it there (ticket 24). */
  landed(scope: DraftScope): void;
}

/**
 * An agent's command read from a site or branch no longer shown finishes there (tickets 23 and 34);
 * undefined while it is the one shown (`shown`, asked after every wait), which runs it through the
 * editor as before. A text write (edit_file, write_file) is written on its files: the file's text
 * there now (its draft, else the branch's) must still be what the agent read; the draft goes through
 * the agent records with its receipt, then into the draft store, as another tab's would. A page or
 * file command runs in its background site (src/background-site.ts, `away`): the editor's own
 * controllers over the workspace it held as it arrived, its step parked for its own page's Undo.
 * Only a command that needs the page on screen (open_page, inspect_preview) refuses.
 */
export async function finishAgentTextElsewhere(command: AgentCommand, shown: () => DraftScope | undefined, account: string | undefined, store: DraftStore,
  find: (files: AgentReadFiles, path: string) => Promise<{ sha: string } | undefined>, away?: AgentAwayPorts): Promise<AgentCommandOutcome | undefined> {
  // A Media change holds its own pinned workspace (ticket 27): its background page runs it (runAgentMedia).
  if (pinnedMedia(command)) return undefined;
  const files = agentCommandFiles.get(command);
  const left = () => { const now = shown(); return !now || !sameBranch(now, { repoId: files!.repo.id, branch: files!.snapshot.branch }); };
  if (!files || !account || !left()) return undefined;
  const scope: DraftScope = { account, repoId: files.repo.id, repo: files.repo.full_name, branch: files.snapshot.branch }, path = command.path;
  const held = siteCommandPins.get(command);
  if (command.operation !== "write_file") {
    // The page and file commands (ticket 34) run there; the open file's own writes (update_active_draft,
    // create_file_draft) and the reads of the page shown need the editor showing it.
    if (!AWAY_COMMANDS.has(command.operation))
      throw new Error("The editor shows another site or branch now, and this needs its page on screen. Nothing was changed; your drafts are as they were.");
    if (!away || !held)
      throw new Error("The editor shows another site or branch now, and this change was not tied to the one it was read on. Nothing was changed; your drafts are as they were.");
    return finishStructuralElsewhere(command, scope, store, held, away, left);
  }
  refuseProtected(command);
  const prepared = await prepareAgentText(command, scope, store, () => true, () => {});
  if (prepared.duplicate) return prepared.duplicate;
  if (!left()) return undefined;
  const context = prepared.context!, release = await context.fence(scope, [path]);
  try {
    const draft = store.get(scope, path), entry = draft ? undefined : await find(files, path), now = Date.now(), text = command.content;
    const branch = entry && { sha: entry.sha, text: await files.read(files.repo.full_name, entry.sha) };
    const shownText = draft ? (draft.deleted || draft.opaque ? undefined : draft.content) : branch?.text;
    const hash = shownText === undefined ? null : await textHash(shownText);
    // Its branch shown again meanwhile: the editor writes it, through the open file's model.
    if (!left()) return undefined;
    if (hash !== (command.expectedHash ?? null))
      throw new Error(`${path} changed in the editor meanwhile. Read it again. Nothing was changed; your drafts are as they were.`);
    // The draft the editor's own write leaves (src/guarded-edit/commit.ts, edits only).
    const after: SavedDraft | undefined = draft && !draft.deleted ? (draft.baseSha !== null && !draft.movedFrom && text === draft.original ? undefined : { ...draft, content: text, updatedAt: now })
      : draft ? { ...scope, version: 1, path, baseSha: draft.baseSha, original: draft.original, content: text, updatedAt: now }
      : branch && text === branch.text ? undefined
      : { ...scope, version: 1, path, baseSha: branch?.sha ?? null, original: branch?.text ?? "", content: text, updatedAt: now };
    const changes = new Map([[path, after]]);
    await context.commit(new Map([[path, draft]]), changes, () => left() && store.get(scope, path) === draft);
    await context.settle(changes);
    return prepared.outcome;
  } finally { release(); }
}

/**
 * A page or file command in the workspace it arrived in, not shown (ticket 34): its background site's
 * controllers run it there. A page command's steps belong to its page; a page moved (or a folder with
 * pages), to where its page goes; anything else to the page open as it arrived (else the home page), as
 * on show. Its workspace shown again before its step is kept, even briefly (its loads moved), stops the
 * attempt with nothing kept. Shown now, the editor runs it (undefined); while that load is still opening
 * it waits for it, at most `AWAY_WAIT_MS`. Left again, it runs here again only while that workspace's
 * drafts are still as they were when it began (its proof, taken before any wait), else it refuses: it
 * never plans again over what Lex changed there meanwhile. A receipt is kept only with its step, so an
 * attempt stopped before leaves none to count as a duplicate.
 */
async function finishStructuralElsewhere(command: AgentCommand, scope: DraftScope, store: DraftStore, held: { pin: MediaPin; opened?: string }, away: AgentAwayPorts, left: () => boolean) {
  const draftsNow = () => JSON.stringify(store.list(scope).map(({ updatedAt: _, ...draft }) => draft).sort((a, b) => a.path.localeCompare(b.path)));
  const proof = draftsNow();
  const { backgroundSite } = await import("./background-site");
  const pages = Object.values(held.pin.site?.routes ?? {});
  const moved = command.operation === "move_file" ? pages.find(page => page === command.path || page.startsWith(`${command.path}/`)) : undefined;
  const home = command.operation === "set_page_details" ? command.path : moved ?? held.opened;
  for (let attempt = 0; ; attempt++) {
    // Shown again, its load still opening (no snapshot on show yet): a wait, not a retry.
    if (held.pin.here() && left() && !await until(() => !held.pin.here() || !left(), AWAY_WAIT_MS))
      throw new Error(`The editor is still opening ${scope.branch}. Nothing was changed; your drafts are as they were.`);
    if (!left()) return undefined;
    if (draftsNow() !== proof || attempt >= AWAY_ATTEMPTS)
      throw new Error(`${scope.branch} changed in the editor meanwhile. Read it again. Nothing was changed; your drafts are as they were.`);
    const visits = away.site.visits(scope), stays = () => !held.pin.here() && left() && away.site.visits(scope) === visits;
    const prepared = await prepareAgentText(command, scope, store, () => true, () => {});
    if (prepared.duplicate) return prepared.duplicate;
    if (!stays()) continue;
    const site = backgroundSite(held.pin, away.site, home);
    const scoped = agentStructuralActions(site.workspace, prepared.context!, stays, {
      actions: site.actions, pages: site.pages, files: site.files, components: () => site.components(command.path), loader: site.loader,
      factories: away.site.factories, home: site.home,
    });
    try { return await applyStructural(command, prepared, scoped, undefined, () => away.landed(scope)); }
    catch (error) { if (prepared.applied || stays()) throw error; }
  }
}
/** How long a command whose workspace is shown again waits for that load to open; and its attempts, at most. */
const AWAY_WAIT_MS = 30_000, AWAY_ATTEMPTS = 5;
// Whether `done` holds within `ms`, asked every 100 ms.
async function until(done: () => boolean, ms: number) {
  for (const end = Date.now() + ms; !done(); ) {
    if (Date.now() >= end) return false;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  return true;
}
