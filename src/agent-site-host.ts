import type { AgentReadFiles } from "./agent-tools-read";
import type { AgentSiteInput, SharedContext } from "./agent-site";
import type { Stamp } from "./guarded-edit";
import type { MediaPin } from "./controllers/media-controller";
import { nativePageHead } from "../shared/native-project";

export interface AgentSiteHostPorts {
  stamp(): Stamp;
  files?(): AgentReadFiles | undefined;
  source?(path: string): string | undefined;
  load(): Promise<Pick<typeof import("./agent-site"), "buildAgentContext">>;
  input(): AgentSiteInput | undefined;
  /** The workspace shown, pinned for Media work (src/controllers/media-pin.ts). */
  mediaPin?(): MediaPin | undefined;
}

/** Agent waits belong to the repository they began on; the host supplies live inputs after loading. */
export function createAgentSiteHost(ports: AgentSiteHostPorts) {
  async function context(): Promise<SharedContext | undefined> {
    const stamp = ports.stamp();
    const { buildAgentContext } = await ports.load();
    if (!stamp.holds()) return undefined;
    const input = ports.input();
    if (!input) return undefined;
    const context = await buildAgentContext(input);
    return stamp.holds() ? context : undefined;
  }
  // An edit's hold on the workspace (ticket 23): the live context while it is shown, else its own as
  // it arrived (its drafts then, nothing mounted or on show). A draft changed since refuses its write.
  // Its site's pages and outlines come from its pin (ticket 34), so a page or file command is prepared
  // against that site, read as it was when it arrived.
  function pin(build: () => Promise<SharedContext | undefined>) {
    const stamp = ports.stamp(), input = ports.input(), away = () => stamp.changed() === "scope", media = ports.mediaPin?.();
    const site = media?.site, held = site && media && { site, source: (path: string) => media.source(path),
      routeInfo: (route: string) => { const text = Object.hasOwn(site.routes, route) ? media.source(site.routes[route]) : undefined; return text === undefined ? {} : nativePageHead(text); },
      exists: (path: string) => media.files().includes(path) };
    // `opened`: the page open as it arrived, so its work knows when Lex has left that page (ticket 27).
    return input && { away, media, opened: input.native?.openFile, async context() {
      const shown = away() ? undefined : await build();
      if (shown) return shown;
      // Away now: its own. Left and shown again while it was made: the one shown, read again.
      return away() ? (await ports.load()).buildAgentContext({ ...input, file: null, mountedSource: () => undefined, native: held || undefined }) : build();
    } };
  }
  function tools(build = context) {
    return { stamp: () => ports.stamp(), context: build, pin: () => pin(build), files: () => ports.files?.(), source: (path: string) => ports.source?.(path) };
  }
  return { context, tools };
}
