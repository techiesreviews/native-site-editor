// Uploaded files (images and other binary files) as publishable drafts.
//
// An upload is a new-file draft (src/drafts.ts) like any other A change,
// marked `upload`, whose content is not text: `sourceSha` is the git blob
// SHA of its bytes and `opaque` says the text is not held, so Save sends it
// as that blob (src/file-changes.ts `publishFiles`). The bytes themselves
// stay out of the draft record, in an IndexedDB database of their own,
// keyed by the draft scope and the SHA; a moved
// or copied upload keeps its SHA and so its bytes. Before a save, each
// upload's bytes go to `/api/blob` (worker/blobs.ts), which makes them a
// GitHub blob; the commit then names the blob. Bytes no draft refers to any
// more (discarded or saved) are swept away.
import type { DraftScope, SavedDraft } from "./drafts";
import type { DraftAccess } from "./file-changes";

/** The largest file one upload may be (the worker refuses more, worker/blobs.ts). */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
/** Above this an image is heavy for a web page: uploaded, with a warning. */
export const WARN_IMAGE_BYTES = 2 * 1024 * 1024;
/** Where images go unless a folder is chosen (the starter keeps its images there). */
export const DEFAULT_IMAGE_FOLDER = "images";

const IMAGE_TYPES: Record<string, string> = {
  svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
  webp: "image/webp", avif: "image/avif", ico: "image/x-icon", bmp: "image/bmp",
};
const extension = (path: string) => (/\.([^./]+)$/.exec(path)?.[1] ?? "").toLowerCase();
/** The image type of a path by its extension, or undefined for anything else. */
export const uploadImageType = (path: string): string | undefined => IMAGE_TYPES[extension(path)];

/** "My Photo (1).JPG" → "my-photo-1.jpg": letters, digits, - and _ only, lower case. */
export function uploadFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot + 1) : "";
  const slug = (text: string) => text.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9_]+/g, "-").replace(/^-+|-+$/g, "");
  const cleanExt = slug(ext).replace(/[-_]/g, "");
  return `${slug(stem) || "file"}${cleanExt ? `.${cleanExt}` : ""}`;
}

/** Where `name` goes in `folder`: its slug, or with -2, -3… before the extension when that is taken. */
export async function uploadPath(folder: string, name: string, taken: (path: string) => boolean | Promise<boolean>): Promise<string> {
  const file = uploadFileName(name);
  const dir = folder.replace(/^\/+|\/+$/g, "");
  const at = (text: string) => (dir ? `${dir}/${text}` : text);
  if (!(await taken(at(file)))) return at(file);
  const dot = file.lastIndexOf(".");
  const stem = dot > 0 ? file.slice(0, dot) : file;
  const ext = dot > 0 ? file.slice(dot) : "";
  for (let n = 2; ; n++) if (!(await taken(at(`${stem}-${n}${ext}`)))) return at(`${stem}-${n}${ext}`);
}

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1).replace(/\.0$/, "")} MB`;
}

/** Why `file` cannot be uploaded, or nothing. */
export function uploadProblem(file: { name: string; size: number }): string | undefined {
  if (file.size > MAX_UPLOAD_BYTES)
    return `${file.name} is ${formatBytes(file.size)}; uploads are limited to ${formatBytes(MAX_UPLOAD_BYTES)} per file.`;
}

/** A note for a file that uploads but is heavy for the web, or nothing. */
export function uploadWarning(file: { name: string; size: number }): string | undefined {
  if (uploadImageType(file.name) && file.size > WARN_IMAGE_BYTES)
    return `${file.name} is ${formatBytes(file.size)}, heavy for a web page; a smaller image loads faster.`;
}

/** The git blob SHA of `bytes`, as GitHub names the file. */
export async function gitBlobSha(bytes: Uint8Array): Promise<string> {
  const header = new TextEncoder().encode(`blob ${bytes.length}\0`);
  const all = new Uint8Array(header.length + bytes.length);
  all.set(header);
  all.set(bytes, header.length);
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-1", all)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Base64 of `bytes`, in slices of a multiple of 3 bytes so they join. */
export function base64Of(bytes: Uint8Array): string {
  let out = "";
  const step = 3 * 8192;
  for (let index = 0; index < bytes.length; index += step)
    out += btoa(String.fromCharCode(...bytes.subarray(index, index + step)));
  return out;
}

/** Where upload bytes are kept: IndexedDB in the browser, a map in tests. */
export interface UploadBytes {
  put(key: string, bytes: Blob): Promise<void>;
  get(key: string): Promise<Blob | undefined>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

export const uploadKey = (scope: DraftScope, sha: string) =>
  JSON.stringify([scope.account.toLowerCase(), scope.repoId, scope.branch, sha]);

export function memoryUploadBytes(): UploadBytes & { map: Map<string, Blob> } {
  const map = new Map<string, Blob>();
  return {
    map,
    async put(key, bytes) { map.set(key, bytes); },
    async get(key) { return map.get(key); },
    async delete(key) { map.delete(key); },
    async keys() { return [...map.keys()]; },
  };
}

/** The browser's store: one IndexedDB object store, opened on first use. */
export function indexedDbUploadBytes(name = "native-site-editor-uploads"): UploadBytes {
  let db: Promise<IDBDatabase> | undefined;
  const open = () => db ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("bytes");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { db = undefined; reject(request.error ?? new Error("Browser file storage is unavailable.")); };
  });
  const run = async <T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>) => {
    const store = (await open()).transaction("bytes", mode).objectStore("bytes");
    return new Promise<T>((resolve, reject) => {
      const request = work(store);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Browser file storage failed."));
    });
  };
  return {
    async put(key, bytes) { await run("readwrite", (store) => store.put(bytes, key)); },
    async get(key) { return (await run<Blob | undefined>("readonly", (store) => store.get(key))) ?? undefined; },
    async delete(key) { await run("readwrite", (store) => store.delete(key)); },
    async keys() { return (await run("readonly", (store) => store.getAllKeys())).map(String); },
  };
}

let instance: UploadBytes | undefined;
export function uploadBytes(): UploadBytes {
  return instance ??= indexedDbUploadBytes();
}

/** Bytes being added whose draft is not saved yet. */
const adding = new Set<string>();

export type UploadResult = { ok: true; path: string; warning?: string } | { ok: false; error: string };

/**
 * Adds `file` in `folder` as a new-file draft (its bytes stored first, so a
 * draft never points at bytes that are not there). `taken` says whether a
 * path already holds something; the upload never overwrites it.
 */
export async function addUpload(options: {
  drafts: DraftAccess;
  bytes: UploadBytes;
  scope: DraftScope;
  folder: string;
  file: Blob & { name: string };
  taken: (path: string) => boolean | Promise<boolean>;
  now?: number;
}): Promise<UploadResult> {
  const { file, scope } = options;
  const problem = uploadProblem(file);
  if (problem) return { ok: false, error: problem };
  const path = await uploadPath(options.folder, file.name, options.taken);
  const data = new Uint8Array(await file.arrayBuffer());
  const sha = await gitBlobSha(data);
  const type = file.type || uploadImageType(path) || "application/octet-stream";
  const key = uploadKey(scope, sha);
  // Kept from a sweep until its draft exists.
  adding.add(key);
  try {
    await options.bytes.put(key, new Blob([data], { type }));
  } catch {
    adding.delete(key);
    return { ok: false, error: `${file.name} could not be kept in this browser. Free some browser storage and try again.` };
  }
  const draft: SavedDraft = {
    account: scope.account, repoId: scope.repoId, repo: scope.repo, branch: scope.branch, version: 1,
    updatedAt: options.now ?? Date.now(), path, baseSha: null, original: "", content: "",
    sourceSha: sha, opaque: true, upload: { size: data.length, type },
  };
  const saved = options.drafts.save(draft);
  adding.delete(key);
  if (!saved) {
    options.drafts.remove(scope, path);
    return { ok: false, error: `${file.name} could not be added to your drafts.` };
  }
  return { ok: true, path, warning: uploadWarning(file) };
}

/** Upload drafts among `drafts` (not deletions). */
export const uploadDrafts = (drafts: SavedDraft[]) => drafts.filter((draft) => draft.upload && draft.sourceSha && !draft.deleted);

/** Removes the stored bytes of `scope` that none of its drafts (`drafts`, all of them) refers to. */
export async function sweepUploads(bytes: UploadBytes, scope: DraftScope, drafts: SavedDraft[]) {
  const kept = new Set(uploadDrafts(drafts).map((draft) => uploadKey(scope, draft.sourceSha!)));
  const prefix = uploadKey(scope, "").slice(0, -3);
  for (const key of await bytes.keys())
    if (key.startsWith(prefix) && !kept.has(key) && !adding.has(key)) await bytes.delete(key);
}

/** An upload's bytes as a data URL (the sandboxed preview cannot read blob: URLs), or nothing when they are gone. */
export async function uploadDataUrl(bytes: UploadBytes, scope: DraftScope, draft: SavedDraft): Promise<string | undefined> {
  if (!draft.upload || !draft.sourceSha) return undefined;
  const blob = await bytes.get(uploadKey(scope, draft.sourceSha));
  if (!blob) return undefined;
  const type = uploadImageType(draft.path) ?? draft.upload.type;
  return `data:${type};base64,${base64Of(new Uint8Array(await blob.arrayBuffer()))}`;
}

/**
 * Before a save: each upload among `drafts` becomes a GitHub blob, by
 * `send` (a POST to `/api/blob`), which answers the blob's SHA. Throws when
 * bytes are missing or GitHub stored something else; nothing is committed then.
 */
export async function sendUploads(
  bytes: UploadBytes,
  scope: DraftScope,
  drafts: SavedDraft[],
  send: (blob: Blob, sha: string) => Promise<string>,
) {
  const sent = new Set<string>();
  for (const draft of uploadDrafts(drafts)) {
    const sha = draft.sourceSha!;
    if (sent.has(sha)) continue;
    const blob = await bytes.get(uploadKey(scope, sha));
    if (!blob) throw new Error(`${draft.path} is no longer in this browser's storage. Discard it and upload the file again.`);
    if ((await send(blob, sha)) !== sha) throw new Error(`GitHub stored ${draft.path} differently. Your drafts are kept.`);
    sent.add(sha);
  }
}

/** POSTs an upload's bytes to the worker; resolves to the blob SHA. */
export async function postUpload(repo: string, blob: Blob, sha: string): Promise<string> {
  const response = await fetch(`/api/blob?${new URLSearchParams({ repo, sha })}`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/octet-stream" },
    body: blob,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error ?? "The upload failed. Your drafts are kept."), { status: response.status });
  return data.sha;
}

/** Opens the browser's file picker; resolves to the files chosen (none when cancelled). */
export function pickFiles(options: { accept?: string; multiple?: boolean } = {}): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.hidden = true;
    input.className = "upload-picker";
    if (options.accept) input.accept = options.accept;
    input.multiple = options.multiple ?? true;
    const done = (files: File[]) => { input.remove(); resolve(files); };
    input.addEventListener("change", () => done([...(input.files ?? [])]));
    input.addEventListener("cancel", () => done([]));
    document.body.append(input);
    input.click();
  });
}

/** Whether a drag carries files from outside the page (the desktop). */
export const dragHasFiles = (event: DragEvent) => Boolean(event.dataTransfer?.types.includes("Files"));
