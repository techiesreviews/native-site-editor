import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { NATIVE_STARTER_VERSION } from "../shared/native-starter-version";
import { componentLoaderScript } from "../src/page-builder/component-loader";
import { addMediaPlayerLinks, audioMarkup, downloadCardMarkup, mediaPlayerPlan, pageMediaLanguage, pageMediaPlayer, videoMarkup, type MediaPlayerInput } from "../src/page-builder/player-markup";
import { starterPlayerFiles } from "../src/page-builder/starter-loader";

const COMPONENT_LOADER_SCRIPT = componentLoaderScript("");
const style = '<link rel="stylesheet" href="/styles/media-player.css">';
const script = '<script type="module" src="/scripts/media-player.js"></script>';
const both = { stylesheet: true, script: true };
const page = (lines = '<link rel="stylesheet" href="/styles/site.css">') => `<html lang="en">\n<head>\n  ${lines}\n</head>\n<body></body>\n</html>\n`;
const files = { "styles/media-player.css": "style bytes\n", "scripts/media-player.js": "player bytes\n", "scripts/media-online.js": "online bytes\n" };
function input(overrides: Partial<MediaPlayerInput> = {}): MediaPlayerInput {
  return { prefix: "", pages: ["index.html"], sources: { "index.html": page() }, exists: () => false, kinds: ["video"], ...overrides };
}

test("video exact markup, optional still, dimensions and name", () => {
  assert.deepEqual(videoMarkup({ path: "media/clip.mp4" }), { markup: '<video src="/media/clip.mp4" controls preload="none" playsinline></video>', notes: [] });
  assert.deepEqual(videoMarkup({ path: "media/clip.mp4", still: "media/clip.webp", width: 1280, height: 720, name: "Clip" }), {
    markup: '<video src="/media/clip.mp4" poster="/media/clip.webp" controls preload="none" playsinline width="1280" height="720" aria-label="Clip"></video>', notes: [],
  });
  assert.equal(videoMarkup({ path: "media/clip.mp4", width: NaN, height: -1 }).markup, videoMarkup({ path: "media/clip.mp4" }).markup);
});

test("audio exact markup and rounded duration", () => {
  assert.deepEqual(audioMarkup({ path: "media/talk.m4a" }), { markup: '<audio src="/media/talk.m4a" controls preload="none"></audio>', notes: [] });
  assert.equal(audioMarkup({ path: "media/talk.m4a", duration: 753.6, name: "Talk" }).markup,
    '<audio src="/media/talk.m4a" controls preload="none" data-duration="754" aria-label="Talk"></audio>');
  for (const duration of [undefined, NaN, Infinity, -Infinity, 0, -3])
    assert.equal(audioMarkup({ path: "media/talk.m4a", duration }).markup, audioMarkup({ path: "media/talk.m4a" }).markup);
});

test("PDF card exact markup, preview, Open and no download attribute", () => {
  assert.deepEqual(downloadCardMarkup({ path: "media/downloads/menu.PDF", name: "Menu", size: 245760, preview: { path: "media/menu.page-1.webp", width: 240, height: 340 } }), {
    markup: '<a class="download-card" href="/media/downloads/menu.PDF"><img src="/media/menu.page-1.webp" alt="" width="240" height="340" loading="lazy" decoding="async"><span class="download-card-name">Menu</span><span class="download-card-meta">PDF · 240 KB</span><span class="download-card-action">Open</span></a>', notes: [],
  });
});

test("other download card exact markup without preview, default filename and unknown size", () => {
  assert.deepEqual(downloadCardMarkup({ path: "media/downloads/source.zip" }), {
    markup: '<a class="download-card" href="/media/downloads/source.zip" download><span class="download-card-name">source</span><span class="download-card-meta">ZIP</span><span class="download-card-action">Download</span></a>', notes: [],
  });
  assert.equal(downloadCardMarkup({ path: "media/downloads/menu.pdf" }).markup,
    '<a class="download-card" href="/media/downloads/menu.pdf"><span class="download-card-name">menu</span><span class="download-card-meta">PDF</span><span class="download-card-action">Open</span></a>');
  for (const size of [NaN, Infinity, -1]) assert.doesNotMatch(downloadCardMarkup({ path: "media/downloads/a.zip", size }).markup, / · /);
  assert.match(downloadCardMarkup({ path: "media/downloads/a.zip", size: 0 }).markup, /ZIP · 0 B/);
});

test("writers escape attributes and card text, root and encode media URLs", () => {
  const name = 'A & "B" <C>';
  const escaped = 'A &amp; &quot;B&quot; &lt;C&gt;';
  assert.equal(videoMarkup({ path: 'media/a &".mp4', still: 'media/still &".webp', name }).markup,
    `<video src="/media/a%20%26%22.mp4" poster="/media/still%20%26%22.webp" controls preload="none" playsinline aria-label="${escaped}"></video>`);
  assert.match(audioMarkup({ path: "media/a.m4a", name }).markup, new RegExp(`aria-label="${escaped}"`));
  const card = downloadCardMarkup({ path: 'media/downloads/a &".zip', name, preview: { path: 'media/a &".webp' } }).markup;
  assert.ok(card.includes(`>${escaped}</span>`));
  assert.ok(card.includes('href="/media/downloads/a%20%26%22.zip"'));
  assert.ok(card.includes('src="/media/a%20%26%22.webp" alt="" loading="lazy" decoding="async"'));
});

test("WebVTT subtitles use page language and its display name, for video and audio", () => {
  const lang = pageMediaLanguage(page());
  assert.equal(lang, "en");
  const track = '<track kind="subtitles" src="/media/talk.VTT" srclang="en" label="English">';
  assert.equal(videoMarkup({ path: "media/clip.mp4", subtitles: { path: "media/talk.VTT" } }, lang).markup,
    `<video src="/media/clip.mp4" controls preload="none" playsinline>${track}</video>`);
  assert.equal(audioMarkup({ path: "media/talk.m4a", subtitles: { path: "media/talk.VTT" } }, lang).markup,
    `<audio src="/media/talk.m4a" controls preload="none">${track}</audio>`);
});

test("subtitles explicit language wins, labels escape, missing or invalid language is guarded", () => {
  const subtitles = { path: 'media/a &".vtt', lang: "nl", label: 'Dutch & "more"' };
  assert.ok(videoMarkup({ path: "media/a.mp4", subtitles }, "en").markup.includes('<track kind="subtitles" src="/media/a%20%26%22.vtt" srclang="nl" label="Dutch &amp; &quot;more&quot;">'));
  assert.match(audioMarkup({ path: "media/a.m4a", subtitles: { path: "media/a.vtt", lang: "nl" } }, "en").markup, /srclang="nl" label="Dutch"/);
  assert.match(videoMarkup({ path: "media/a.mp4", subtitles: { path: "media/a.vtt" } }).markup, /<track kind="subtitles" src="\/media\/a.vtt" label="Subtitles">/);
  assert.match(videoMarkup({ path: "media/a.mp4", subtitles: { path: "media/a.vtt", lang: 'invalid &"' } }).markup, /<track kind="subtitles" src="\/media\/a.vtt" label="Subtitles">/);
  assert.match(videoMarkup({ path: "media/a.mp4", subtitles: { path: "media/a.vtt", lang: "not a tag" } }, "en-gb").markup, /srclang="en-GB" label="British English"/);
  assert.match(videoMarkup({ path: "media/a.mp4", subtitles: { path: "media/a.vtt" } }, "x y").markup, /<track kind="subtitles" src="\/media\/a.vtt" label="Subtitles">/);
  assert.equal(pageMediaLanguage('<HTML LANG="nl"><head></head></HTML>'), "nl");
  assert.equal(pageMediaLanguage('<html><body></body></html>'), undefined);
  assert.equal(pageMediaLanguage('<template><html lang="fr"></html></template>'), undefined);
});

test("SRT and other subtitle files write no track and report a plain note", () => {
  for (const path of ["media/talk.srt", "media/talk.txt"])
    for (const result of [videoMarkup({ path: "media/a.mp4", subtitles: { path } }), audioMarkup({ path: "media/a.m4a", subtitles: { path } })]) {
      assert.doesNotMatch(result.markup, /<track/);
      assert.deepEqual(result.notes, ["Subtitles need a WebVTT (.vtt) file; this subtitles file was left out."]);
    }
});

test("player added once after last stylesheet, preserving CRLF and tabs", () => {
  const source = '<head>\r\n\t<link rel="stylesheet" href="/styles/site.css">\r\n\t<meta name="x">\r\n</head>';
  const expected = source.replace('\t<meta', `\t${style}\r\n\t${script}\r\n\t<meta`);
  assert.equal(addMediaPlayerLinks(source, "index.html", both), expected);
  assert.equal(addMediaPlayerLinks(expected, "index.html", both), expected);
  assert.deepEqual(pageMediaPlayer(expected, "index.html"), both);
});

test("script goes immediately after component loader, style after last stylesheet", () => {
  const source = page(`<link rel="stylesheet" href="/styles/site.css">\n  ${COMPONENT_LOADER_SCRIPT}\n  <meta name="x">`);
  const expected = source.replace('  ' + COMPONENT_LOADER_SCRIPT, `  ${style}\n  ${COMPONENT_LOADER_SCRIPT}\n  ${script}`);
  assert.equal(addMediaPlayerLinks(source, "index.html", both), expected);
});

test("existing relative module loader determines insertion position", () => {
  const loader = '<script type=" MODULE " src="../components/components.js?v=1#x"></script>';
  const source = page(`${loader}\n  <link rel="stylesheet" href="/styles/site.css">`);
  const next = addMediaPlayerLinks(source, "about/index.html", both)!;
  assert.ok(next.includes(`${loader}\n  ${script}\n  <link rel="stylesheet" href="/styles/site.css">\n  ${style}`));
});

test("head with no stylesheets and same-line tags uses loader's formatting", () => {
  assert.equal(addMediaPlayerLinks('<head>\n  <title>X</title>\n</head>', "index.html", both), `<head>\n  <title>X</title>\n  ${style}\n  ${script}\n</head>`);
  assert.equal(addMediaPlayerLinks('<head></head>', "index.html", both), `<head>\n${style}\n${script}\n</head>`);
  assert.equal(addMediaPlayerLinks('<head><link rel="stylesheet" href="a.css"><meta></head>', "index.html", both), `<head><link rel="stylesheet" href="a.css">\n${style}\n${script}\n<meta></head>`);
});

test("relative and root links, query strings, hashes and uppercase attributes count", () => {
  for (const [path, prefix] of [["index.html", "./"], ["about/index.html", "../"], ["about/index.html", "/"]]) {
    const source = page(`<LINK REL="alternate STYLESHEET" HREF="${prefix}styles/media-player.css?v=2#x">\n  <SCRIPT TYPE="MODULE" SRC="${prefix}scripts/media-player.js?cache=2#x"></SCRIPT>`);
    assert.deepEqual(pageMediaPlayer(source, path), both);
    assert.equal(addMediaPlayerLinks(source, path, both), source);
    assert.equal(mediaPlayerPlan(input({ pages: [path], sources: { [path]: source }, exists: () => true })), undefined);
  }
});

test("comments, noscript, template, body, external and classic scripts do not count", () => {
  for (const content of [`<!-- ${style}${script} -->`, `<noscript>${style}${script}</noscript>`, `<template>${style}${script}</template>`,
    '<link rel="stylesheet" href="https://example.com/styles/media-player.css"><script type="module" src="https://example.com/scripts/media-player.js"></script>']) {
    const source = page(`<link rel="stylesheet" href="/styles/site.css">\n  ${content}`);
    assert.deepEqual(pageMediaPlayer(source, "index.html"), { stylesheet: false, script: false });
    const next = addMediaPlayerLinks(source, "index.html", both)!;
    assert.deepEqual(pageMediaPlayer(next, "index.html"), both);
    if (!content.startsWith("<link")) assert.ok(next.indexOf(style + "\n") < next.indexOf(content));
  }
  assert.deepEqual(pageMediaPlayer(page().replace('<body>', `<body>${style}${script}`), "index.html"), { stylesheet: false, script: false });
  assert.equal(pageMediaPlayer(page('<script src="/scripts/media-player.js"></script>'), "index.html").script, false);
  assert.equal(pageMediaPlayer(page('<link rel="preload" href="/styles/media-player.css">'), "index.html").stylesheet, false);
});

test("download only adds stylesheet and creates no scripts", () => {
  const plan = mediaPlayerPlan(input({ kinds: ["download"], files }));
  assert.deepEqual(plan?.creates, [{ path: "styles/media-player.css", content: files["styles/media-player.css"] }]);
  assert.deepEqual(pageMediaPlayer(plan!.edits.get("index.html")!, "index.html"), { stylesheet: true, script: false });
  assert.equal(plan?.added, "Added the site's media player to the page (styles/media-player.css created).");
});

test("every player-driven kind lists required files first, then create exact vendored bytes", () => {
  for (const kinds of [["video"], ["audio"], ["download", "audio"], ["online-video"], ["looping-video"], ["background-video"]] satisfies MediaPlayerInput["kinds"][]) {
    const first = mediaPlayerPlan(input({ kinds }));
    assert.deepEqual(first?.creates, Object.keys(files).map(path => ({ path, content: "" })));
    const second = mediaPlayerPlan(input({ kinds, files }));
    assert.deepEqual(second?.creates, Object.entries(files).map(([path, content]) => ({ path, content })));
    assert.deepEqual(second?.edits, first?.edits);
  }
});

test("only missing files created; existing files never overwritten", () => {
  const plan = mediaPlayerPlan(input({ files, exists: path => path !== "scripts/media-player.js" }));
  assert.deepEqual(plan?.creates, [{ path: "scripts/media-player.js", content: files["scripts/media-player.js"] }]);
  assert.equal(plan?.added, "Added the site's media player to the page (scripts/media-player.js created).");
  assert.deepEqual([...plan!.edits.keys()], ["index.html"]);
  assert.deepEqual(mediaPlayerPlan(input({ exists: () => true }))?.creates, []);
  assert.throws(() => mediaPlayerPlan(input({ files: {} })), /could not be read/);
});

test("already linked page only repairs missing files, and no changes need no plan", () => {
  const sources = { "index.html": page(`${style}\n  ${script}`) };
  const repair = mediaPlayerPlan(input({ sources, files }));
  assert.equal(repair?.edits.size, 0);
  assert.deepEqual(repair?.pages, []);
  assert.equal(repair?.creates.length, 3);
  assert.equal(mediaPlayerPlan(input({ sources, exists: () => true })), undefined);
  assert.equal(mediaPlayerPlan(input({ kinds: [] })), undefined);
  assert.equal(mediaPlayerPlan(input({ pages: [] })), undefined);
});

test("partially linked pages add only the missing link; page list deduplicates", () => {
  const sources = { "style.html": page(style), "script.html": page(script), "done.html": page(`${style}\n  ${script}`) };
  const plan = mediaPlayerPlan(input({ pages: ["style.html", "style.html", "script.html", "done.html"], sources, exists: () => true }));
  assert.deepEqual(plan?.pages, ["style.html", "script.html"]);
  assert.equal(plan?.added, "Added the site's media player to 2 pages.");
  for (const [path, source] of plan!.edits) {
    assert.deepEqual(pageMediaPlayer(source, path), both);
    assert.equal(source.split(style).length, 2);
    assert.equal(source.split(script).length, 2);
  }
});

test("no head, unclosed head and unreadable pages get notes, no empty installation", () => {
  const sources = { "headless.html": "<body></body>", "unclosed.html": "<head><title>X</title>" };
  const plan = mediaPlayerPlan(input({ pages: [...Object.keys(sources), "unreadable.html"], sources }));
  assert.deepEqual(plan?.creates, []);
  assert.equal(plan?.edits.size, 0);
  assert.equal(plan?.added, "");
  assert.deepEqual(plan?.pages, []);
  assert.deepEqual(plan?.notes, [
    "headless.html has no head to place the media player in; the page was left out.",
    "unclosed.html has no head to place the media player in; the page was left out.",
    "unreadable.html could not be read, so the media player was not added to it.",
  ]);
  assert.equal(addMediaPlayerLinks(sources["headless.html"], "headless.html", both), undefined);
  const mixed = mediaPlayerPlan(input({ pages: ["index.html", "headless.html"], sources: { ...sources, "index.html": page() } }));
  assert.deepEqual(mixed?.pages, ["index.html"]);
  assert.equal(mixed?.creates.length, 3);
  assert.equal(mixed?.notes.length, 1);
});

test("starter player files read exact three vendored assets with fake fetcher", async () => {
  const requested: string[] = [];
  const root = `/native-static-starter/${NATIVE_STARTER_VERSION}/files/`;
  const fetcher: typeof fetch = async request => {
    assert.equal(typeof request, "string");
    const url = String(request);
    requested.push(url);
    return new Response(readFileSync(`public${url}`, "utf8"));
  };
  const result = await starterPlayerFiles(fetcher);
  assert.deepEqual(requested, Object.keys(files).map(path => `${root}${path}.asset`));
  for (const path of Object.keys(files)) assert.equal(result[path], readFileSync(`public${root}${path}.asset`, "utf8"));
});

test("any missing starter player asset rejects with a plain error", async () => {
  for (const path of Object.keys(files)) {
    const fetcher: typeof fetch = async request => String(request).endsWith(`${path}.asset`) ? new Response("missing", { status: 404 }) : new Response("bytes");
    await assert.rejects(starterPlayerFiles(fetcher), new RegExp(`The vendored media player file ${path} could not be read`));
  }
});

test("video, audio, subtitle and download addresses all carry the project prefix", () => {
  assert.equal(videoMarkup({ path: "media/a.mp4", still: "media/a.webp", subtitles: { path: "media/a.vtt", label: "Words" } }, undefined, "/my-site").markup,
    '<video src="/my-site/media/a.mp4" poster="/my-site/media/a.webp" controls preload="none" playsinline><track kind="subtitles" src="/my-site/media/a.vtt" label="Words"></video>');
  assert.equal(audioMarkup({ path: "media/a.mp3" }, undefined, "/my-site").markup, '<audio src="/my-site/media/a.mp3" controls preload="none"></audio>');
  assert.equal(downloadCardMarkup({ path: "media/a.pdf", preview: { path: "media/a.webp" } }, "/my-site").markup,
    '<a class="download-card" href="/my-site/media/a.pdf"><img src="/my-site/media/a.webp" alt="" loading="lazy" decoding="async"><span class="download-card-name">a</span><span class="download-card-meta">PDF</span><span class="download-card-action">Open</span></a>');
});

test("player installation writes prefixed links and recognises either existing spelling", () => {
  const installed = '<head>\n<link rel="stylesheet" href="/my-site/styles/media-player.css">\n<script type="module" src="/my-site/scripts/media-player.js"></script>\n</head>';
  assert.equal(addMediaPlayerLinks("<head></head>", "index.html", both, "/my-site"), installed);
  for (const source of [installed, installed.replaceAll("/my-site/", "/")]) {
    assert.deepEqual(pageMediaPlayer(source, "index.html", "/my-site"), both);
    assert.equal(addMediaPlayerLinks(source, "index.html", both, "/my-site"), source);
  }
  assert.equal(mediaPlayerPlan(input({ prefix: "/my-site", sources: { "index.html": "<head></head>" }, files }))?.edits.get("index.html"), installed);
});
