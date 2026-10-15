import test from "node:test";
import assert from "node:assert/strict";
import { mediaCardLabel, mediaCardLabelOf } from "../src/page-builder/rules/media-cards.ts";
import { nativeKindLabel } from "../src/native-structure.ts";

test("a media card is named as the edit bar and Page structure name it", () => {
  assert.equal(mediaCardLabel("a", "download-card"), "Download");
  assert.equal(mediaCardLabel("a", "online-video wide"), "Video");
  assert.equal(mediaCardLabel("a", "download-card-meta"), undefined);
  assert.equal(mediaCardLabel("span", "download-card"), undefined);
  assert.equal(nativeKindLabel("a", "x download-card"), "Download");
  assert.equal(nativeKindLabel("a", "online-video"), "Video");
  assert.equal(nativeKindLabel("a", "button-ish"), "Link");
});

test("any part of a card takes the card's name; other elements have none", () => {
  const meta = [{ tag: "span", className: "download-card-meta" }, { tag: "a", className: "download-card" }, { tag: "section", className: "flow" }];
  assert.equal(mediaCardLabelOf(meta), "Download");
  assert.equal(mediaCardLabelOf([{ tag: "img" }, { tag: "a", className: "online-video" }]), "Video");
  assert.equal(mediaCardLabelOf([{ tag: "span", className: "download-card-meta" }, { tag: "div" }]), undefined);
  assert.equal(mediaCardLabelOf([]), undefined);
});
