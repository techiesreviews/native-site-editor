import { mountEditorPalette, type EditorPaletteDeps } from "../page-builder/palette";
import { firstHeadingText, nativePageLabel } from "../native-pages";
import { componentLabel, isSectionTemplate } from "../native-insert";
import type { AppStore } from "../app-store";

type Derived = "pages" | "files" | "ready" | "components" | "currentPath" | "revision" | "source" | "selection" | "editing" | "newPage";
export interface CommandPalettePorts {
  appStore: Pick<AppStore, "openFile" | "selection">;
  host(): HTMLElement;
  site(): { routes: Record<string, string>; components: Record<string, string> } | undefined;
  routeTitle(route: string): string | undefined;
  files(): string[];
  sources(): Record<string, string>;
  effectiveSource(path: string): string | undefined;
  indexed(): boolean;
  index(): Promise<unknown>;
  revision(): string;
  isMounted(path: string): boolean;
  beginNewPage(): void;
  startNewPage(): void;
  actions: Omit<EditorPaletteDeps, Derived>;
  /** Test seam; production keeps the existing keyboard layer and its lazy UI. */
  mountPalette?: typeof mountEditorPalette;
}

/** Derives palette views from live workspace state and owns keyboard registration. */
export function createCommandPaletteController(ports: CommandPalettePorts) {
  let palette: ReturnType<typeof mountEditorPalette> | undefined;
  let epoch = 0;
  const waits = new Set<{ timer: ReturnType<typeof setTimeout>; resolve(): void }>();
  function dispose() {
    epoch++;
    palette?.dispose(); palette = undefined;
    for (const wait of waits) { clearTimeout(wait.timer); wait.resolve(); }
    waits.clear();
  }
  function afterExplorerRender() {
    return new Promise<void>(resolve => {
      const wait = { timer: setTimeout(() => { waits.delete(wait); resolve(); }, 0), resolve };
      waits.add(wait);
    });
  }
  function mount() {
    dispose();
    const generation = epoch;
    const live = () => generation === epoch;
    const actions = ports.actions;
    const deps: EditorPaletteDeps = {
      ...actions,
      pages: () => {
        const site = live() && ports.site();
        if (!site) return [];
        const titles = Object.fromEntries(Object.keys(site.routes).map(route => [route, ports.routeTitle(route)]));
        return Object.entries(site.routes).map(([route, file]) => ({ file, route,
          label: nativePageLabel(file, { routes: site.routes, titles, heading: path => firstHeadingText(ports.effectiveSource(path)) }) ?? route,
        }));
      },
      files: () => live() && ports.site() ? ports.files() : [],
      ready: () => live() && ports.site() && !ports.indexed() ? ports.index() : undefined,
      components: () => {
        const site = live() && ports.site();
        if (!site) return [];
        const sources = ports.sources();
        return Object.entries(site.components).map(([tag, file]) => ({ tag, file, label: componentLabel(tag), section: isSectionTemplate(sources[file] ?? "") }));
      },
      currentPath: () => live() ? ports.appStore.openFile.value : undefined,
      revision: () => `${ports.revision()}:palette:${generation}`,
      source: path => live() ? ports.sources()[path] : undefined,
      selection: () => {
        const selection = live() && ports.appStore.selection.value;
        return selection && selection.path === ports.appStore.openFile.value ? selection : undefined;
      },
      editBar: () => live() ? actions.editBar() : undefined,
      textSelected: () => live() && actions.textSelected(),
      editing: () => Boolean(live() && ports.appStore.openFile.value && ports.isMounted(ports.appStore.openFile.value)),
      open: path => { if (live()) return actions.open(path); },
      insert: async (point, component) => { if (live()) await actions.insert(point, component); },
      select: (path, node) => { if (live()) actions.select(path, node); },
      history: direction => { if (live()) actions.history(direction); },
      newPage: async () => {
        if (!live()) return;
        const revision = ports.revision();
        ports.beginNewPage();
        // The explorer's opening toggle renders rows before the title field starts.
        await afterExplorerRender();
        if (live() && revision === ports.revision()) ports.startNewPage();
      },
      newFile: () => { if (live()) actions.newFile(); },
      showPagesAndFiles: () => { if (live()) actions.showPagesAndFiles(); },
      toggleCode: () => { if (live()) actions.toggleCode(); },
      toggleStructure: () => { if (live()) actions.toggleStructure(); },
    };
    palette = (ports.mountPalette ?? mountEditorPalette)(ports.host(), deps);
  }
  return { mount, dispose };
}
