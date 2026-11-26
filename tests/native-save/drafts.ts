import { expect, type Page } from "@playwright/test";

// The drafts this browser keeps (IndexedDB `native-site-editor-drafts`,
// src/drafts.ts), once the page has written what it had pending. Flush the
// store directly: a synthetic pagehide would also close the live agent relay.
// Only drafts the editor would show: the store also holds discard records
// (`astro-site-editor:discard:v1:`), and a draft no newer than its record is
// hidden, as `discardHides` in src/drafts.ts decides.
export type StoredDraft = { path: string; content: string; deleted?: true; movedFrom?: string; [field: string]: unknown };

export async function storedDrafts(page: Page): Promise<StoredDraft[]> {
  const drafts = await page.evaluate(async () => {
    const draftPrefix = "astro-site-editor:draft:v1:", discardPrefix = "astro-site-editor:discard:v1:";
    await (await import("/src/drafts.ts")).draftStore().flush();
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("native-site-editor-drafts");
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains("drafts")) request.result.createObjectStore("drafts"); };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      // Keys and values in one transaction: each draft is read with its discard record.
      const store = db.transaction("drafts", "readonly").objectStore("drafts");
      const read = <T>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const [keys, values] = await Promise.all([read(store.getAllKeys()), read<StoredDraft[]>(store.getAll())]);
      const records = new Map(keys.map((key, index) => [String(key), values[index]]));
      return [...records].flatMap(([key, draft]) => {
        if (!key.startsWith(draftPrefix)) return [];
        const discardedAt = Number(records.get(discardPrefix + key.slice(draftPrefix.length))?.updatedAt);
        return Number(draft.updatedAt) <= discardedAt ? [] : [draft];
      });
    } finally {
      db.close();
    }
  });
  return drafts.sort((a, b) => a.path.localeCompare(b.path));
}

/** The stored draft of `path`, whatever its scope. */
export const storedDraft = async (page: Page, path: string): Promise<StoredDraft | undefined> =>
  (await storedDrafts(page)).find((draft) => draft.path === path);

/** Draft keys still in localStorage (none once the page loaded them into IndexedDB). */
export const legacyDraftKeys = (page: Page) =>
  page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("astro-site-editor:draft:v1:")));

/**
 * The editor's text for `path`: its stored draft (undefined when the draft
 * deletes the file), else the branch file (undefined when the branch has none).
 */
export async function effectiveSource(page: Page, baseURL: string | undefined, path: string): Promise<string | undefined> {
  const draft = await storedDraft(page, path);
  if (draft) return draft.deleted ? undefined : draft.content;
  const response = await page.request.get(`${baseURL}/__demo/file?path=${encodeURIComponent(path)}`);
  return response.ok() ? response.text() : undefined;
}

// The open file's source editor mounts once its file is read, before Monaco
// (lean-fast-editor ticket 03). A test that drives the mounted editor or its
// code directly waits for the open file's pane with its code shown: importing
// the code editor brings Monaco and attaches its view at once.
export async function editorMounted(page: Page, path = "index.html") {
  await expect.poll(() => page.evaluate(async (path) => (await import("/src/components/code-editor.ts")).isMounted(path), path), { timeout: 20_000 }).toBe(true);
  await expect(page.locator(".code-editor .monaco-editor").first()).toBeAttached();
}
