import type { AgentReadFiles } from "./agent-tools-read";
import type { AgentSiteInput, SharedContext } from "./agent-site";
import type { createConfirmDialog } from "./components/confirm-dialog";
import type { Stamp } from "./guarded-edit";
import type { MediaPin } from "./controllers/media-controller";

type Dialog = ReturnType<typeof createConfirmDialog>;
export interface AgentSiteHostPorts {
  stamp(): Stamp;
  files?(): AgentReadFiles | undefined;
  source?(path: string): string | undefined;
  load(): Promise<Pick<typeof import("./agent-site"), "buildAgentContext" | "agentAnswers">>;
  input(): AgentSiteInput | undefined;
  dialog(): Dialog | undefined;
  setDialog(dialog: Dialog | undefined): void;
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
  async function withAnswers<T>(answers: { option?: boolean }, run: () => Promise<T>) {
    const stamp = ports.stamp();
    const { agentAnswers } = await ports.load();
    if (!stamp.holds()) throw new Error("The editor changed branch or revision.");
    const real = ports.dialog();
    ports.setDialog(real && agentAnswers(real, answers));
    try {
      return await run();
    } finally {
      ports.setDialog(real);
    }
  }
  // An edit's hold on the workspace (ticket 23): the live context while it is shown, else its own as
  // it arrived (its drafts then, nothing mounted or on show). A draft changed since refuses its write.
  function pin(build: () => Promise<SharedContext | undefined>) {
    const stamp = ports.stamp(), input = ports.input(), away = () => stamp.changed() === "scope", media = ports.mediaPin?.();
    // `opened`: the page open as it arrived, so its work knows when Lex has left that page (ticket 27).
    return input && { away, media, opened: input.native?.openFile, async context() {
      const shown = away() ? undefined : await build();
      if (shown) return shown;
      // Away now: its own. Left and shown again while it was made: the one shown, read again.
      return away() ? (await ports.load()).buildAgentContext({ ...input, file: null, mountedSource: () => undefined, native: undefined }) : build();
    } };
  }
  function tools(build = context) {
    return { stamp: () => ports.stamp(), context: build, pin: () => pin(build), files: () => ports.files?.(), source: (path: string) => ports.source?.(path) };
  }
  return { context, withAnswers, tools };
}
