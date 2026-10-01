// The Set up your site checklist: which items are done, from the state the
// editor already holds, and what it remembers per account and repository.
// Pure, so it is tested without a browser (tests/setup-checklist.test.ts).

export type SetupItemId = "start" | "save" | "name" | "agent";

export interface SetupState {
  /** The repository has a root index.html, committed or drafted. */
  homePage: boolean;
  /** The branch has a commit (it is not an empty repository). */
  committed: boolean;
  /** The home page is still an unsaved new file. */
  homeUnsaved: boolean;
  /** The site name in `.editor/config.json`, drafts included. */
  siteName?: string;
  /** The site name a repository of this name starts with. */
  defaultName: string;
  /** The user confirmed the name in the checklist's own form. */
  nameConfirmed?: boolean;
  /** An agent is connected, or was for this repository. */
  agent: boolean;
}

export interface SetupProgress {
  done: Record<SetupItemId, boolean>;
  /** Items that count toward done: Start, Save and Name (Connect an agent is optional; putting the site online comes later). */
  required: SetupItemId[];
  doneCount: number;
  total: number;
  complete: boolean;
}

export const REQUIRED_ITEMS: SetupItemId[] = ["start", "save", "name"];

export function setupProgress(state: SetupState): SetupProgress {
  const named = Boolean(state.siteName && (state.siteName !== state.defaultName || state.nameConfirmed));
  const done: Record<SetupItemId, boolean> = {
    start: state.homePage,
    save: state.committed && state.homePage && !state.homeUnsaved,
    name: named,
    agent: state.agent,
  };
  const doneCount = REQUIRED_ITEMS.filter((id) => done[id]).length;
  return { done, required: REQUIRED_ITEMS, doneCount, total: REQUIRED_ITEMS.length, complete: doneCount === REQUIRED_ITEMS.length };
}

/** What the editor remembers about the checklist for one repository. */
export interface SetupMemory {
  /** A starting point was applied here: the checklist shows by itself. */
  auto?: boolean;
  dismissed?: boolean;
  /** The completed state was shown; it does not come back by itself. */
  finished?: boolean;
  agent?: boolean;
  named?: boolean;
}

type Store = Pick<Storage, "getItem" | "setItem">;

export const setupKey = (account: string, repoId: number) => `native-site-editor:setup:${JSON.stringify([account.toLowerCase(), repoId])}`;

export function readSetupMemory(store: Store, account: string, repoId: number): SetupMemory {
  try {
    const value = JSON.parse(store.getItem(setupKey(account, repoId)) ?? "null");
    if (!value || typeof value !== "object") return {};
    const out: SetupMemory = {};
    for (const key of ["auto", "dismissed", "finished", "agent", "named"] as const) if (value[key] === true) out[key] = true;
    return out;
  } catch {
    return {};
  }
}

export function writeSetupMemory(store: Store, account: string, repoId: number, change: SetupMemory): SetupMemory {
  const next = { ...readSetupMemory(store, account, repoId), ...change };
  try {
    store.setItem(setupKey(account, repoId), JSON.stringify(next));
  } catch {
    // Storage unavailable: the checklist works for this page load only.
  }
  return next;
}

/** Whether the checklist shows now: asked for, or by itself until dismissed or finished. */
export function setupVisible(memory: SetupMemory, opened: boolean): boolean {
  return opened || Boolean(memory.auto && !memory.dismissed && !memory.finished);
}

/**
 * The text of `.editor/config.json` with the site's name and/or address set,
 * the rest of the file kept. A file that is not a JSON object is not
 * overwritten: the answer is a problem to show.
 */
export function withSiteSettings(text: string | undefined, change: { name?: string; url?: string }): { text: string } | { error: string } {
  let value: Record<string, unknown> = {};
  if (text !== undefined && text.trim()) {
    try {
      const parsed: unknown = JSON.parse(text);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
      value = parsed as Record<string, unknown>;
    } catch {
      return { error: ".editor/config.json is not valid JSON, so the editor left it as it is. Fix it in the file first." };
    }
  }
  if (value.site !== undefined && (!value.site || typeof value.site !== "object" || Array.isArray(value.site)))
    return { error: '.editor/config.json has a "site" that is not an object, so the editor left it as it is. Fix it in the file first.' };
  const site: Record<string, unknown> = { ...((value.site as Record<string, unknown> | undefined) ?? {}) };
  if (change.name !== undefined) site.name = change.name;
  if (change.url !== undefined) site.url = change.url;
  return { text: `${JSON.stringify({ ...value, site }, null, 2)}\n` };
}
