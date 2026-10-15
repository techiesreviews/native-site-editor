import { test } from "node:test";
import assert from "node:assert/strict";
import { MEDIA_LIST_LIMIT, isPreviewablePicture, mediaKind, textBytes } from "../shared/agent.ts";
import { parseMediaRecords } from "../shared/media-records.ts";
import { mediaListReport, isAgentMediaPath, type MediaListInput } from "../src/agent-media.ts";
import { mediaUsageRecords } from "../src/page-builder/media-usage.ts";

const items = [
  { path: "images/photo.webp", size: 100, draft: true },
  { path: "images/photo-480w.webp", size: 40 },
  { path: "media/originals/photo.jpg", size: 200 },
  { path: "images/decoration.svg", size: 10 },
  { path: "files/menu.pdf", size: 50 },
];
function input(): MediaListInput {
  const paths = items.map(item => item.path);
  return { items, paths, offset: 0, limit: 100,
    records: parseMediaRecords(JSON.stringify({ version: 2, collections: ["Food"], files: {
      "images/photo.webp": { description: { text: "A bowl of soup", byAgent: true }, collections: ["Food"], alwaysKeep: true },
      "images/decoration.svg": { decorative: true },
    } })),
    usage: mediaUsageRecords({ media: paths, pages: ["index.html"], sources: { "index.html": '<img src="/images/photo-480w.webp"><link rel="stylesheet" href="/styles/site.css">', "styles/site.css": 'body { background: url(/images/decoration.svg) }' } }),
  };
}
test("media reports group copies and originals, describe files and preserve usage and marks", () => {
  const report = mediaListReport(input());
  assert.equal(report.total, 3);
  const photo = report.media.find(item => item.path === "images/photo.webp")!;
  assert.equal(photo.kind, "image");
  assert.equal(photo.size, 100);
  assert.equal(photo.totalSize, 340);
  assert.deepEqual(photo.family, { copies: ["images/photo-480w.webp"], originals: ["media/originals/photo.jpg"] });
  assert.deepEqual(photo.description, { text: "A bowl of soup", byAgent: true });
  assert.deepEqual(photo.collections, ["Food"]);
  assert.equal(photo.alwaysKeep, true);
  assert.equal(photo.draft, true);
  assert.deepEqual(photo.uses, { checked: true, state: "used-on-pages", pages: ["index.html"] });
  const decoration = report.media.find(item => item.path === "images/decoration.svg")!;
  assert.equal(decoration.decorative, true);
  assert.deepEqual(decoration.uses.other, [{ file: "styles/site.css", kind: "stylesheet" }]);
  assert.equal(report.media[0].described, false);
});
test("unreadable sources leave files Not checked yet; unreadable records have a note", () => {
  const data = input();
  data.usage = mediaUsageRecords({ media: data.paths, pages: ["index.html"], sources: { "index.html": undefined } });
  data.records = undefined;
  const report = mediaListReport(data);
  assert.deepEqual(report.notChecked, ["index.html"]);
  assert.match(report.note!, /could not be read/);
  assert.ok(report.media.every(item => item.uses.checked === false && item.uses.state === "not-checked"));
  assert.ok(report.media.every(item => item.described === false));
});
test("folder filtering and paging use the sorted main paths", () => {
  const report = mediaListReport({ ...input(), folder: "images/", limit: 1 });
  assert.equal(report.total, 2);
  assert.equal(report.nextOffset, 1);
  assert.equal(report.media[0].path, "images/decoration.svg");
  const next = mediaListReport({ ...input(), folder: "images", offset: 1, limit: 1 });
  assert.equal(next.media[0].path, "images/photo.webp");
  assert.equal(next.nextOffset, undefined);
  assert.equal(mediaListReport({ ...input(), offset: 99 }).count, 0);
});
test("size fitting pages complete entries without losing fields, counting UTF-8 bytes", () => {
  const data = input();
  data.items = Array.from({ length: 100 }, (_, i) => ({ path: `files/${String(i).padStart(3, "0")}.pdf`, size: i }));
  data.paths = data.items.map(item => item.path);
  data.records = parseMediaRecords(JSON.stringify({ version: 2, collections: [], files: Object.fromEntries(data.paths.map(path => [path, { description: { text: "湯".repeat(500) } }])) }));
  const report = mediaListReport(data);
  assert.ok(report.count > 0 && report.count < 100);
  assert.equal(report.nextOffset, report.count);
  assert.ok(textBytes(JSON.stringify(report)) <= MEDIA_LIST_LIMIT);
  assert.ok(report.media.every(item => item.description?.text === "湯".repeat(500)));
  assert.throws(() => mediaListReport({ ...data, note: "x".repeat(MEDIA_LIST_LIMIT) }), /cannot fit/);
});
test("kind and preview rules include pictures, documents, video, audio and other downloads", () => {
  for (const extension of ["jpg", "jpeg", "PNG", "webp", "gif", "avif", "svg"]) {
    assert.equal(mediaKind(`photo.${extension}`), "image");
    assert.equal(isPreviewablePicture(`photo.${extension}`), true);
  }
  for (const [extension, kind] of [["pdf", "document"], ["docx", "document"], ["mp4", "video"], ["mp3", "audio"], ["zip", "other"], ["heic", "image"]]) {
    assert.equal(mediaKind(`files/file.${extension}`), kind);
    assert.equal(isPreviewablePicture(`files/file.${extension}`), false);
    assert.equal(isAgentMediaPath(`files/file.${extension}`), true);
  }
  for (const path of ["index.html", "styles/site.css", "scripts/site.js", "README.md", ".editor/media.json", "node_modules/image.png", ".github/test.png", ".nojekyll", "images/.DS_Store"]) assert.equal(isAgentMediaPath(path), false);
});

test("workspace reports include non-picture media and retain failed source reads as Not checked yet", async () => {
  const { listWorkspaceMedia } = await import("../src/agent-media.ts");
  const ctx = {
    paths: [...items.map(item => item.path), "index.html", ".editor/media.json"], items,
    pages: ["index.html"], components: {}, assertLive: () => {},
    read: async (path: string) => { if (path === "index.html") throw new Error("Read refused"); return "{malformed"; },
  } satisfies Pick<import("../src/page-builder/media-workspace.ts").MediaWorkspaceContext, "paths" | "items" | "pages" | "components" | "assertLive" | "read">;
  // This read-only report needs no blob or editing ports.
  const report = JSON.parse(await listWorkspaceMedia(ctx as import("../src/page-builder/media-workspace.ts").MediaWorkspaceContext, { offset: 0, limit: 100 }));
  assert.match(report.note, /malformed/);
  assert.deepEqual(report.notChecked, ["index.html"]);
  assert.equal(report.media.find((item: { path: string }) => item.path === "files/menu.pdf").kind, "document");
  assert.ok(report.media.every((item: { uses: { checked: boolean } }) => !item.uses.checked));
});

test("tab commands return reports and previews and refuse documents before reading them", async () => {
  const { applySiteCommand } = await import("../src/agent-site.ts");
  const preview = { data: "UklGRg==", mimeType: "image/webp", width: 1, height: 1, originalWidth: 1, originalHeight: 1 };
  const actions = {
    listMedia: async (request: { folder?: string; offset: number; limit: number }) => {
      assert.deepEqual(request, { folder: "images", offset: 1, limit: 2 }); return JSON.stringify({ count: 2, total: 4 });
    },
    previewMedia: async (path: string) => { assert.equal(path, "images/photo.webp"); return preview; },
  } satisfies Pick<import("../src/agent-site.ts").AgentSiteActions, "listMedia" | "previewMedia">;
  // These read commands only exercise media ports.
  const ports = actions as import("../src/agent-site.ts").AgentSiteActions;
  const command = { id: "test", operation: "list_media", path: "images", branch: "main", commit: "abc", content: "", state: "pending", createdAt: 0,
    args: { folder: "images", offset: 1, limit: 2 } } satisfies import("../shared/agent.ts").AgentCommand;
  assert.deepEqual(await applySiteCommand(ports, command), { message: "Listed 2 of 4 media files.", result: { report: '{"count":2,"total":4}' } });
  assert.deepEqual((await applySiteCommand(ports, { ...command, operation: "preview_media", path: "images/photo.webp" })).result, preview);
  await assert.rejects(applySiteCommand(ports, { ...command, operation: "preview_media", path: "files/menu.pdf" }), /document \(PDF\)/);
  await assert.rejects(applySiteCommand(ports, { ...command, operation: "preview_media", path: "files/notes" }), /files\/notes is not a picture; preview_media/);
});

test("workspace reports show starting collections before the first save, as the editor reads them", async () => {
  const { listWorkspaceMedia } = await import("../src/agent-media.ts");
  const media = [{ path: "images/logos/mark.png", size: 5 }, { path: "images/2024/05/beach.jpg", size: 9 }, { path: "files/menu.pdf", size: 3 }];
  const ctx = {
    paths: [...media.map(item => item.path), "index.html"], items: media, pages: ["index.html"], components: {}, assertLive: () => {},
    read: async (path: string) => path === "index.html" ? '<img src="/images/logos/mark.png">' : undefined,
  } satisfies Pick<import("../src/page-builder/media-workspace.ts").MediaWorkspaceContext, "paths" | "items" | "pages" | "components" | "assertLive" | "read">;
  const report = JSON.parse(await listWorkspaceMedia(ctx as import("../src/page-builder/media-workspace.ts").MediaWorkspaceContext, { offset: 0, limit: 100 }));
  assert.equal(report.note, undefined);
  const byPath = Object.fromEntries(report.media.map((item: { path: string }) => [item.path, item]));
  assert.deepEqual(byPath["images/logos/mark.png"].collections, ["Logos"]);
  assert.equal(byPath["images/2024/05/beach.jpg"].collections, undefined);
  assert.equal(byPath["files/menu.pdf"].collections, undefined);
});


test("tab refuses upload-like writes and placement outside Media before mutations", async () => {
  const { applySiteCommand } = await import("../src/agent-site.ts");
  const { applyAgentMedia } = await import("../src/agent-media-actions.ts");
  const command = { id: "upload", operation: "write_file", path: "images/new.png", branch: "main", commit: "abc", content: "bytes", state: "pending", createdAt: 0 } satisfies import("../shared/agent.ts").AgentCommand;
  // Refusals run before any action port is needed.
  const ports = {} as import("../src/agent-site.ts").AgentSiteActions;
  await assert.rejects(applySiteCommand(ports, command), /never upload, fetch or generate/);
  const context = { items: [] } satisfies Pick<import("../src/page-builder/media-workspace.ts").MediaWorkspaceContext, "items">; // Membership refusal only reads items.
  await assert.rejects(applyAgentMedia(context as import("../src/page-builder/media-workspace.ts").MediaWorkspaceContext, { ...command, operation: "place_media", path: "index.html", args: { file: "images/outside.png", element: "0" } }, () => { throw new Error("Placement must not start"); }), /never upload, fetch or generate/);
});

test("Worker and tab share video tool argument rules", async () => {
  const { agentMediaArgsProblem: problem } = await import("../shared/agent-media-args");
  assert.equal(problem("place_media", { file: "https://youtu.be/dQw4w9WgXcQ?t=5", element: "0" }), undefined);
  for (const file of ["media/film.mp4", "media/sound.mp3", "files/menu.pdf", "files/archive.zip"])
    assert.equal(problem("place_media", { file, element: "0" }), undefined);
  for (const file of ["https://example.com/video.mp4", "data:video/mp4,x", "blob:x"])
    assert.match(problem("place_media", { file, element: "0" })!, /never upload/);
  assert.equal(problem("loop_video", { element: "0", looping: false }, "index.html"), undefined);
  assert.match(problem("loop_video", { element: "wrong" }, "index.html")!, /video element id/);
  assert.match(problem("video_still", { file: "media/film.mp4" })!, /exactly one/);
  assert.match(problem("video_still", { file: "media/film.mp4", picture: "images/a.png", moment: 1 })!, /exactly one/);
  for (const moment of [-1, Infinity, NaN]) assert.match(problem("video_still", { file: "media/film.mp4", moment })!, /seconds/);
  assert.match(problem("video_still", { file: "media/film.mp4", picture: "https://example.com/a.png" })!, /never upload/);
  assert.match(problem("video_still", { file: "media/film.mp4", picture: "media/sound.mp3" })!, /Choose a picture/);
  assert.match(problem("write_subtitles", { file: "images/a.png", text: "Hello" })!, /Only a video or audio/);
  assert.match(problem("write_subtitles", { file: "media/film.mp4", text: "é".repeat(1024 * 1024 + 1) })!, /2 MB/);
});
