// The Inbox (site-quality slice 40, mock-up 05 v2; TOOLS-222; CONTEXT.md **Inbox**). The tray button comes with the
// top bar (src/workspace-shell.ts); everything else, the checks, the list, the dots and the panel, loads once the
// site's pages are read or the Inbox opens (src/inbox/inbox.ts), so the boot bundle holds only this. Every change
// of the drafts checks again, so items go by themselves once fixed.

import { effect } from "@preact/signals-core";
import type { AppStore } from "../app-store";
import type { NativeNodeRequest } from "../components/native-preview";
import type { MediaWorkspaceContext } from "../page-builder/media-workspace";

export interface InboxPorts {
  readonly appStore: Pick<AppStore, "snapshot" | "drafts" | "openFile">;
  /** The open site's page files, in the order of its addresses; none without a site. */
  pages(): readonly string[];
  /** A file's text now (drafts first). */
  source(path: string): string | undefined;
  /** The site's text index has read every page. */
  indexed(): boolean;
  /** A page's name and address as the Pages tab shows them. */
  label(file: string): string;
  route(file: string): string | undefined;
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
  error(error: unknown): void;
}

export function createInbox(ports: InboxPorts) {
  let list: Promise<ReturnType<typeof import("./inbox").createInboxList>> | undefined;
  const load = () => (list ??= import("./inbox").then(module => module.createInboxList(ports)));
  const fail = (error: unknown) => ports.error(error);
  let timer: ReturnType<typeof setTimeout> | undefined;

  function changed() {
    clearTimeout(timer);
    // Nothing loads for a site not yet read: the text index calls this again once it has every page.
    if (!list && !(ports.pages().length && ports.indexed())) return;
    timer = setTimeout(() => void load().then(inbox => inbox.check()).catch(fail), 400);
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
