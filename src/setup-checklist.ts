// Setup in the Inbox (TOOLS-188): the setup rows a site the editor made lists
// until each is done, from the state the editor already holds, and what it
// remembers per account and repository. Pure, so it is tested without a
// browser (tests/setup-checklist.test.ts).

/** Name your site, and Connect an agent (optional). */
export type SetupRow = "name" | "agent";

export interface SetupRowState {
  /** The site name in `.editor/config.json`, drafts included. */
  siteName?: string;
  /** The site name a repository of this name starts with. */
  defaultName: string;
  /** An agent is connected now. */
  agent: boolean;
}

/** What the editor remembers about setup for one repository. */
export interface SetupMemory {
  /** The setup wizard or Start your site made the site here: its setup rows show in the Inbox. */
  auto?: boolean;
  /** An agent was connected for this repository. */
  agent?: boolean;
  /** The name was saved from the Inbox's own form, even the default one. */
  named?: boolean;
}

/** The setup rows still open: only for a site the editor made, each until done. */
export function setupRows(memory: SetupMemory, state: SetupRowState): SetupRow[] {
  if (!memory.auto) return [];
  const named = Boolean(state.siteName && (state.siteName !== state.defaultName || memory.named));
  const rows: SetupRow[] = [];
  if (!named) rows.push("name");
  if (!memory.agent && !state.agent) rows.push("agent");
  return rows;
}

type Store = Pick<Storage, "getItem" | "setItem">;

export const setupKey = (account: string, repoId: number) => `native-site-editor:setup:${JSON.stringify([account.toLowerCase(), repoId])}`;

export function readSetupMemory(store: Store, account: string, repoId: number): SetupMemory {
  try {
    const value = JSON.parse(store.getItem(setupKey(account, repoId)) ?? "null");
    if (!value || typeof value !== "object") return {};
    const out: SetupMemory = {};
    for (const key of ["auto", "agent", "named"] as const) if (value[key] === true) out[key] = true;
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
    // Storage unavailable: setup is remembered for this page load only.
  }
  return next;
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
