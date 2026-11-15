import assert from "node:assert/strict";
import test from "node:test";
import { keyList, keyMarkup } from "./key-options.ts";

// The Keyboard key part's options become markup: one class, one cap per key, the words escaped.

test("key: text splits at +, a list is kept, blanks are dropped", () => {
  assert.deepEqual(keyList("Ctrl+K"), ["Ctrl", "K"]);
  assert.deepEqual(keyList(" Ctrl + Shift + Z "), ["Ctrl", "Shift", "Z"]);
  assert.deepEqual(keyList(["Ctrl", "K"]), ["Ctrl", "K"]);
  assert.deepEqual(keyList(["Page Down"]), ["Page Down"], "a list keeps a key's own spaces");
  assert.deepEqual(keyList("Ctrl++"), ["Ctrl"], "a lone + is the separator");
  assert.deepEqual(keyList(""), []);
  assert.deepEqual(keyList(undefined), []);
});

test("key: one key is one cap, several are a group of caps, none is nothing", () => {
  assert.equal(keyMarkup("K"), '<kbd class="ui-key">K</kbd>');
  assert.equal(keyMarkup(["Page Down"]), '<kbd class="ui-key">Page Down</kbd>');
  assert.equal(keyMarkup("Ctrl+K"), '<kbd class="ui-key" data-combo><kbd>Ctrl</kbd><kbd>K</kbd></kbd>');
  assert.equal(keyMarkup(["⌘", ","]), '<kbd class="ui-key" data-combo><kbd>⌘</kbd><kbd>,</kbd></kbd>');
  assert.deepEqual(keyList(["Ctrl", "+"]), ["Ctrl", "+"], "a + key needs the list form");
  assert.equal(keyMarkup(["Ctrl", "+"]), '<kbd class="ui-key" data-combo><kbd>Ctrl</kbd><kbd>+</kbd></kbd>');
  assert.equal(keyMarkup(""), "");
  assert.equal(keyMarkup([" ", ""]), "");
  assert.equal(keyMarkup("<b>"), '<kbd class="ui-key">&lt;b&gt;</kbd>', "escaped");
});
