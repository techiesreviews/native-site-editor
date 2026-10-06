import { expect, type Page } from "@playwright/test";

// The drafts this browser keeps (IndexedDB `native-site-editor-drafts`,
// src/drafts.ts), once the page has written what it had pending: a
// `pagehide` flushes at once, and a read begun after it sees the write.
export type StoredDraft = { path: string; content: string; deleted?: true; movedFrom?: string; [field: string]: unknown };

export async function storedDrafts(page: Page): Promise<StoredDraft[]> {
  const drafts = await page.evaluate(async () => {
    window.dispatchEvent(new Event("pagehide"));
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("native-site-editor-drafts", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("drafts");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<StoredDraft[]>((resolve, reject) => {
        const request = db.transaction("drafts", "readonly").objectStore("drafts").getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
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

// Monaco loads once the preview has painted and the browser is idle
// (lean-fast-editor ticket 03), so a test that drives the mounted editor
// directly waits for the open file's pane first.
export async function editorMounted(page: Page, path = "index.html") {
  await expect.poll(() => page.evaluate(async (path) => (await import("/src/components/code-editor.ts")).isMounted(path), path), { timeout: 20_000 }).toBe(true);
}
