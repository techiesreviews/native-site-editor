// The ports a background site (src/background-site.ts) borrows from the shown editor, typed whole so an
// added or renamed port fails to compile. The editor's live Pages, Files, component and action ports are
// what a background site overrides its reads of (its own site, files and texts): a test gives only the
// members it reaches through them (`live`).
import type { BackgroundSitePorts } from "../../src/background-site";
import type { ParkedStep } from "../../src/guarded-edit/parked";
import type { DraftScope } from "../../src/drafts";
import { createGuardedEdits } from "../../src/guarded-edit";
import { createPagesController } from "../../src/controllers/pages-controller";
import { createLazyFileOperationsController } from "../../src/controllers/file-operation-checks";
import { createBlockMoves } from "../../src/page-builder/block-move";
import { withPageField } from "../../src/page-builder/site-head";

type Store = ReturnType<BackgroundSitePorts["store"]>;
/** One of the shown editor's live ports, of which only `members` are reached here. */
const live = <T>(members: Partial<T>) => members as T;

export function backgroundSitePorts(options: {
  store: Partial<Store>;
  readFile: (repo: string, sha: string) => Promise<string>;
  park: (step: ParkedStep) => void;
  visits: () => number;
  forget?: (scope: DraftScope, path: string) => void;
  pages?: Partial<BackgroundSitePorts["pages"]>;
  files?: Partial<BackgroundSitePorts["files"]>;
}) {
  const store = live<Store>(options.store);
  return {
    pages: live<BackgroundSitePorts["pages"]>(options.pages ?? {}),
    files: live<BackgroundSitePorts["files"]>({ readFile: options.readFile, readFiles: async () => ({}), draftStore: () => store, ...options.files }),
    components: () => live<ReturnType<BackgroundSitePorts["components"]>>({}),
    actions: () => live<ReturnType<BackgroundSitePorts["actions"]>>({}),
    store: () => store,
    forget: options.forget ?? (() => {}),
    prepareSources: () => ({ isCurrent: () => true, apply: () => true, undo: () => true, redo: () => true }),
    park: options.park,
    visits: options.visits,
    factories: { createGuardedEdits, createPagesController, createLazyFileOperationsController, createBlockMoves, withPageField },
  } satisfies BackgroundSitePorts;
}
