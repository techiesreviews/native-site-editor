import { test } from "node:test";
import assert from "node:assert/strict";
import { pdfjsAssetOptions, pdfPreviewSize, preparePdf, type PdfPreviewDeps } from "../src/page-builder/pdf-preview";
import { prepareMediaFile } from "../src/page-builder/media-prepare";
import { createMediaWorkspace, type MediaWorkspaceBatch, type MediaWorkspaceContext } from "../src/page-builder/media-workspace";
import { MEDIA_RECORDS_PATH, parseMediaRecords } from "../shared/media-records";
import { MAX_UPLOAD_BYTES } from "../src/uploads";

const file = new File(["%PDF-1.4\noriginal document"], "Report.PDF");
function fake(options: { broken?: boolean; pending?: boolean; png?: boolean } = {}) {
  let loaded = 0, destroyed = 0, rendered = 0, copied: Uint8Array | undefined;
  const document = {
    getPage: async () => ({
      getViewport: ({ scale }: { scale: number }) => ({ width: 1200 * scale, height: 1800 * scale }),
      render: (settings: { background: string }) => {
        assert.equal(settings.background, "rgb(255,255,255)"); rendered++;
        return { promise: Promise.resolve(), cancel() {} };
      },
    }),
  };
  const task = {
    promise: options.broken ? Promise.reject(new Error("Encrypted")) : options.pending ? new Promise<typeof document>(() => {}) : Promise.resolve(document),
    destroy: async () => { destroyed++; },
  };
  // pdf.js's unused document/page APIs are deliberately omitted from this focused fake.
  // eslint-disable-next-line no-restricted-syntax -- Fake only getDocument and the page/loading APIs used here.
  const pdfjs: NonNullable<PdfPreviewDeps["pdfjs"]> = async () => ({
    getDocument: (settings: { data: Uint8Array; isEvalSupported: boolean }) => {
      loaded++; assert.equal(settings.isEvalSupported, false); copied = settings.data;
      // Model pdf.js's worker transfer: the copy is detached, never the original stored Blob.
      structuredClone(settings.data, { transfer: [settings.data.buffer] });
      return task;
    },
  }) as unknown as Awaited<ReturnType<NonNullable<PdfPreviewDeps["pdfjs"]>>>;
  // Rendering needs only a sized canvas and a context; no DOM is needed in unit tests.
  // eslint-disable-next-line no-restricted-syntax -- A minimal canvas for the injected renderer and encoder.
  const canvas = { width: 0, height: 0, getContext: () => ({}) } as unknown as HTMLCanvasElement;
  const deps: PdfPreviewDeps = { pdfjs, canvas: () => canvas, encode: async () => new Blob(["preview"], { type: options.png ? "image/png" : "image/webp" }) };
  return { deps, loaded: () => loaded, destroyed: () => destroyed, rendered: () => rendered, copied: () => copied };
}
test("pdf.js gets its CMaps, standard fonts, WASM decoders and ICC profiles from the versioned assets folder", async () => {
  assert.deepEqual(pdfjsAssetOptions("6.4.299"), { cMapUrl: "/assets/pdfjs-6.4.299/cmaps/", cMapPacked: true,
    standardFontDataUrl: "/assets/pdfjs-6.4.299/standard_fonts/", wasmUrl: "/assets/pdfjs-6.4.299/wasm/", iccUrl: "/assets/pdfjs-6.4.299/iccs/" });
  assert.equal(pdfjsAssetOptions("1.0.0", "/editor").wasmUrl, "/editor/assets/pdfjs-1.0.0/wasm/");
  let seen: Record<string, unknown> | undefined;
  const f = fake();
  const inner = f.deps.pdfjs!;
  const deps: PdfPreviewDeps = { ...f.deps, pdfjs: async () => {
    const pdf = await inner();
    return { version: "6.4.299", getDocument: ((settings: Record<string, unknown>) => { seen = settings; return pdf.getDocument(settings as never); }) as typeof pdf.getDocument };
  } };
  assert.ok((await preparePdf(file, undefined, deps))?.still);
  assert.equal(seen?.wasmUrl, "/assets/pdfjs-6.4.299/wasm/");
  assert.equal(seen?.cMapUrl, "/assets/pdfjs-6.4.299/cmaps/");
  assert.equal(seen?.standardFontDataUrl, "/assets/pdfjs-6.4.299/standard_fonts/");
  assert.equal(seen?.iccUrl, "/assets/pdfjs-6.4.299/iccs/");
});
test("page size fits 960 by 1440 without enlargement", () => {
  assert.deepEqual(pdfPreviewSize(1200, 1800), { width: 960, height: 1440 });
  assert.deepEqual(pdfPreviewSize(2000, 1000), { width: 960, height: 480 });
  assert.deepEqual(pdfPreviewSize(600, 2400), { width: 360, height: 1440 });
  assert.deepEqual(pdfPreviewSize(100, 50), { width: 100, height: 50 });
  assert.throws(() => pdfPreviewSize(0, 100), /Invalid/);
});
test("preview is WebP; stored PDF retains its exact bytes while pdf.js transfers a copy", async () => {
  const f = fake(), original = new Uint8Array(await file.arrayBuffer());
  const result = await preparePdf(file, undefined, f.deps);
  assert.equal(result?.outputs[0].blob, file);
  assert.deepEqual(new Uint8Array(await result!.outputs[0].blob.arrayBuffer()), original);
  assert.equal(f.copied()?.byteLength, 0);
  assert.deepEqual(result?.still, { blob: result?.still?.blob, extension: "webp", width: 960, height: 1440 });
  assert.equal(result?.still?.blob.type, "image/webp");
  assert.equal(f.loaded(), 1); assert.equal(f.rendered(), 1); assert.equal(f.destroyed(), 1);
});
test("other downloads, invalid PDF signatures and oversized PDFs never load pdf.js", async () => {
  const deps: PdfPreviewDeps = { pdfjs: async () => assert.fail("must not load pdf.js") };
  for (const source of [new File(["%PDF-"], "notes.txt"), new File(["no signature"], "notes.pdf"),
    new File([" ".repeat(1024) + "%PDF-"], "late.pdf")]) assert.equal(await preparePdf(source, undefined, deps), undefined);
  await assert.rejects(preparePdf(new File([new Uint8Array(MAX_UPLOAD_BYTES + 1)], "big.pdf"), undefined, deps), /uploads are limited/);
  const result = await prepareMediaFile(new File(["download"], "report.zip"), "repo", undefined, undefined, undefined, undefined, undefined,
    "balanced", false, "balanced", undefined, "balanced", { pdf: async () => assert.fail("must not attempt preview") });
  assert.equal(result.request.result, undefined);
});
test("broken, timed out and non-WebP previews add unchanged with a note; abort still cancels", async () => {
  for (const options of [{ broken: true }, { pending: true }, { png: true }]) {
    const f = fake(options);
    const prepared = await prepareMediaFile(file, "repo", undefined, undefined, undefined, async () => assert.fail("must not ask"),
      undefined, "balanced", false, "balanced", undefined, "balanced", { pdf: (source, signal) => preparePdf(source, signal, { ...f.deps, timeout: 5 }) });
    assert.equal(prepared.warning, "Report.PDF was added without a preview picture.");
    assert.equal(prepared.request.result?.outputs[0].blob, file); assert.equal(prepared.request.result?.still, undefined);
    assert.ok(f.destroyed() > 0);
  }
  const work = new AbortController(), f = fake({ pending: true });
  const pending = preparePdf(file, work.signal, f.deps);
  while (!f.loaded()) await new Promise(resolve => setImmediate(resolve));
  work.abort(); await assert.rejects(pending, /abort/i); assert.ok(f.destroyed() > 0);
});

test("workspace adds PDF and matching preview in one batch, links still, numbers conflicts together", async () => {
  for (const existing of [[], ["media/downloads/report.pdf"], ["media/downloads/report.webp"]]) {
    const batches: MediaWorkspaceBatch[] = [];
    const ctx: MediaWorkspaceContext = {
      key: "repo", scope: { account: "owner", repoId: 1, repo: "owner/repo", branch: "main" },
      paths: existing, pages: [], components: {}, items: [],
      drafts: { get: () => undefined, save: () => false, remove: () => false },
      assertLive() {}, read: async () => undefined, blob: async () => new Blob(),
      assetVersion: () => undefined, openPage: async () => {}, applyBatch: async batch => { batches.push(batch); },
    };
    const result = await preparePdf(file, undefined, fake().deps);
    const paths = await createMediaWorkspace(async () => ctx).import([{ file, result, folder: "media/downloads" }]);
    const base = existing.length ? "media/downloads/report-2" : "media/downloads/report";
    assert.deepEqual(paths, [base + ".pdf"]); assert.equal(batches.length, 1);
    assert.deepEqual(batches[0].uploads.map(upload => upload.path), [base + ".pdf", base + ".webp"]);
    assert.equal(batches[0].uploads[0].blob, file);
    assert.equal(parseMediaRecords(batches[0].edits.get(MEDIA_RECORDS_PATH)).files[base + ".pdf"].still, base + ".webp");
  }
});

test("failure to load the preview module keeps the PDF without asking", async () => {
  const prepared = await prepareMediaFile(file, "repo", undefined, undefined, undefined, async () => assert.fail("must not ask"),
    undefined, "balanced", false, "balanced", undefined, "balanced", { pdf: async () => { throw new Error("Module unavailable"); } });
  assert.equal(prepared.request.result?.outputs[0].blob, file);
  assert.equal(prepared.warning, "Report.PDF was added without a preview picture.");
});
