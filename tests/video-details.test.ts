import { test } from "node:test";
import assert from "node:assert/strict";
import { addTrackInPage, mediaPlayers, readSubtitles, removeTrackInPage, setPosterInPage, srtToVtt, stillPathFor, subtitlesPathFor } from "../src/page-builder/video-details";
import { subtitlesWords } from "../src/page-builder/media-descriptions";
import { mediaTileStills } from "../src/page-builder/media-library-filter";
import { mediaFamilyOf } from "../src/page-builder/media-families";

test("a moment's still and subtitles are saved beside the file with its exact name, so they join its family", () => {
  assert.equal(stillPathFor("media/videos/holiday.mp4"), "media/videos/holiday.webp");
  assert.equal(subtitlesPathFor("media/audio/talk.mp3"), "media/audio/talk.vtt");
  const family = mediaFamilyOf("media/videos/holiday.mp4", ["media/videos/holiday.mp4", stillPathFor("media/videos/holiday.mp4"), subtitlesPathFor("media/videos/holiday.mp4")]);
  assert.equal(family?.still, "media/videos/holiday.webp");
  assert.deepEqual(family?.subtitles, ["media/videos/holiday.vtt"]);
});

test(".srt becomes WebVTT: times with dots, numbers kept, styling the web cannot show dropped", () => {
  const srt = "﻿1\r\n00:00:01,000 --> 00:00:02,500 X1:10 X2:20\r\n<font color=\"#fff\">Hello</font> & <i>welcome</i>\r\n{\\an8}Line two\r\n\r\n2\r\n0:00:03,5 --> 0:00:04,25\r\nA <tag> --> here\r\n\r\n";
  assert.equal(srtToVtt(srt), "WEBVTT\n\n1\n00:00:01.000 --> 00:00:02.500\nHello &amp; <i>welcome</i>\nLine two\n\n2\n00:00:03.500 --> 00:00:04.250\nA &lt;tag> --&gt; here\n");
  // Hours may be left out; cues without words or times are skipped.
  assert.equal(srtToVtt("00:01,000 --> 00:02,000\nShort\n\n3\n00:00:05,000 --> 00:00:06,000\n\nnot a cue"), "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nShort\n");
  assert.equal(srtToVtt("no subtitles here"), "");
  // Entities already written stay as they are.
  assert.match(srtToVtt("1\n00:00:01,000 --> 00:00:02,000\nTom &amp; Jerry"), /Tom &amp; Jerry/);
});

test("a chosen subtitles file is read as WebVTT, or says plainly why it cannot be used", () => {
  assert.deepEqual(readSubtitles("talk.vtt", "WEBVTT\r\n\r\n00:01.000 --> 00:02.000\r\nHi"), { vtt: "WEBVTT\n\n00:01.000 --> 00:02.000\nHi\n" });
  assert.deepEqual(readSubtitles("talk.VTT", "﻿WEBVTT - English\n\n00:01.000 --> 00:02.000\nHi\n"), { vtt: "WEBVTT - English\n\n00:01.000 --> 00:02.000\nHi\n" });
  assert.deepEqual(readSubtitles("talk.vtt", "WEBVTTX\n\n00:01.000 --> 00:02.000\nHi"), { problem: "talk.vtt is not a WebVTT subtitles file." });
  assert.deepEqual(readSubtitles("talk.vtt", "WEBVTT\n"), { problem: "talk.vtt has no subtitles in it." });
  assert.deepEqual(readSubtitles("talk.srt", "hello"), { problem: "talk.srt has no subtitles in it." });
  assert.deepEqual(readSubtitles("talk.txt", "WEBVTT"), { problem: "Choose a subtitles file ending in .vtt or .srt." });
  assert.deepEqual(readSubtitles("big.vtt", "WEBVTT\n" + "x".repeat(2 * 1024 * 1024)), { problem: "big.vtt is too large for a subtitles file." });
  assert.ok("vtt" in readSubtitles("talk.srt", "1\n00:00:01,000 --> 00:00:02,000\nHi"));
});

test("To check shows a subtitles file's words without times, numbers or notes", () => {
  assert.equal(subtitlesWords("WEBVTT\n\nNOTE made by an agent\n\n1\n00:01.000 --> 00:02.000\n<i>Hello</i> &amp;\nwelcome\n\n00:03.000 --> 00:04.000 line:0\nBye"), "Hello & welcome Bye");
});

test("the players of a file: its own src or one of its sources, video and audio, relative or root", () => {
  const page = '<video src="/media/videos/a.mp4"></video><video data-background src="../media/videos/a.mp4"></video>' +
    '<video><source src="/media/videos/a.mp4" type="video/mp4"></video><video src="/media/videos/b.mp4"></video><audio src="/media/videos/a.mp4"></audio>';
  assert.equal(mediaPlayers(page, "blog/post.html", "media/videos/a.mp4").length, 4);
});

test("a new still shows on every placed copy of the video; other attributes and videos stay", () => {
  const page = '<video src="/media/videos/a.mp4" poster="/media/videos/a.webp" controls preload="none"></video>\n' +
    '<video src="/media/videos/a.mp4" muted loop playsinline slot="image" style="object-position: 20% 30%"></video>\n' +
    '<video src="/media/videos/b.mp4" poster="/media/videos/b.webp"></video>\n<video><source src="/media/videos/a.mp4"></video>';
  const next = setPosterInPage(page, "index.html", "media/videos/a.mp4", "media/photos/my still.webp");
  assert.equal(next, '<video src="/media/videos/a.mp4" poster="/media/photos/my%20still.webp" controls preload="none"></video>\n' +
    '<video src="/media/videos/a.mp4" poster="/media/photos/my%20still.webp" muted loop playsinline slot="image" style="object-position: 20% 30%"></video>\n' +
    '<video src="/media/videos/b.mp4" poster="/media/videos/b.webp"></video>\n<video poster="/media/photos/my%20still.webp"><source src="/media/videos/a.mp4"></video>');
  // Already showing it (written relative): unchanged.
  const same = '<video src="a.mp4" poster="a.webp"></video>';
  assert.equal(setPosterInPage(same, "media/videos/page.html", "media/videos/a.mp4", "media/videos/a.webp"), same);
  // Audio has no still.
  assert.equal(setPosterInPage('<audio src="/a.mp4"></audio>', "index.html", "a.mp4", "a.webp"), '<audio src="/a.mp4"></audio>');
});

test("subtitles add a track in the page's language to every placed copy, after its sources, once", () => {
  const page = '<html lang="en-gb"><body><video src="/media/videos/a.mp4" controls></video>\n' +
    '<video controls><source src="/media/videos/a.mp4" type="video/mp4">Your browser cannot play this.</video>\n<audio src="/media/videos/a.mp4"></audio>';
  const next = addTrackInPage(page, "index.html", "media/videos/a.mp4", "media/videos/a.vtt");
  const track = '<track kind="subtitles" src="/media/videos/a.vtt" srclang="en-GB" label="British English">';
  assert.equal(next, `<html lang="en-gb"><body><video src="/media/videos/a.mp4" controls>${track}</video>\n` +
    `<video controls><source src="/media/videos/a.mp4" type="video/mp4">${track}Your browser cannot play this.</video>\n<audio src="/media/videos/a.mp4">${track}</audio>`);
  assert.equal(addTrackInPage(next, "index.html", "media/videos/a.mp4", "media/videos/a.vtt"), next);
  // Without a page language the track still works, labelled Subtitles.
  assert.equal(addTrackInPage('<video src="/a.mp4"></video>', "index.html", "a.mp4", "a.vtt"), '<video src="/a.mp4"><track kind="subtitles" src="/a.vtt" label="Subtitles"></video>');
});

test("removing subtitles takes out each of their tracks, with the track's own line", () => {
  const page = '<video src="/a.mp4">\r\n  <track kind="subtitles" src="/a.vtt" srclang="en">\r\n  <track kind="subtitles" src="/a.fr.vtt" srclang="fr">\r\n</video>\n' +
    '<audio src="/b.mp3"><track kind="subtitles" src="/a.vtt"></audio>';
  assert.equal(removeTrackInPage(page, "index.html", "a.vtt"),
    '<video src="/a.mp4">\r\n  <track kind="subtitles" src="/a.fr.vtt" srclang="fr">\r\n</video>\n<audio src="/b.mp3"></audio>');
});

test("tiles and details show a still picture chosen from Media while it is in the site", () => {
  const paths = ["media/videos/a.mp4", "media/videos/a.webp", "media/photos/b.webp"];
  assert.equal(mediaTileStills(paths).get("media/videos/a.mp4"), "media/videos/a.webp");
  assert.equal(mediaTileStills(paths, { "media/videos/a.mp4": { still: "media/photos/b.webp" } }).get("media/videos/a.mp4"), "media/photos/b.webp");
  assert.equal(mediaTileStills(paths, { "media/videos/a.mp4": { still: "media/photos/gone.webp" } }).get("media/videos/a.mp4"), "media/videos/a.webp");
});
