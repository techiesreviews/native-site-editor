import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { DraftStore, type SavedDraft } from "../src/drafts.ts";
import { deleteFile, duplicateFile, listChanges, moveFile, publishFiles } from "../src/file-changes.ts";
import {
  MAX_UPLOAD_BYTES,
  WARN_IMAGE_BYTES,
  addUpload,
  base64Of,
  formatBytes,
  gitBlobSha,
  memoryUploadBytes,
  sendUploads,
  sweepUploads,
  uploadDataUrl,
  uploadFileName,
  uploadKey,
  uploadPath,
  uploadProblem,
  uploadWarning,
} from "../src/uploads.ts";
import { GitHub, HttpError } from "../worker/github.ts";
import { base64Bytes, requestBytes, uploadBlob } from "../worker/blobs.ts";
import { blobSha } from "../worker/publish.ts";
import type { Repository } from "../shared/types.ts";

const scope = { account: "Lex", repoId: 7, repo: "lex/site", branch: "main" };
const other = { ...scope, branch: "draft" };

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    key: (index: number) => [...map.keys()][index] ?? null,
    get length() { return map.size; },
  };
}
const gitSha = (bytes: Uint8Array) =>
  createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
// Bytes that are not UTF-8: a PNG signature and every byte value.
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Array.from({ length: 256 }, (_, i) => i)]);
const file = (name: string, bytes: Uint8Array, type = "image/png") => Object.assign(new Blob([bytes], { type }), { name });

test("names are slugged, keep their extension, and never land on a taken path", async () => {
  assert.equal(uploadFileName("My Photo (1).JPG"), "my-photo-1.jpg");
  assert.equal(uploadFileName("Café crème.png"), "cafe-creme.png");
  assert.equal(uploadFileName("C:\\fakepath\\hero_image.webp"), "hero_image.webp");
  assert.equal(uploadFileName("!!!.svg"), "file.svg");
  assert.equal(uploadFileName("README"), "readme");
  assert.equal(uploadFileName(".hidden"), "hidden");
  const taken = new Set(["src/images/photo.jpg", "src/images/photo-2.jpg"]);
  assert.equal(await uploadPath("src/images", "Photo.jpg", (path) => taken.has(path)), "src/images/photo-3.jpg");
  assert.equal(await uploadPath("src/images/", "Other.jpg", (path) => taken.has(path)), "src/images/other.jpg");
  assert.equal(await uploadPath("", "Logo.svg", async () => false), "logo.svg");
});

test("limits: over 20 MB is refused, an image over 2 MB is warned about", () => {
  assert.match(uploadProblem({ name: "big.mov", size: MAX_UPLOAD_BYTES + 1 })!, /limited to 20 MB/);
  assert.equal(uploadProblem({ name: "ok.mov", size: MAX_UPLOAD_BYTES }), undefined);
  assert.match(uploadWarning({ name: "photo.jpg", size: WARN_IMAGE_BYTES + 1 })!, /heavy for a web page/);
  assert.equal(uploadWarning({ name: "photo.jpg", size: WARN_IMAGE_BYTES }), undefined);
  assert.equal(uploadWarning({ name: "video.mp4", size: WARN_IMAGE_BYTES * 4 }), undefined);
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(2048), "2 KB");
  assert.equal(formatBytes(3 * 1024 * 1024), "3 MB");
});

test("the blob SHA and base64 match git's and Node's for binary bytes", async () => {
  assert.equal(await gitBlobSha(png), gitSha(png));
  assert.equal(await blobSha(png), gitSha(png));
  assert.equal(await blobSha("text"), gitSha(new TextEncoder().encode("text")));
  const large = new Uint8Array(100_003).map((_, i) => (i * 31) % 256);
  assert.equal(base64Of(large), Buffer.from(large).toString("base64"));
  assert.equal(base64Bytes(large), Buffer.from(large).toString("base64"));
});

test("an upload is an A change saved as its blob, its bytes kept apart; discarding and sweeping let them go", async () => {
  const drafts = new DraftStore(memoryStorage());
  const bytes = memoryUploadBytes();
  const result = await addUpload({ drafts, bytes, scope, folder: "src/images", file: file("Hero Shot.PNG", png), taken: () => false, now: 1 });
  assert.deepEqual(result, { ok: true, path: "src/images/hero-shot.png", warning: undefined });
  const sha = gitSha(png);
  const draft = drafts.get(scope, "src/images/hero-shot.png")!;
  assert.equal(draft.baseSha, null);
  assert.equal(draft.sourceSha, sha);
  assert.equal(draft.opaque, true);
  assert.deepEqual(draft.upload, { size: png.length, type: "image/png" });
  assert.equal(draft.content, "");
  // Bytes stay out of localStorage.
  const stored = new Uint8Array(await (await bytes.get(uploadKey(scope, sha)))!.arrayBuffer());
  assert.deepEqual(stored, png);

  const changes = listChanges(drafts.list(scope));
  assert.deepEqual(changes.map((change) => [change.kind, change.path]), [["A", "src/images/hero-shot.png"]]);
  assert.deepEqual(publishFiles(changes), [{ path: "src/images/hero-shot.png", baseSha: null, content: "", sha }]);

  // The preview reads it as a data URL.
  assert.equal(await uploadDataUrl(bytes, scope, draft), `data:image/png;base64,${Buffer.from(png).toString("base64")}`);

  // Moved or copied, it is still an upload of the same bytes.
  assert.equal(moveFile(drafts, scope, { path: draft.path }, "src/images/hero.png"), "moved");
  assert.ok(duplicateFile(drafts, scope, { path: "src/images/hero.png" }, "src/images/hero-copy.png"));
  for (const path of ["src/images/hero.png", "src/images/hero-copy.png"]) {
    const moved = drafts.get(scope, path)!;
    assert.equal(moved.sourceSha, sha);
    assert.ok(moved.upload, path);
  }
  await sweepUploads(bytes, scope, drafts.list(scope));
  assert.ok(await bytes.get(uploadKey(scope, sha)));

  // Discarded (deleted before it was ever saved), its bytes are swept; another branch's are not.
  await bytes.put(uploadKey(other, sha), new Blob([png]));
  assert.equal(deleteFile(drafts, scope, { path: "src/images/hero.png" }), "discarded");
  assert.equal(deleteFile(drafts, scope, { path: "src/images/hero-copy.png" }), "discarded");
  assert.deepEqual(drafts.list(scope), []);
  await sweepUploads(bytes, scope, drafts.list(scope));
  assert.equal(await bytes.get(uploadKey(scope, sha)), undefined);
  assert.ok(await bytes.get(uploadKey(other, sha)));
});

test("too large files are refused, and nothing is stored for them", async () => {
  const drafts = new DraftStore(memoryStorage());
  const bytes = memoryUploadBytes();
  const huge = Object.assign(new Blob([new Uint8Array(MAX_UPLOAD_BYTES + 1)]), { name: "huge.bin" });
  const result = await addUpload({ drafts, bytes, scope, folder: "", file: huge, taken: () => false });
  assert.equal(result.ok, false);
  assert.equal(bytes.map.size, 0);
  assert.deepEqual(drafts.list(scope), []);
});

test("before a save, each upload's bytes are sent once; missing bytes stop the save", async () => {
  const drafts = new DraftStore(memoryStorage());
  const bytes = memoryUploadBytes();
  await addUpload({ drafts, bytes, scope, folder: "img", file: file("a.png", png), taken: () => false });
  duplicateFile(drafts, scope, { path: "img/a.png" }, "img/b.png");
  const sent: string[] = [];
  const all = drafts.list(scope);
  await sendUploads(bytes, scope, all, async (blob, sha) => {
    assert.equal(gitSha(new Uint8Array(await blob.arrayBuffer())), sha);
    sent.push(sha);
    return sha;
  });
  assert.deepEqual(sent, [gitSha(png)]);
  await assert.rejects(sendUploads(bytes, scope, all, async () => "0".repeat(40)), /differently/);
  bytes.map.clear();
  await assert.rejects(sendUploads(bytes, scope, all, async (_, sha) => sha), /no longer in this browser/);
  // Text drafts send nothing.
  const text: SavedDraft = { ...scope, version: 1, updatedAt: 0, path: "a.html", baseSha: null, original: "", content: "<p>" };
  await sendUploads(bytes, scope, [text], async () => { throw new Error("not sent"); });
});

const repo: Repository = { id: 1, name: "site", full_name: "lex/site", owner: { login: "lex", type: "User" }, private: true, default_branch: "main" };

test("the worker makes the bytes a GitHub blob, base64-encoded, and checks its SHA", async () => {
  const calls: { path: string; method: string; body: any }[] = [];
  let answer = gitSha(png);
  const github = new GitHub("token", async (input, init) => {
    const body = JSON.parse(String(init?.body));
    calls.push({ path: new URL(String(input)).pathname, method: init?.method ?? "GET", body });
    return Response.json({ sha: answer }, { status: 201 });
  });
  assert.deepEqual(await uploadBlob(github, repo, png, gitSha(png)), { sha: gitSha(png), size: png.length });
  assert.equal(calls[0].path, "/repos/lex/site/git/blobs");
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].body.encoding, "base64");
  assert.deepEqual(new Uint8Array(Buffer.from(calls[0].body.content, "base64")), png);
  // Changed on the way: refused before GitHub is asked.
  await assert.rejects(uploadBlob(github, repo, png, "0".repeat(40)), (error: HttpError) => error.status === 400);
  assert.equal(calls.length, 1);
  answer = "1".repeat(40);
  await assert.rejects(uploadBlob(github, repo, png), (error: HttpError) => error.status === 502);
});

test("the worker reads the body as bytes and refuses too much", async () => {
  const request = (body: Uint8Array) => new Request("https://editor.test/api/blob", { method: "POST", body });
  assert.deepEqual(await requestBytes(request(png)), png);
  await assert.rejects(requestBytes(request(png), 10), (error: HttpError) => error.status === 413);
});
