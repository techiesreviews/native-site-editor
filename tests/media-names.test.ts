import { test } from "node:test";
import assert from "node:assert/strict";
import { tidyMediaName, mediaFileName, suggestMediaName, isRenamableMedia, MediaNameTakenError } from "../src/page-builder/media-names";
import { mediaStorageName, mediaKindFolder, mediaCopyName, chooseMediaPath } from "../src/page-builder/media-storage";

test("tidy basenames preserve languages, combining marks and actual formats", () => {
  for (const [input, output] of [
    [" --Holiday__ Photo!! .JPG", "holiday-photo.jpg"], ["Café Ölçü.png", "café-ölçü.png"],
    ["Cafe\u0301.png", "café.png"], ["東京 タワー.jpg", "東京-タワー.jpg"], ["नमस्ते.png", "नमस्ते.png"],
    ["Привет Мир.PNG", "привет-мир.png"], ["مرحبا عالم.jpg", "مرحبا-عالم.jpg"],
    ["😀.png", "media.png"], ["!!!", "media"], ["", "media"], ["a/b/c.jpg", "c.jpg"],
    ["C:\\x\\y.jpg", "y.jpg"], ["../../etc.png", "etc.png"],
  ]) assert.equal(tidyMediaName(input), output);
  assert.equal(mediaStorageName("a/Holiday Photo.JPG", "webp"), "holiday-photo.webp");
  assert.equal(mediaStorageName("photo", ".PNG"), "photo.png");
  assert.equal(mediaFileName("images/old.webp", "New Photo"), "new-photo.webp");
  assert.equal(mediaFileName("old.webp", "New.PNG"), "new.png");
  assert.equal(suggestMediaName("photo.webp", name => name === "photo-2.webp"), "photo-3.webp");
  assert.equal(isRenamableMedia("guide.PDF"), true);
  assert.equal(isRenamableMedia("archive.zip"), false);
  assert.equal(new MediaNameTakenError("a", "b").message, "a is taken. Try b.");
});

test("resulting kinds and standard or custom responsive widths", () => {
  for (const [extensions, folder] of [
    ["webp png svg gif", "media/images"], ["mp4 webm", "media/videos"], ["mp3 m4a", "media/audio"],
    ["pdf zip unknown", "media/downloads"],
  ]) for (const extension of extensions.split(" ")) assert.equal(mediaKindFolder("file." + extension), folder);
  for (const width of [480, 960, 1600]) assert.equal(mediaCopyName("holiday.webp", width), `holiday-${width}.webp`);
  assert.equal(mediaCopyName("holiday.webp", 1200), "holiday-1200w.webp");
});

test("a base is free across paths, formats, families and originals, ignoring case", () => {
  for (const paths of [
    ["media/images/holiday.webp"], ["media/images/holiday-480.webp"], ["media/images/holiday-960w.webp"],
    ["media/originals/holiday.jpg"], ["images/holiday.webp", "media/originals/holiday.jpg"],
    ["media/images/holiday.png"], ["MEDIA/IMAGES/HOLIDAY.WEBP"],
    ["media/images/holiday.webp/child.txt"],
  ]) assert.equal(chooseMediaPath({ folder: "media/images", name: "holiday.webp", copies: [], paths }), "media/images/holiday-2.webp");
  assert.equal(chooseMediaPath({ folder: "media/images", name: "photo-480.webp", copies: [], paths: ["media/images/photo.webp"] }), "media/images/photo-480-2.webp");
  assert.equal(chooseMediaPath({ folder: "", name: "holiday.webp", copies: [480], paths: ["holiday-480.webp"] }), "holiday-2.webp");
  assert.equal(chooseMediaPath({ folder: "elsewhere", name: "holiday.webp", copies: [], original: "jpg", paths: ["media/originals/holiday.jpg/child"] }), "elsewhere/holiday-2.webp");
});

test("numbered batch families reserve their main and every copy", () => {
  const paths = new Set<string>();
  for (const expected of ["holiday.webp", "holiday-2.webp", "holiday-3.webp"]) {
    const main = chooseMediaPath({ folder: "media/images", name: "holiday.webp", copies: [480, 960, 1600], paths });
    assert.equal(main, "media/images/" + expected);
    paths.add(main);
    for (const width of [480, 960, 1600]) paths.add(mediaCopyName(main, width));
  }
});
