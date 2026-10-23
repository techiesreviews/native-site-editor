// The pin (ticket 23): what work holds of the workspace it began on, so an upload or a media change
// started there finishes there after a switch. On show (`onShow`: the same workspace, a new load of it
// too) its reads are the editor's; once another workspace or a version view is shown they are its own
// snapshot's, the branch texts read so far and that workspace's drafts.
import type { DraftScope } from "../drafts";
import type { NativeSite } from "../../shared/native-project";
import type { Repository, Snapshot, TreeEntry } from "../../shared/types";
import { onShow, type SessionStamp } from "../workspace-session";
import type { MediaPin, MediaWorkspaceSnapshot } from "./media-controller";

/** The editor's live state and reads the pin takes from and falls back to (src/main.ts). */
export interface MediaPinPorts {
  shown(): { repo: Repository; scope: DraftScope; snapshot: Snapshot; site?: NativeSite } | undefined;
  begin(): SessionStamp;
  /** The branch's files and texts read so far, and the text index's key, as shown now. */
  base(): { files: string[]; texts: ReadonlyMap<string, string>; key: string };
  /** The editor's reads of the workspace shown. */
  live: { entry(path: string): TreeEntry | undefined; find(path: string): Promise<TreeEntry | undefined>; source(path: string, scope: DraftScope): string | undefined; files(scope: DraftScope): string[]; remember(path: string, text: string): void };
  /** Reads of a given snapshot (the repository index) and the clean text cache. */
  entry(repo: Repository, snapshot: Snapshot, path: string): TreeEntry | undefined;
  find(repo: Repository, snapshot: Snapshot, path: string): Promise<TreeEntry | undefined>;
  files(scope: DraftScope, base: string[]): string[];
  list(repo: Repository, snapshot: Snapshot): Promise<string[]>;
  peek(repo: string, revision: string, path?: string): string | undefined;
  identity(): string;
  drafts: () => MediaWorkspaceSnapshot["drafts"];
}

/** The workspace shown now, pinned; none with no repository, branch or snapshot open. */
export function pinMedia(ports: MediaPinPorts): MediaPin | undefined {
  const shown = ports.shown();
  if (!shown) return undefined;
  const { repo, scope, snapshot, site } = shown, at = ports.begin(), here = () => onShow(at), drafts = ports.drafts();
  const { files: base, key } = ports.base(), texts = new Map(ports.base().texts);
  const files = () => here() ? ports.live.files(scope) : ports.files(scope, base);
  const entry = (path: string) => here() ? ports.live.entry(path) : ports.entry(repo, snapshot, path);
  // Its own text: its draft, else the branch's as read so far (the preview's, the text index's, a blob read).
  const text = (path: string, draft = drafts.get(scope, path), sha = entry(path)?.sha) => draft ? draft.deleted || draft.opaque ? undefined : draft.content
    : texts.get(path) ?? ports.peek("", key, path) ?? (sha && ports.peek(repo.full_name, sha));
  return {
    repo: repo.full_name, repoSize: repo.size, scope, identity: ports.identity(), site, drafts, here, entry, files,
    get nativePaths() { return site && files(); },
    list: () => ports.list(repo, snapshot),
    find: path => here() ? ports.live.find(path) : ports.find(repo, snapshot, path),
    source: path => here() ? ports.live.source(path, scope) : text(path),
    remember: (path, source) => { if (here()) ports.live.remember(path, source); },
  };
}
