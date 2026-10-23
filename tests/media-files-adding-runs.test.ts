import { test } from "node:test";
import assert from "node:assert/strict";
import { createFilesAdding, type FilesAddingHost } from "../src/page-builder/media-files-adding-runs";
import type { MediaImportRequest } from "../src/page-builder/media-picker";
import type { MediaWorkspaceContext } from "../src/page-builder/media-workspace";

const ctx = { key: "repo", assertLive() {} } as MediaWorkspaceContext;
// A drop holds the context of the repository it was made in (src/main.ts uploadFilesTo pins it).
const otherCtx = { key: "other", assertLive() {} } as MediaWorkspaceContext;
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

/** Preparation each test releases by hand, so files can be cancelled on the way. */
function fixture(options: { fail?: (name: string) => string | undefined; note?: (name: string) => string | undefined; save?: (requests: MediaImportRequest[]) => Promise<string[]> } = {}) {
  const pending = new Map<string, () => void>(), saves: string[][] = [], savedInto: string[] = [], told: string[] = [], errors: string[] = [];
  let shown = ctx, paints = 0;
  const runs = createFilesAdding({
    prepare: (file, _key, folder, signal) => new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => reject(new DOMException("Cancelled.", "AbortError")), { once: true });
      pending.set(file.name, () => {
        const failure = options.fail?.(file.name);
        if (failure) reject(new Error(failure));
        else resolve({ request: { file, folder }, warning: options.note?.(file.name) });
      });
    }),
    save: async (into, _context, requests) => {
      saves.push(requests.map(request => `${request.folder}/${request.file.name}`));
      savedInto.push(into.key);
      return options.save ? options.save(requests) : requests.map(request => `${request.folder}/${request.file.name}`);
    },
    paint: () => { paints++; },
  });
  // The host as uploadFilesTo makes it for a drop: its context is the one shown at the drop.
  const hostFor = (pinned: MediaWorkspaceContext): FilesAddingHost => ({
    context: async () => pinned, announce: text => told.push(text), error: error => errors.push((error as Error).message),
  });
  const host = hostFor(ctx);
  async function release(name: string) { await settle(); pending.get(name)!(); await settle(); }
  return { runs, host, saves, savedInto, told, errors, release, hostFor, shown: () => shown, switchRepository: () => { shown = otherCtx; }, paints: () => paints,
    states: () => runs.entries().map(entry => `${entry.file.name}:${entry.state}`) };
}
const files = (...names: string[]) => names.map(name => new File(["x"], name));

test("Files adding starts at once, one file at a time; one cancelled file leaves the others to be saved together", async () => {
  const f = fixture();
  const done = f.runs.start("docs", files("a.pdf", "b.pdf", "c.pdf"), f.host);
  await settle();
  assert.deepEqual(f.states(), ["a.pdf:preparing", "b.pdf:waiting", "c.pdf:waiting"]);
  f.runs.cancel(f.runs.entries()[1]);
  await f.release("a.pdf"); await f.release("c.pdf");
  assert.deepEqual(await done, ["docs/a.pdf", "docs/c.pdf"]);
  // One batch: one Undo step for the drop.
  assert.deepEqual(f.saves, [["docs/a.pdf", "docs/c.pdf"]]);
  assert.deepEqual(f.states(), ["a.pdf:added", "b.pdf:cancelled", "c.pdf:added"]);
  assert.deepEqual(f.told, ["Added docs/a.pdf, docs/c.pdf."]);
  assert.ok(f.paints() > 0);
});

test("a Large download note stays with its file and joins the announcement", async () => {
  const f = fixture({ note: name => name === "big.pdf" ? "Large download: big.pdf is 12 MB, which can be slow to load on phones." : undefined });
  const done = f.runs.start("docs", files("big.pdf"), f.host);
  await f.release("big.pdf");
  await done;
  assert.equal(f.runs.entries()[0].note, "Large download: big.pdf is 12 MB, which can be slow to load on phones.");
  assert.deepEqual(f.told, ["Added docs/big.pdf. Large download: big.pdf is 12 MB, which can be slow to load on phones."]);
});

test("a failed file keeps its advice; the rest go in; Retry tries it again as its own step", async () => {
  let refuse = true;
  const f = fixture({ fail: name => refuse && name === "photo.heic" ? "Save photo.heic as a JPEG or PNG and add it again." : undefined });
  const done = f.runs.start("images", files("ok.pdf", "photo.heic"), f.host);
  await f.release("ok.pdf"); await f.release("photo.heic");
  assert.deepEqual(await done, ["images/ok.pdf"]);
  assert.deepEqual(f.states(), ["ok.pdf:added", "photo.heic:failed"]);
  assert.equal(f.runs.entries()[1].error, "Save photo.heic as a JPEG or PNG and add it again.");
  refuse = false;
  f.runs.retry();
  assert.deepEqual(f.states(), ["ok.pdf:added", "photo.heic:waiting"]);
  await f.release("photo.heic");
  assert.deepEqual(f.saves, [["images/ok.pdf"], ["images/photo.heic"]]);
  assert.deepEqual(f.states(), ["ok.pdf:added", "photo.heic:added"]);
});

test("a save that fails marks its files failed with the reason, for Retry", async () => {
  let attempts = 0;
  const f = fixture({ save: async requests => { if (++attempts === 1) throw new Error("This folder changed. Try again."); return requests.map(request => request.file.name); } });
  const done = f.runs.start("", files("a.pdf"), f.host);
  await f.release("a.pdf");
  assert.deepEqual(await done, []);
  assert.deepEqual(f.states(), ["a.pdf:failed"]);
  assert.equal(f.runs.entries()[0].error, "This folder changed. Try again.");
  f.runs.retry(); await f.release("a.pdf");
  assert.deepEqual(f.states(), ["a.pdf:added"]);
});

test("a second drop waits its turn as its own addition; Cancel stops every file not being saved", async () => {
  const f = fixture();
  const first = f.runs.start("a", files("1.pdf", "2.pdf"), f.host);
  const second = f.runs.start("b", files("3.pdf"), f.host);
  await settle();
  assert.deepEqual(f.states(), ["1.pdf:preparing", "2.pdf:waiting", "3.pdf:waiting"]);
  await f.release("1.pdf"); await f.release("2.pdf");
  assert.deepEqual(await first, ["a/1.pdf", "a/2.pdf"]);
  await settle();
  assert.deepEqual(f.states(), ["1.pdf:added", "2.pdf:added", "3.pdf:preparing"]);
  f.runs.cancelAll();
  assert.deepEqual(await second, []);
  assert.deepEqual(f.saves, [["a/1.pdf", "a/2.pdf"]]);
  // Finished: a new drop replaces the summary; Dismiss empties it.
  assert.equal(f.runs.running(), false);
  f.runs.dismiss();
  assert.deepEqual(f.states(), []);
});

// Ticket 23: work finishes where it started. The drop's context is its own repository's, whatever is shown later.
test("a repository switch while adding stops nothing: the drop is saved into the repository it was made in", async () => {
  const f = fixture();
  const done = f.runs.start("", files("a.pdf", "b.pdf"), f.host);
  await f.release("a.pdf");
  f.switchRepository();
  await f.release("b.pdf");
  assert.deepEqual(await done, ["/a.pdf", "/b.pdf"]);
  assert.deepEqual(f.saves, [["/a.pdf", "/b.pdf"]]);
  assert.deepEqual(f.savedInto, ["repo"], "the drop's repository, not the one shown now");
  assert.equal(f.shown().key, "other");
  assert.deepEqual(f.states(), ["a.pdf:added", "b.pdf:added"]);
  assert.deepEqual(f.errors, []);
});

test("a drop whose repository cannot take it any more goes with the reason", async () => {
  const f = fixture();
  const done = f.runs.start("", files("a.pdf"), { ...f.host, context: async () => { throw new Error("Choose a repository before opening Media."); } });
  assert.deepEqual(await done, []);
  assert.deepEqual(f.states(), []);
  assert.deepEqual(f.errors, ["Choose a repository before opening Media."]);
});

test("Review… hands the pictures not added yet to the Optimise sheet with their folder", async () => {
  const f = fixture({ fail: name => name === "broken.png" ? "broken.png could not be prepared." : undefined });
  const reviewed: string[] = [];
  const host = { ...f.host, review: (list: File[], folder: string) => reviewed.push(`${folder}:${list.map(file => file.name).join(",")}`) };
  const done = f.runs.start("about", files("broken.png", "slow.jpg", "notes.pdf"), host);
  await f.release("broken.png");
  assert.deepEqual(f.states(), ["broken.png:failed", "slow.jpg:preparing", "notes.pdf:waiting"]);
  assert.ok(f.runs.reviewable());
  f.runs.review();
  assert.deepEqual(reviewed, ["about:broken.png,slow.jpg"]);
  await f.release("notes.pdf");
  assert.deepEqual(await done, ["about/notes.pdf"]);
  assert.equal(f.runs.reviewable(), undefined);
  // Without a Media tab there is nowhere to review.
  const g = fixture();
  void g.runs.start("", files("a.png"), g.host);
  assert.equal(g.runs.reviewable(), undefined);
});

test("a drop in another repository waits its turn; the earlier one still lands in its own", async () => {
  const f = fixture();
  const first = f.runs.start("a", files("old.pdf"), f.host);
  await settle();
  f.switchRepository();
  const second = f.runs.start("b", files("new.pdf"), f.hostFor(f.shown()));
  assert.deepEqual(f.states(), ["old.pdf:preparing", "new.pdf:waiting"]);
  await f.release("old.pdf");
  assert.deepEqual(await first, ["a/old.pdf"]);
  await f.release("new.pdf");
  assert.deepEqual(await second, ["b/new.pdf"]);
  assert.deepEqual(f.savedInto, ["repo", "other"]);
  assert.deepEqual(f.errors, []);
});

test("Files additions pass the site's remembered video choice next to image quality", async () => {
  let choice: unknown;
  const runs = createFilesAdding({
    settings: async () => ({ image: "smaller", video: "higher", keepOriginal: true }),
    prepare: async (file, _key, folder, _signal, image, original, video) => { choice = [image, original, video]; return { request: { file, folder } }; },
    save: async () => ["clips/video.mp4"], paint() {},
  });
  await runs.start("clips", [new File(["video"], "video.mp4")], { context: async () => ctx, announce() {}, error(error) { throw error; } });
  assert.deepEqual(choice, ["smaller", true, "higher"]);
});
