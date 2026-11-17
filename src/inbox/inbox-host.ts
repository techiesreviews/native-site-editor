// The Inbox (site-quality slice 40, mock-up 05 v2; TOOLS-222; CONTEXT.md **Inbox**). The tray button comes with the
// top bar (src/workspace-shell.ts); everything else, the checks, the list, the dots and the panel, loads once the
// site's pages are read or the Inbox opens (src/inbox/inbox.ts), so the boot bundle holds only this. Every change
// of the drafts checks again, so items go by themselves once fixed.

import { effect } from "@preact/signals-core";
import type { AppStore } from "../app-store";
import { lazyModule } from "../lazy-module";
import type { NativeNodeRequest } from "../components/native-preview";
import type { MediaWorkspaceContext } from "../page-builder/media-workspace";
import type { NativeSite } from "../../shared/native-project";
import type { GuardedEdits } from "../guarded-edit";
import type { InboxAgentLink } from "./inbox-agent";

export interface InboxPorts {
  readonly appStore: Pick<AppStore, "snapshot" | "drafts" | "openFile">;
  /** The open site's page files, in the order of its addresses; none without a site. */
  pages(): readonly string[];
  /** The open site: its pages and its shared parts (components), whose templates are checked too (TOOLS-253). */
  site(): NativeSite | undefined;
  /** A file's text now (drafts first). */
  source(path: string): string | undefined;
  /** The site's text index has read every page. */
  indexed(): boolean;
  /** The site's files (drafts first): a picture whose file is missing offers no Decorative. */
  files(): readonly string[];
  /** The session now: it holds until another site or branch, or a reload, opens (a Decorative writes only while it holds). */
  stamp(): { holds(): boolean };
  /** A page's name and address as the Pages tab shows them. */
  label(file: string): string;
  route(file: string): string | undefined;
  /** The address the canvas shows (a Ctrl+click on a link moves it alone, leaving the open file). */
  showing(): string | undefined;
  /** The edit bar's verdict on a picture's description; undefined while the Media rules load. */
  picture(page: string, src: string, alt: string | undefined): "described" | "decorative" | "missing" | undefined;
  /** Opens a page in the editor. */
  open(page: string): Promise<unknown>;
  /** Selects an element of the page shown, now or (`later`) once the page about to open is drawn. */
  select(request: NativeNodeRequest, later: boolean): void;
  /** Page details for a page (its title first). */
  pageDetails(page: string): void;
  /** The site's Media, for a picture's Decorative (as Media's own Decorative writes it). */
  media(): Promise<MediaWorkspaceContext>;
  /** The connected agent, which Fix with AI asks for a suggestion (TOOLS-253). */
  agent(): InboxAgentLink | undefined;
  /** An accepted fix, No speech and a heading's one press are written as one Undo step. */
  readonly edits: Pick<GuardedEdits, "run">;
  /** Edit component mode on a shared part, framing `instance` on its page, with `notes` in its bar. */
  editComponent(tag: string, instance: { path: string; node: number[] } | undefined, notes: readonly string[]): Promise<"mode" | "late" | undefined>;
  error(error: unknown): void;
}

const idle = (run: () => void) => typeof requestIdleCallback === "function" ? requestIdleCallback(run, { timeout: 2000 }) : setTimeout(run);

export function createInbox(ports: InboxPorts) {
  // A chunk that fails to load (a deploy since the editor opened) is tried again on the next change; chunk recovery
  // decides on a reload.
  let loaded = false;
  const load = lazyModule(() => import("./inbox").then(module => { loaded = true; return module.createInboxList(ports); }));
  const fail = (error: unknown) => ports.error(error);
  let timer: ReturnType<typeof setTimeout> | undefined;

  function changed() {
    clearTimeout(timer);
    // Nothing loads for a site not yet read: the text index calls this again once it has every page.
    if (!loaded && !(ports.pages().length && ports.indexed())) return;
    // After a pause in the changes, in the browser's idle time, so an edit's own work never waits for it.
    timer = setTimeout(() => idle(() => void load().then(inbox => inbox.check()).catch(fail)), 400);
  }

  // Drawn as it opens; its first row takes the keyboard once it shows (popovertarget opens it; Escape and a click
  // outside close it, and focus goes back to the button).
  for (const [type, drawing] of [["beforetoggle", true], ["toggle", false]] as const)
    document.addEventListener(type, (event) => {
      const panel = event.target as HTMLElement;
      if (panel.id === "inbox" && (event as ToggleEvent).newState === "open") void load().then(inbox => inbox.opened(panel, drawing)).catch(fail);
    }, true);
  effect(() => {
    void ports.appStore.drafts.revision.value;
    void ports.appStore.snapshot.value;
    changed();
  });
  return { changed };
}
