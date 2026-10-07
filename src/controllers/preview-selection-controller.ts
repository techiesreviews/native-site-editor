import type { NativePreviewHandlers, NativePreviewSelection, NativeTextSelection } from "../components/native-preview";
import { nativeComponentScopeSelection } from "../page-builder/native-component-selection";
import type { StartTag } from "../../shared/html-source";
import { nativeSitePaths, type NativeSite } from "../../shared/native-project";

type Slot<T> = { value: T };
type NodeTarget = { path: string; node: number[] };
export type BoundTextSelection = NativeTextSelection & NodeTarget;

export interface PreviewSelectionPreview {
  route(): string;
  selectNode(target: NodeTarget): void;
  clearSelection(): void;
  hideEditBar(): void;
}

export interface PreviewSelectionEditor {
  isMounted(path: string): boolean;
  markElement(path: string, tag: StartTag | undefined, reveal: boolean): void;
}

export interface PreviewSelectionPorts {
  /** Read only: the host bumps generation. */
  generation(): number;
  /** The setup scope key. */
  scope(): string;
  store: {
    selection: Slot<NativePreviewSelection | undefined>;
    openFile: { readonly value: string | undefined };
    snapshot: { readonly value: unknown };
  };
  site(): Pick<NativeSite, "routes" | "components"> | undefined;
  sources(): Record<string, string>;
  effectiveSource(path: string): string | undefined;
  editableSource(path: string): string | undefined;
  masterEdit(): { session: string; masterPath: string } | undefined;
  preview(): PreviewSelectionPreview | undefined;
  editor(): PreviewSelectionEditor | undefined;
  componentTag(path: string): string | undefined;
  editingScopePath(): string | undefined;
  instanceContent(source: string, node: readonly number[], tag: string): boolean;
  /** The start tag at `node` in `source` (DOM parsing stays in the host). */
  locateTag(source: string, node: number[]): StartTag | undefined;
  /** The element name at `node` in `source`. */
  tagName(source: string, node: readonly number[]): string | undefined;
  /** Opens a file for a revealed selection (restoreFile without the default linked style). */
  openFile(path: string, epoch: number): Promise<unknown>;
  renderEditBar(selection: NativePreviewSelection): void;
  linkStyles(selection: NativePreviewSelection, reveal: boolean): void;
  clearMoveAction(): void;
  structureSelect(target: NodeTarget | undefined): void;
  hideComponentTools(): void;
  agentContext(): void;
  announce(message: string): void;
  setTimer(callback: () => void, ms: number): unknown;
  clearTimer(timer: unknown): void;
  /** Bumps the linked-style, file and secondary requests; returns the linked-style request. */
  beginReveal(): number;
  styleRequest(): number;
  /** Drops the linked styles and opens the default linked style. */
  clearStyles(): void;
}

type PendingInstance = { path: string; node: number[]; sources: Record<string, string>; components: string; epoch: number; scope: string };

export function createPreviewSelectionController(ports: PreviewSelectionPorts) {
  const { store } = ports;
  // A preview click that arrived before its file's editor was mounted; replayed
  // by `mountSource` once that file opens in the same generation.
  let pending: { selection: NativePreviewSelection; epoch: number } | undefined;
  let pendingInstance: PendingInstance | undefined;
  let sourceIntent: { path: string; epoch: number; scope: string } | undefined;
  // Counts changes of the selected element: a Save shared in flight refuses when the person selects another.
  let epochCount = 0;
  // Callbacks waiting for the preview's own selection of a node (Structure's explicit Edit).
  const waiters = new Set<(selection: NativePreviewSelection) => void>();
  // Text selected inside the selected element, bound to that element.
  let text: BoundTextSelection | undefined;
  let selectedGrid = "";

  // Marks the selected element's start tag in its open source file.
  function mark(selection: NativePreviewSelection, reveal: boolean) {
    const editor = ports.editor();
    if (!selection.path || store.openFile.value !== selection.path || !editor?.isMounted(selection.path)) return;
    if (reveal) pending = undefined;
    const source = ports.editableSource(selection.path);
    const tag = source !== undefined && selection.node ? ports.locateTag(source, selection.node) : undefined;
    editor.markElement(selection.path, tag, reveal);
  }

  function refuse(selection: NativePreviewSelection, message: string) {
    pendingInstance = undefined;
    pending = undefined;
    ports.clearMoveAction();
    store.selection.value = undefined;
    const open = store.openFile.value;
    if (open) ports.editor()?.markElement(open, undefined, false);
    ports.preview()?.clearSelection();
    ports.structureSelect(undefined);
    ports.hideComponentTools();
    if (selection.reason !== "refresh") ports.announce(message);
  }

  function recordIntent(path: string) {
    sourceIntent = ports.componentTag(path) ? { path, epoch: ports.generation(), scope: ports.scope() } : undefined;
  }

  function editableTemplatePath() {
    const intent = sourceIntent;
    return intent && intent.epoch === ports.generation() && intent.scope === ports.scope() && store.openFile.value === intent.path && ports.editor()?.isMounted(intent.path)
      ? intent.path : ports.editingScopePath();
  }

  async function select(selection: NativePreviewSelection) {
    ports.clearMoveAction();
    const sources = ports.sources();
    // While a master is on show, only its own copy can be selected, from this session; the rest
    // of the page is read-only until Done.
    const masterAt = ports.masterEdit();
    // (A cleared selection has no path and always passes.)
    if (selection.path && (masterAt || selection.masterSession !== undefined)) {
      if (!masterAt || selection.masterSession !== masterAt.session || selection.path !== masterAt.masterPath || store.openFile.value !== masterAt.masterPath) {
        refuse(selection, masterAt ? "The page is read-only while its master is open. Choose Done to edit it." : "That master is no longer open.");
        return;
      }
    }
    if (pendingInstance) {
      const was = pendingInstance;
      pendingInstance = undefined;
      if (selection.path === was.path && selection.node?.join(".") === was.node.join(".") &&
          (was.epoch !== ports.generation() || was.scope !== ports.scope() || JSON.stringify(ports.site()?.components) !== was.components || Object.entries(was.sources).some(([path, source]) => sources[path] !== source))) {
        refuse(selection, "The instance changed before it could be selected. Select it again."); return;
      }
    }
    // A master is editor-private (not among the public sources): its bytes are its effective source.
    const selectedSource = masterAt && selection.path === masterAt.masterPath ? ports.effectiveSource(selection.path) : sources[selection.path];
    if (selection.path && selection.paintedSource !== undefined && selection.paintedSource !== selectedSource) {
      refuse(selection, "The source changed. Wait for the preview before selecting this element."); return;
    }
    const site = ports.site();
    const pagePath = site?.routes[ports.preview()?.route() ?? ""];
    if (selection.reason !== "refresh" && selection.path === pagePath) sourceIntent = undefined;
    const scopePath = selection.reason !== "refresh" && selection.path === pagePath ? pagePath : editableTemplatePath() ?? pagePath;
    if (selection.path && scopePath && site && !masterAt) {
      const mapped = nativeComponentScopeSelection(selection, scopePath, site.components, sources, ports.tagName, ports.instanceContent);
      if (!mapped) { refuse(selection, "Select the page instance, or choose Edit to edit its shared template."); return; }
      if (mapped.path !== selection.path || mapped.node?.join(".") !== selection.node?.join(".")) {
        if (!mapped.node || sources[mapped.path] === undefined) { refuse(selection, "The instance is no longer available. Select it again."); return; }
        pendingInstance = { path: mapped.path, node: [...mapped.node],
          sources: Object.fromEntries([selection.path, mapped.path, ...(selection.hostChain ?? (selection.host ? [selection.host] : [])).map(host => host.path)].filter((path): path is string => !!path).map(path => [path, sources[path]])),
          components: JSON.stringify(site.components), epoch: ports.generation(), scope: ports.scope() };
        // Request the real host's own rect, matching rules and computed values.
        ports.preview()?.selectNode({ path: mapped.path, node: mapped.node });
        return;
      }
    }
    const reveal = selection.reason !== "refresh";
    const current = store.selection.value;
    if (selection.path !== current?.path || selection.node?.join(".") !== current?.node?.join(".")) epochCount++;
    store.selection.value = selection.path ? selection : undefined;
    for (const waiter of [...waiters]) waiter(selection);
    // Agents see the selection (get_selection).
    if (reveal) ports.agentContext();
    ports.structureSelect(selection.path && selection.node ? { path: selection.path, node: selection.node } : undefined);
    if (!selection.path) {
      ports.clearMoveAction();
      ports.preview()?.hideEditBar();
      ports.hideComponentTools();
    }
    if (!reveal) {
      if (!selection.path || store.openFile.value !== selection.path) {
        ports.preview()?.hideEditBar();
        return;
      }
      mark(selection, false);
      ports.renderEditBar(selection);
      ports.linkStyles(selection, false);
      return;
    }
    const open = store.openFile.value;
    if (open) ports.editor()?.markElement(open, undefined, false);
    pending = selection.path ? { selection, epoch: ports.generation() } : undefined;
    const request = ports.beginReveal();
    if (!selection.path) {
      ports.clearStyles();
      return;
    }
    // The open master is selectable in its own session (checked above) though it is not a site page.
    const shown = ports.site();
    if (!store.snapshot.value || !shown || !(nativeSitePaths(shown as NativeSite).includes(selection.path) || masterAt?.masterPath === selection.path)) return;
    const epoch = ports.generation();
    if (store.openFile.value !== selection.path) {
      await ports.openFile(selection.path, epoch);
      if (request !== ports.styleRequest() || epoch !== ports.generation() || store.openFile.value !== selection.path) return;
    }
    mark(selection, true);
    ports.renderEditBar(selection);
    ports.linkStyles(selection, reveal);
  }

  return {
    select,
    refuse,
    recordIntent,
    editableTemplatePath,
    selectionEpoch: () => epochCount,
    textSelection: () => text,
    /**
     * Replays a click that arrived before `path` was mounted. Called before
     * mountSource's file-generation guard: handling that click is what
     * superseded the open.
     */
    replayPending(path: string) {
      const was = pending;
      if (was?.selection.path === path && store.openFile.value === path && ports.editor()?.isMounted(path)) {
        pending = undefined;
        if (was.epoch === ports.generation()) void select(was.selection);
      }
    },
    /** Resolves with the preview's own selection of `node`, or undefined after `ms`. */
    waitFor(path: string, node: readonly number[], ms: number) {
      return new Promise<NativePreviewSelection | undefined>((resolve) => {
        const timer = ports.setTimer(() => { waiters.delete(waiter); resolve(undefined); }, ms);
        const waiter = (selection: NativePreviewSelection) => {
          if (selection.path !== path || selection.node?.join(".") !== node.join(".")) return;
          ports.clearTimer(timer); waiters.delete(waiter); resolve(selection);
        };
        waiters.add(waiter);
      });
    },
    handlers(): Required<Pick<NativePreviewHandlers, "onSelect" | "onItemGrids" | "onTextSelection">> {
      // Each preview starts with no grid report, as each mount did before.
      selectedGrid = "";
      return {
        onSelect: (selection) => void select(selection),
        onItemGrids: (report) => {
          const key = JSON.stringify(report.selected && [report.selected.path, report.selected.parent, report.selected.index, report.selected.row]);
          if (key === selectedGrid) return;
          selectedGrid = key;
          if (store.selection.value) ports.renderEditBar(store.selection.value);
        },
        onTextSelection: (selected) => {
          const at = store.selection.value;
          const next = selected && at?.node ? { ...selected, path: at.path, node: at.node } : undefined;
          if (JSON.stringify(next) === JSON.stringify(text)) return;
          text = next;
          if (store.selection.value) ports.renderEditBar(store.selection.value);
        },
      };
    },
  };
}

export type PreviewSelectionController = ReturnType<typeof createPreviewSelectionController>;
