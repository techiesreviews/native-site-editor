// Work that finished on a project and branch other than the one shown (ticket 23) leaves a
// note there (ticket 24). The repository menu counts the notes on that project's tile, on its
// branch's row and on the menu's own tile, and names what happened ("Saved", "3 files added",
// "Agent changes waiting"). A note goes once its workspace is on show again (its editor mounted):
// clicked, it opens with its changes (the Publish panel, a save's Change status on its button).
// Nothing of it is stored, so a reload or a closed tab forgets it. Work on another page of the shown site needs
// no note: that page shows its change when opened, and Pages marks it unsaved.
import type { DraftScope } from "./drafts";
import type { SavedCommit } from "./components/site-actions";
import type { Repository } from "../shared/types";
import { githubScope, holdsDraftScope, sameRepository, workspaceKeys, type WorkspaceScope } from "./workspace-session";

export type FinishedKind = "saved" | "added" | "agent";

export interface FinishedNote {
  readonly scope: DraftScope;
  /** How many of each finished there: saves, files added, agent edits. */
  readonly done: Readonly<Record<FinishedKind, number>>;
  /** The last save's commit, followed as Change status when the note is opened. */
  readonly commit?: SavedCommit;
}

/** Pieces of work finished in `notes`: what a tile counts. */
export const noteCount = (notes: readonly FinishedNote[]) =>
  notes.reduce((sum, note) => sum + note.done.saved + note.done.added + note.done.agent, 0);

/** What happened, in words: "Saved", "3 files added", "Agent changes waiting". */
export function noteWords(note: FinishedNote) {
  const { saved, added, agent } = note.done;
  return [
    saved && (saved === 1 ? "Saved" : `Saved ${saved} times`),
    added && `${added} ${added === 1 ? "file" : "files"} added`,
    agent && "Agent changes waiting",
  ].filter(Boolean).join(", ");
}

/**
 * What the repository menu's tile says after its name: the questions agents ask, then the
 * finished work by where it is (the branch, with the repository when it is not `open`, as the
 * Files drop's message says it); and whether its corner counts the finished work, which a
 * waiting question takes.
 */
export function tileWords(questions: number, notes: readonly FinishedNote[], open: { repoId?: number; repo?: string }, repositories: readonly Repository[]) {
  const asking = questions < 1 ? "" : ` — ${questions === 1 ? "an agent asks you a question" : `agents ask you ${questions} questions`}`;
  const named = (note: FinishedNote) => repositories.find((repo) => sameRepository(note.scope, { repoId: repo.id, repo: repo.full_name }))?.full_name ?? note.scope.repo;
  const where = (note: FinishedNote) => (sameRepository(note.scope, open) ? note.scope.branch : `${named(note)} (${note.scope.branch})`);
  const done = notes.length ? ` — ${notes.map((note) => `${noteWords(note)} on ${where(note)}`).join("; ")}` : "";
  return { words: `${asking}${done}`, counted: notes.length > 0 && questions < 1 };
}

/**
 * Opens `scope` by its workspace link. A link already in the address bar (a folder's view, a load
 * not remembered yet) changes nothing there, so its hashchange is sent as if it had.
 */
export function openLink(scope: DraftScope, win: { location: { hash: string }; dispatchEvent(event: Event): boolean } = window) {
  const link = new URLSearchParams({ repo: String(scope.repoId), branch: scope.branch }).toString();
  if (win.location.hash.slice(1) === link) win.dispatchEvent(new Event("hashchange"));
  else win.location.hash = link;
}

export function createFinishedElsewhere(ports: {
  /** The notes changed: the menu draws them again. */
  draw(notes: readonly FinishedNote[]): void;
  /** Opens the project and branch of `scope`. */
  open(scope: DraftScope): void;
  /** A save's commit, followed as Change status while `scope` is shown. */
  follow(commit: SavedCommit, scope: DraftScope): void;
}) {
  let notes: FinishedNote[] = [];
  // Work noted by its id (an agent command's): a second delivery of it is not new work.
  const noted = new Set<string>();
  // The note clicked, until its workspace's editor mounts.
  let opening: FinishedNote | undefined;
  const at = (scope: WorkspaceScope | undefined) => notes.find((note) => holdsDraftScope(scope, note.scope));
  function set(next: FinishedNote[]) {
    notes = next;
    ports.draw(notes);
  }
  /** `count` pieces of work of `kind` (1 by default) finished on `scope`, not shown; work with an `id` counts once. */
  function add(scope: DraftScope, kind: FinishedKind, { count = 1, commit, id }: { count?: number; commit?: SavedCommit; id?: string } = {}) {
    if (count < 1 || id !== undefined && noted.has(id)) return;
    if (id !== undefined) noted.add(id);
    const was = at(githubScope(scope));
    const done = { saved: 0, added: 0, agent: 0, ...was?.done };
    done[kind] += count;
    const note: FinishedNote = { scope: was?.scope ?? { ...scope }, done, commit: commit ?? was?.commit };
    set([note, ...notes.filter((other) => other !== was)]);
  }
  return {
    notes: () => notes,
    add,
    /**
     * An agent's write for `scope`, done by `run`: noted when the draft at its path there changed,
     * as read before and after (`draft`). A second delivery of the command, or text that is the
     * branch's own, leaves nothing waiting and no note.
     */
    agent<T>(scope: DraftScope | undefined, command: { id: string; path: string }, draft: (scope: DraftScope, path: string) => { updatedAt: number } | undefined, run: () => Promise<T>) {
      const before = scope && draft(scope, command.path)?.updatedAt;
      return async () => {
        const done = await run(), left = done && scope && draft(scope, command.path);
        if (scope && left && left.updatedAt !== before) add(scope, "agent", { id: command.id });
        return done;
      };
    },
    /** A load of `scope` began: a note clicked for another workspace is let go (its own stays till shown). */
    loading(scope: WorkspaceScope | undefined) {
      if (opening && workspaceKeys(scope) && !holdsDraftScope(scope, opening.scope)) opening = undefined;
    },
    /** A note clicked: its workspace opens, and once its editor is there (`mounted`) the note goes and its changes show. */
    open(note: FinishedNote) {
      opening = note;
      ports.open(note.scope);
    },
    /** An editor mounted on `scope`, its toolbar in `host`: its note goes, and one opened for it shows its changes. */
    mounted(scope: DraftScope | undefined, host: ParentNode) {
      const shown = scope && at(githubScope(scope));
      if (shown) set(notes.filter((other) => other !== shown));
      const note = opening;
      if (!note || !scope || !holdsDraftScope(githubScope(scope), note.scope)) return;
      opening = undefined;
      if (note.commit) ports.follow(note.commit, note.scope);
      // The Publish panel as its caret opens it, its changes unfolded (src/components/publish-menu.ts);
      // the caret toggles, so an open panel is left open.
      if (!host.querySelector(".publish-menu__panel:popover-open")) host.querySelector<HTMLButtonElement>(".publish-menu__more:not(:disabled)")?.click();
      const total = host.querySelector<HTMLDetailsElement>(".publish-menu__total");
      if (total) total.open = true;
    },
  };
}
